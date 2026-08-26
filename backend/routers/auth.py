import uuid
import secrets
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from db import db, now_utc, iso, clean
from security import (hash_password, verify_password, create_access_token, create_refresh_token,
                      decode_token, get_current_user, has_perm, require)
from audit import log_audit
from notifications_service import create_notification

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_ATTEMPTS = 5
LOCKOUT_MIN = 15


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ChangePwBody(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    token: str
    new_password: str
    confirm_password: str


def set_auth_cookies(response: Response, user_id: str):
    at = create_access_token(user_id)
    rt = create_refresh_token(user_id)
    response.set_cookie("access_token", at, httponly=True, secure=True, samesite="none", max_age=60 * 60 * 8, path="/")
    response.set_cookie("refresh_token", rt, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return at


async def enrich(user: dict):
    org = await db.organizations.find_one({"id": user.get("organization_id")})
    u = clean(user)
    u["organization_name"] = org["name"] if org else None
    u["organization_timezone"] = org.get("timezone") if org else "Asia/Kolkata"
    return u


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    ident = f"{ip}:{email}"
    rec = await db.login_attempts.find_one({"identifier": ident})
    if rec and rec.get("count", 0) >= MAX_ATTEMPTS:
        locked_until = datetime_from(rec.get("locked_until"))
        if locked_until and locked_until > now_utc():
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        cnt = (rec.get("count", 0) if rec else 0) + 1
        locked = cnt >= MAX_ATTEMPTS
        await db.login_attempts.update_one(
            {"identifier": ident},
            {"$set": {"identifier": ident, "count": cnt,
                      "locked_until": _lock_iso() if locked else iso(now_utc().replace(microsecond=0))}},
            upsert=True)
        if locked:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": ident})
    set_auth_cookies(response, user["id"])
    await log_audit(organization_id=user.get("organization_id"), actor=user, action="LOGIN",
                    entity_type="user", entity_id=user["id"], request=request)
    return await enrich(user)


def _lock_iso():
    from datetime import timedelta
    return (now_utc() + timedelta(minutes=LOCKOUT_MIN)).isoformat()


def datetime_from(v):
    if not v:
        return None
    try:
        from datetime import datetime
        return datetime.fromisoformat(v)
    except Exception:
        return None


@router.post("/logout")
async def logout(request: Request, response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    await log_audit(organization_id=user.get("organization_id"), actor=user, action="LOGOUT",
                    entity_type="user", entity_id=user["id"], request=request)
    return {"message": "Logged out"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return await enrich(user)


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        at = create_access_token(payload["sub"])
        response.set_cookie("access_token", at, httponly=True, secure=True, samesite="none", max_age=60 * 60 * 8, path="/")
        return {"message": "refreshed"}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@router.post("/change-password")
async def change_password(body: ChangePwBody, request: Request, user: dict = Depends(get_current_user)):
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(body.current_password, full.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await log_audit(organization_id=user.get("organization_id"), actor=user, action="PASSWORD_CHANGED",
                    entity_type="user", entity_id=user["id"], request=request)
    return {"message": "Password changed successfully"}


@router.post("/forgot-password")
async def forgot_password(body: ForgotBody, request: Request):
    from datetime import timedelta
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    # Always return success to avoid enumeration
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()), "token_hash": hash_password(token), "user_id": user["id"],
            "email": email, "used": False,
            "expires_at": iso(now_utc() + timedelta(hours=1)), "created_at": iso(),
        })
        reset_link = f"/reset-password?token={token}"
        print(f"[PASSWORD RESET] {email} -> {reset_link}")
        await create_notification(organization_id=user.get("organization_id"), user_id=user["id"],
                                  ntype="password_reset", title="Password reset requested",
                                  message="A password reset was requested for your account.")
        await log_audit(organization_id=user.get("organization_id"), actor=user, action="PASSWORD_RESET_REQUESTED",
                        entity_type="user", entity_id=user["id"], request=request)
        return {"message": "If the email exists, a reset link has been sent.", "dev_token": token}
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(body: ResetBody, request: Request):
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    now = now_utc()
    async for rec in db.password_reset_tokens.find({"used": False}):
        if datetime_from(rec.get("expires_at")) and datetime_from(rec["expires_at"]) > now:
            if verify_password(body.token, rec["token_hash"]):
                await db.users.update_one({"id": rec["user_id"]},
                                          {"$set": {"password_hash": hash_password(body.new_password)}})
                await db.password_reset_tokens.update_one({"id": rec["id"]}, {"$set": {"used": True}})
                u = await db.users.find_one({"id": rec["user_id"]})
                await log_audit(organization_id=u.get("organization_id"), actor=u, action="PASSWORD_RESET",
                                entity_type="user", entity_id=u["id"], request=request)
                return {"message": "Password reset successful"}
    raise HTTPException(status_code=400, detail="Invalid or expired reset token")


class AdminResetBody(BaseModel):
    user_id: str


@router.post("/admin-trigger-reset")
async def admin_trigger_reset(body: AdminResetBody, request: Request,
                              admin: dict = Depends(require("password.reset.trigger"))):
    from datetime import timedelta
    user = await db.users.find_one({"id": body.user_id, "organization_id": admin["organization_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "id": str(uuid.uuid4()), "token_hash": hash_password(token), "user_id": user["id"],
        "email": user["email"], "used": False,
        "expires_at": iso(now_utc() + timedelta(hours=24)), "created_at": iso(),
    })
    await create_notification(organization_id=user["organization_id"], user_id=user["id"],
                              ntype="password_reset", title="Password reset initiated by admin",
                              message="An administrator initiated a password reset for your account.")
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="PASSWORD_RESET_TRIGGERED",
                    entity_type="user", entity_id=user["id"], reason="Admin-triggered reset", request=request)
    print(f"[ADMIN RESET] {user['email']} -> /reset-password?token={token}")
    return {"message": "Reset link generated for employee", "dev_token": token}
