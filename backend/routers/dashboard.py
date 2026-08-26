from fastapi import APIRouter, Depends
from datetime import timedelta
from db import db, now_utc, clean
from security import get_current_user, is_admin
from leave_engine import calculate_leave_balance

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def today_str():
    return now_utc().date().isoformat()


@router.get("/admin")
async def admin_dashboard(user: dict = Depends(get_current_user)):
    if not (is_admin(user) or user["role"] == "manager"):
        return {"error": "not_admin"}
    org = user["organization_id"]
    total = await db.users.count_documents({"organization_id": org, "status": "active"})
    td = today_str()
    atts = [clean(a) for a in await db.attendance.find({"organization_id": org, "date": td}).to_list(1000)]
    present = sum(1 for a in atts if a.get("status") == "present")
    late = sum(1 for a in atts if a.get("status") == "late_login")
    half = sum(1 for a in atts if a.get("status") == "half_day")
    incomplete = sum(1 for a in atts if a.get("status") == "incomplete_shift")
    breakv = sum(1 for a in atts if a.get("status") == "break_violation")
    working = sum(1 for a in atts if a.get("login_time") and not a.get("logout_time") and not a.get("on_break"))
    on_break = sum(1 for a in atts if a.get("on_break"))
    logged_ids = {a["user_id"] for a in atts if a.get("login_time")}
    absent = max(0, total - len(logged_ids))
    pending_leave = await db.leave_requests.count_documents(
        {"organization_id": org, "status": {"$in": ["pending_manager", "pending_hr"]}})
    approved = await db.leave_requests.count_documents({"organization_id": org, "status": "approved"})
    rejected = await db.leave_requests.count_documents({"organization_id": org, "status": "rejected"})
    # expiring comp-off (within 7 days) - simple heuristic via transactions
    return {
        "total_employees": total, "present": present, "late_login": late, "absent": absent,
        "half_day": half, "incomplete_shift": incomplete, "break_violations": breakv,
        "currently_working": working, "currently_on_break": on_break,
        "pending_leave_requests": pending_leave, "approved_leave": approved, "rejected_leave": rejected,
    }


@router.get("/employee")
async def employee_dashboard(user: dict = Depends(get_current_user)):
    org = user["organization_id"]
    att = await db.attendance.find_one({"user_id": user["id"], "date": today_str()})
    att = clean(att) if att else None
    balances = []
    yr = now_utc().year
    async for t in db.leave_types.find({"organization_id": org, "active": True}):
        bal = await calculate_leave_balance(org, user["id"], t["id"], yr)
        balances.append({"code": t["code"], "leave_type": t["name"], "available": bal["available_balance"]})
    upcoming = [clean(h) for h in await db.holidays.find(
        {"organization_id": org, "date": {"$gte": today_str()}}).sort("date", 1).limit(5).to_list(5)]
    pending = await db.leave_requests.count_documents(
        {"organization_id": org, "user_id": user["id"], "status": {"$in": ["pending_manager", "pending_hr"]}})
    return {"attendance": att, "balances": balances, "upcoming_holidays": upcoming, "pending_requests": pending}
