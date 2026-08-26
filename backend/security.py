import os
import base64
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, Depends
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from db import db

JWT_ALG = "HS256"
ACCESS_MIN = 60 * 8
REFRESH_DAYS = 7


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_MIN)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_DAYS)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=[JWT_ALG])


# ---------------- AES-256-GCM encryption for portal credentials ----------------
def _enc_key() -> bytes:
    return bytes.fromhex(os.environ["ENCRYPTION_KEY"])


def encrypt_secret(plain: str) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(_enc_key()).encrypt(nonce, plain.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("utf-8")


def decrypt_secret(token: str) -> str:
    raw = base64.b64decode(token)
    return AESGCM(_enc_key()).decrypt(raw[:12], raw[12:], None).decode("utf-8")


# ---------------- Auth dependency ----------------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if user.get("status") == "inactive":
            raise HTTPException(status_code=403, detail="Account deactivated")
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------- RBAC ----------------
EMPLOYEE_PERMS = {
    "self.attendance", "self.break", "self.leave", "self.leave.balance.view",
    "self.holiday.view", "self.client.view", "self.profile", "self.password",
}
MANAGER_PERMS = EMPLOYEE_PERMS | {
    "employee.view", "attendance.view.team", "leave.request.approve",
    "leave.request.reject", "leave.balance.view", "team.view",
}
ORG_ADMIN_PERMS = MANAGER_PERMS | {
    "employee.create", "employee.edit", "employee.deactivate", "role.assign",
    "attendance.view.all", "attendance.edit", "shift.manage",
    "leave.balance.edit", "leave.balance.grant", "leave.balance.deduct",
    "leave.policy.edit", "leave.type.manage", "holiday.manage", "blackout.manage",
    "client.view.all", "client.manage", "client.portal.reveal", "client.assign",
    "report.view", "audit.view", "settings.manage", "notification.manage",
    "password.reset.trigger",
}
SUPER_ADMIN_PERMS = ORG_ADMIN_PERMS | {"org.manage", "system.settings", "system.audit.view", "user.manage.all"}

ROLE_PERMS = {
    "employee": EMPLOYEE_PERMS,
    "manager": MANAGER_PERMS,
    "org_admin": ORG_ADMIN_PERMS,
    "super_admin": SUPER_ADMIN_PERMS,
}


def has_perm(user: dict, perm: str) -> bool:
    if user.get("role") == "super_admin":
        return True
    perms = set(ROLE_PERMS.get(user.get("role"), set()))
    perms |= set(user.get("permissions") or [])
    return perm in perms


def require(*perms):
    async def dep(user: dict = Depends(get_current_user)):
        if not all(has_perm(user, p) for p in perms):
            raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
        return user
    return dep


def is_admin(user: dict) -> bool:
    return user.get("role") in ("org_admin", "super_admin")


def org_filter(user: dict) -> dict:
    """Tenant isolation filter. Super admin can pass org via query, others scoped."""
    if user.get("role") == "super_admin":
        return {}
    return {"organization_id": user["organization_id"]}
