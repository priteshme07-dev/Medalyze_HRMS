import uuid
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import db, clean, iso, now_utc
from security import get_current_user, require, is_admin
from audit import log_audit, diff_fields

router = APIRouter(prefix="/settings", tags=["settings"])


class OrgSettingsBody(BaseModel):
    reason: str = "Settings update"
    data: dict


@router.get("/organization")
async def get_org(user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({"id": user["organization_id"]})
    return clean(org)


@router.put("/organization")
async def update_org(body: OrgSettingsBody, request: Request, admin: dict = Depends(require("settings.manage"))):
    org = await db.organizations.find_one({"id": admin["organization_id"]})
    allowed = {"name", "website", "timezone", "grace_minutes", "total_shift_minutes",
               "break_minutes", "productive_minutes", "departments", "designations", "leave_policy"}
    updates = {k: v for k, v in body.data.items() if k in allowed}
    before, after = diff_fields(org, {**org, **updates}, set(updates.keys()))
    await db.organizations.update_one({"id": admin["organization_id"]}, {"$set": {**updates, "updated_at": iso()}})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="SETTINGS_CHANGED",
                    entity_type="organization", entity_id=admin["organization_id"],
                    before=before, after=after, reason=body.reason, request=request)
    return clean(await db.organizations.find_one({"id": admin["organization_id"]}))


# ---- Leave types management ----
class LeaveTypeBody(BaseModel):
    name: str
    code: str
    annual_entitlement: float = 0
    carry_forward_allowed: bool = False
    carry_forward_limit: float = 0
    encashable: bool = False
    requires_documentation: bool = False
    active: bool = True


@router.get("/leave-types")
async def get_leave_types(user: dict = Depends(require("leave.type.manage"))):
    return [clean(t) for t in await db.leave_types.find({"organization_id": user["organization_id"]}).to_list(100)]


@router.post("/leave-types")
async def create_leave_type(body: LeaveTypeBody, request: Request, admin: dict = Depends(require("leave.type.manage"))):
    doc = {"id": str(uuid.uuid4()), "organization_id": admin["organization_id"], **body.model_dump(),
           "created_at": iso(), "updated_at": iso()}
    await db.leave_types.insert_one(doc)
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="LEAVE_TYPE_CREATED",
                    entity_type="leave_type", entity_id=doc["id"], after=clean(doc), request=request)
    return clean(doc)


@router.put("/leave-types/{tid}")
async def update_leave_type(tid: str, body: LeaveTypeBody, request: Request,
                            admin: dict = Depends(require("leave.type.manage"))):
    t = await db.leave_types.find_one({"id": tid, "organization_id": admin["organization_id"]})
    if not t:
        raise HTTPException(status_code=404, detail="Leave type not found")
    updates = {**body.model_dump(), "updated_at": iso()}
    before, after = diff_fields(t, {**t, **updates})
    await db.leave_types.update_one({"id": tid}, {"$set": updates})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="LEAVE_TYPE_UPDATED",
                    entity_type="leave_type", entity_id=tid, before=before, after=after, request=request)
    return clean(await db.leave_types.find_one({"id": tid}))
