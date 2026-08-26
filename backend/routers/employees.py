import uuid
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from db import db, now_utc, iso, clean
from security import hash_password, get_current_user, require, has_perm, is_admin
from audit import log_audit, diff_fields
from notifications_service import create_notification

router = APIRouter(prefix="/employees", tags=["employees"])

EDITABLE = ["first_name", "last_name", "email", "phone", "department", "designation",
            "role", "manager_id", "joining_date", "date_of_birth", "status", "timezone",
            "shift_id", "scheduled_start", "scheduled_end", "working_days", "working_days_idx",
            "employee_code", "custom_fields"]


class EmployeeCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: Optional[str] = "Medalyze@123"
    phone: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    role: str = "employee"
    manager_id: Optional[str] = None
    joining_date: Optional[str] = None
    date_of_birth: Optional[str] = None
    timezone: Optional[str] = "Asia/Kolkata"
    shift_id: Optional[str] = None
    scheduled_start: Optional[str] = "09:00"
    scheduled_end: Optional[str] = "18:00"
    working_days: Optional[List[str]] = None
    working_days_idx: Optional[List[int]] = None
    employee_code: Optional[str] = None
    custom_fields: Optional[dict] = None


class EmployeeUpdate(BaseModel):
    reason: Optional[str] = "Employee record update"
    data: dict


def public_user(u):
    u = clean(u)
    return u


@router.get("")
async def list_employees(request: Request, user: dict = Depends(get_current_user),
                         search: Optional[str] = None, department: Optional[str] = None,
                         status: Optional[str] = None):
    q = {"organization_id": user["organization_id"]}
    if user["role"] == "manager" and not is_admin(user):
        q["manager_id"] = user["id"]
    if not (is_admin(user) or user["role"] == "manager"):
        raise HTTPException(status_code=403, detail="Not permitted")
    if department:
        q["department"] = department
    if status:
        q["status"] = status
    if search:
        q["$or"] = [{"first_name": {"$regex": search, "$options": "i"}},
                    {"last_name": {"$regex": search, "$options": "i"}},
                    {"email": {"$regex": search, "$options": "i"}},
                    {"employee_code": {"$regex": search, "$options": "i"}}]
    items = [public_user(u) async for u in db.users.find(q).sort("first_name", 1)]
    return items


@router.get("/managers")
async def list_managers(user: dict = Depends(get_current_user)):
    q = {"organization_id": user["organization_id"], "role": {"$in": ["manager", "org_admin"]}}
    return [{"id": u["id"], "name": f"{u['first_name']} {u['last_name']}", "role": u["role"]}
            async for u in db.users.find(q)]


@router.get("/{emp_id}")
async def get_employee(emp_id: str, user: dict = Depends(get_current_user)):
    if not is_admin(user) and user["id"] != emp_id and user["role"] != "manager":
        raise HTTPException(status_code=403, detail="Not permitted")
    u = await db.users.find_one({"id": emp_id, "organization_id": user["organization_id"]})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    return public_user(u)


@router.post("")
async def create_employee(body: EmployeeCreate, request: Request,
                          admin: dict = Depends(require("employee.create"))):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    count = await db.users.count_documents({"organization_id": admin["organization_id"]})
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": admin["organization_id"],
        "email": email,
        "password_hash": hash_password(body.password or "Medalyze@123"),
        "first_name": body.first_name, "last_name": body.last_name,
        "phone": body.phone, "department": body.department, "designation": body.designation,
        "role": body.role, "manager_id": body.manager_id,
        "joining_date": body.joining_date, "date_of_birth": body.date_of_birth,
        "status": "active", "timezone": body.timezone or "Asia/Kolkata",
        "shift_id": body.shift_id, "scheduled_start": body.scheduled_start or "09:00",
        "scheduled_end": body.scheduled_end or "18:00",
        "working_days": body.working_days or ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "working_days_idx": body.working_days_idx or [0, 1, 2, 3, 4],
        "employee_code": body.employee_code or f"MED{1000 + count + 1}",
        "custom_fields": body.custom_fields or {},
        "created_at": iso(), "updated_at": iso(),
    }
    await db.users.insert_one(doc)
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="EMPLOYEE_CREATED",
                    entity_type="employee", entity_id=doc["id"], after=public_user(doc),
                    reason="New employee onboarding", request=request)
    await create_notification(organization_id=admin["organization_id"], user_id=doc["id"],
                              ntype="admin_announcement", title="Welcome to Medalyze HRMS",
                              message="Your employee account has been created.")
    return public_user(doc)


@router.put("/{emp_id}")
async def update_employee(emp_id: str, body: EmployeeUpdate, request: Request,
                          admin: dict = Depends(require("employee.edit"))):
    u = await db.users.find_one({"id": emp_id, "organization_id": admin["organization_id"]})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    updates = {k: v for k, v in body.data.items() if k in EDITABLE}
    if "email" in updates:
        updates["email"] = updates["email"].lower().strip()
    before, after = diff_fields(u, {**u, **updates}, set(updates.keys()))
    if not updates:
        raise HTTPException(status_code=400, detail="No editable fields provided")
    updates["updated_at"] = iso()
    await db.users.update_one({"id": emp_id}, {"$set": updates})
    action = "EMPLOYEE_UPDATED"
    if "role" in updates:
        action = "ROLE_CHANGED"
    await log_audit(organization_id=admin["organization_id"], actor=admin, action=action,
                    entity_type="employee", entity_id=emp_id, before=before, after=after,
                    reason=body.reason, request=request)
    nu = await db.users.find_one({"id": emp_id})
    return public_user(nu)


@router.delete("/{emp_id}")
async def deactivate_employee(emp_id: str, request: Request,
                              admin: dict = Depends(require("employee.deactivate")),
                              reason: str = Query("Employee deactivated")):
    u = await db.users.find_one({"id": emp_id, "organization_id": admin["organization_id"]})
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found")
    new_status = "inactive" if u.get("status") == "active" else "active"
    await db.users.update_one({"id": emp_id}, {"$set": {"status": new_status, "updated_at": iso()}})
    await log_audit(organization_id=admin["organization_id"], actor=admin,
                    action="EMPLOYEE_DEACTIVATED" if new_status == "inactive" else "EMPLOYEE_REACTIVATED",
                    entity_type="employee", entity_id=emp_id,
                    before={"status": u.get("status")}, after={"status": new_status},
                    reason=reason, request=request)
    return {"message": f"Employee {new_status}", "status": new_status}
