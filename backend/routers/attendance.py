import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from db import db, now_utc, iso, clean
from security import get_current_user, require, is_admin
from audit import log_audit, diff_fields
from attendance_engine import compute_attendance, DEFAULT_GRACE_MIN
from notifications_service import create_notification

router = APIRouter(prefix="/attendance", tags=["attendance"])


async def get_shift_snapshot(user):
    return {
        "scheduled_start": user.get("scheduled_start", "09:00"),
        "scheduled_end": user.get("scheduled_end", "18:00"),
        "break_minutes": 60,
        "productive_minutes": 480,
        "grace_minutes": DEFAULT_GRACE_MIN,
    }


def today_str():
    return now_utc().date().isoformat()


async def recompute(att):
    breaks = await db.breaks.find({"attendance_id": att["id"]}).to_list(100)
    login_t = datetime.fromisoformat(att["login_time"]) if att.get("login_time") else None
    logout_t = datetime.fromisoformat(att["logout_time"]) if att.get("logout_time") else None
    br = [{"start": b.get("start"), "end": b.get("end")} for b in breaks]
    metrics = compute_attendance(login_time=login_t, logout_time=logout_t, breaks=br,
                                 shift=att.get("shift_snapshot", {}),
                                 grace=att.get("shift_snapshot", {}).get("grace_minutes", DEFAULT_GRACE_MIN))
    await db.attendance.update_one({"id": att["id"]}, {"$set": {**metrics, "updated_at": iso()}})
    att.update(metrics)
    return att


@router.post("/login")
async def clock_in(request: Request, user: dict = Depends(get_current_user)):
    existing = await db.attendance.find_one({"user_id": user["id"], "date": today_str()})
    if existing and existing.get("login_time"):
        return await enrich_attendance(existing)
    snap = await get_shift_snapshot(user)
    now = now_utc()
    doc = existing or {"id": str(uuid.uuid4()), "organization_id": user["organization_id"],
                       "user_id": user["id"], "date": today_str(), "created_at": iso()}
    doc.update({
        "scheduled_login": snap["scheduled_start"],
        "login_time": now.isoformat(),
        "logout_time": None,
        "shift_snapshot": snap,
        "status": "present", "violation_type": None,
        "total_logged_minutes": 0, "total_break_minutes": 0,
        "productive_minutes": 0, "late_minutes": 0,
        "on_break": False, "updated_at": iso(),
    })
    await db.attendance.update_one({"id": doc["id"]}, {"$set": clean(doc)}, upsert=True)
    doc = await db.attendance.find_one({"id": doc["id"]})
    doc = await recompute(doc)
    if doc.get("late_minutes", 0) > 0:
        await create_notification(organization_id=user["organization_id"], user_id=user["id"],
                                  ntype="late_login", title="Late Login recorded",
                                  message=f"You logged in {doc['late_minutes']} minutes late.")
    await log_audit(organization_id=user["organization_id"], actor=user, action="ATTENDANCE_CREATED",
                    entity_type="attendance", entity_id=doc["id"], request=request)
    return await enrich_attendance(doc)


@router.post("/logout")
async def clock_out(request: Request, user: dict = Depends(get_current_user)):
    att = await db.attendance.find_one({"user_id": user["id"], "date": today_str()})
    if not att or not att.get("login_time"):
        raise HTTPException(status_code=400, detail="You have not clocked in today")
    if att.get("on_break"):
        raise HTTPException(status_code=400, detail="Please end your break before logging out")
    await db.attendance.update_one({"id": att["id"]}, {"$set": {"logout_time": now_utc().isoformat()}})
    att = await db.attendance.find_one({"id": att["id"]})
    att = await recompute(att)
    if att.get("status") == "incomplete_shift":
        await create_notification(organization_id=user["organization_id"], user_id=user["id"],
                                  ntype="incomplete_shift", title="Incomplete Shift",
                                  message="Your productive time today was below 8 hours.")
    await log_audit(organization_id=user["organization_id"], actor=user, action="ATTENDANCE_LOGOUT",
                    entity_type="attendance", entity_id=att["id"], request=request)
    return await enrich_attendance(att)


async def enrich_attendance(att):
    att = clean(att)
    breaks = [clean(b) for b in await db.breaks.find({"attendance_id": att["id"]}).sort("start", 1).to_list(100)]
    att["breaks"] = breaks
    return att


@router.get("/today")
async def today(user: dict = Depends(get_current_user)):
    att = await db.attendance.find_one({"user_id": user["id"], "date": today_str()})
    if not att:
        return {"date": today_str(), "login_time": None, "status": "not_started", "breaks": []}
    return await enrich_attendance(att)


@router.get("")
async def list_attendance(user: dict = Depends(get_current_user),
                          user_id: Optional[str] = None, date_from: Optional[str] = None,
                          date_to: Optional[str] = None, status: Optional[str] = None):
    q = {"organization_id": user["organization_id"]}
    if is_admin(user) or user["role"] == "manager":
        if user_id:
            q["user_id"] = user_id
        elif user["role"] == "manager" and not is_admin(user):
            team = [u["id"] async for u in db.users.find({"manager_id": user["id"]})]
            q["user_id"] = {"$in": team}
    else:
        q["user_id"] = user["id"]
    if date_from and date_to:
        q["date"] = {"$gte": date_from, "$lte": date_to}
    if status:
        q["status"] = status
    items = []
    async for a in db.attendance.find(q).sort("date", -1).limit(500):
        a = clean(a)
        u = await db.users.find_one({"id": a["user_id"]})
        a["employee_name"] = f"{u['first_name']} {u['last_name']}" if u else "Unknown"
        a["employee_code"] = u.get("employee_code") if u else None
        items.append(a)
    return items


class AttendanceEdit(BaseModel):
    reason: str
    data: dict


@router.put("/{att_id}")
async def edit_attendance(att_id: str, body: AttendanceEdit, request: Request,
                          admin: dict = Depends(require("attendance.edit"))):
    att = await db.attendance.find_one({"id": att_id, "organization_id": admin["organization_id"]})
    if not att:
        raise HTTPException(status_code=404, detail="Attendance not found")
    allowed = {"login_time", "logout_time", "status", "scheduled_login"}
    updates = {k: v for k, v in body.data.items() if k in allowed}
    before, after = diff_fields(att, {**att, **updates}, set(updates.keys()))
    await db.attendance.update_one({"id": att_id}, {"$set": {**updates, "updated_at": iso()}})
    att = await db.attendance.find_one({"id": att_id})
    if "status" not in updates:
        att = await recompute(att)
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="ATTENDANCE_EDITED",
                    entity_type="attendance", entity_id=att_id, before=before, after=after,
                    reason=body.reason, request=request)
    return clean(att)


# -------- Breaks --------
break_router = APIRouter(prefix="/breaks", tags=["breaks"])


@break_router.post("/start")
async def start_break(request: Request, user: dict = Depends(get_current_user)):
    att = await db.attendance.find_one({"user_id": user["id"], "date": today_str()})
    if not att or not att.get("login_time"):
        raise HTTPException(status_code=400, detail="Clock in before starting a break")
    if att.get("on_break"):
        raise HTTPException(status_code=400, detail="A break is already in progress")
    doc = {"id": str(uuid.uuid4()), "organization_id": user["organization_id"],
           "attendance_id": att["id"], "user_id": user["id"],
           "start": now_utc().isoformat(), "end": None, "duration_minutes": 0, "created_at": iso()}
    await db.breaks.insert_one(doc)
    await db.attendance.update_one({"id": att["id"]}, {"$set": {"on_break": True}})
    await log_audit(organization_id=user["organization_id"], actor=user, action="BREAK_STARTED",
                    entity_type="break", entity_id=doc["id"], request=request)
    return clean(doc)


@break_router.post("/end")
async def end_break(request: Request, user: dict = Depends(get_current_user)):
    att = await db.attendance.find_one({"user_id": user["id"], "date": today_str()})
    if not att or not att.get("on_break"):
        raise HTTPException(status_code=400, detail="No break in progress")
    # ✅ FIX: Add organization_id filter to query
    b = await db.breaks.find_one({"attendance_id": att["id"], "end": None, "organization_id": user["organization_id"]})
    if not b:
        raise HTTPException(status_code=400, detail="No active break found")
    # ✅ FIX: Validate start timestamp exists and is not null
    if not b.get("start"):
        raise HTTPException(status_code=400, detail="Break start timestamp is missing")
    # ✅ FIX: Handle invalid timestamp format
    try:
        start_dt = datetime.fromisoformat(b["start"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid break start timestamp format")
    
    end = now_utc()
    dur = round((end - start_dt).total_seconds() / 60.0)
    # ✅ FIX: Add updated_at timestamp to maintain audit trail
    await db.breaks.update_one({"id": b["id"]}, {"$set": {"end": end.isoformat(), "duration_minutes": dur, "updated_at": iso()}})
    await db.attendance.update_one({"id": att["id"]}, {"$set": {"on_break": False}})
    att = await db.attendance.find_one({"id": att["id"]})
    att = await recompute(att)
    if att.get("total_break_minutes", 0) > 60:
        await create_notification(organization_id=user["organization_id"], user_id=user["id"],
                                  ntype="break_violation", title="Break Violation",
                                  message=f"Total break time is {att['total_break_minutes']} minutes (limit 60).")
    await log_audit(organization_id=user["organization_id"], actor=user, action="BREAK_ENDED",
                    entity_type="break", entity_id=b["id"], request=request)
    return await enrich_attendance(att)


@break_router.get("/today")
async def breaks_today(user: dict = Depends(get_current_user)):
    att = await db.attendance.find_one({"user_id": user["id"], "date": today_str()})
    if not att:
        return []
    return [clean(b) for b in await db.breaks.find({"attendance_id": att["id"]}).sort("start", 1).to_list(100)]
