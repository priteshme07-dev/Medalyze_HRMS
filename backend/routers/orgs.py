import uuid
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import db, clean, iso
from security import require, hash_password
from audit import log_audit

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrgBody(BaseModel):
    name: str
    website: Optional[str] = "www.medalyzeus.com"
    timezone: Optional[str] = "Asia/Kolkata"
    admin_email: str
    admin_password: str
    admin_first_name: str = "Org"
    admin_last_name: str = "Admin"


@router.get("")
async def list_orgs(user: dict = Depends(require("org.manage"))):
    out = []
    async for o in db.organizations.find().sort("created_at", -1):
        o = clean(o)
        o["user_count"] = await db.users.count_documents({"organization_id": o["id"]})
        out.append(o)
    return out


@router.post("")
async def create_org(body: OrgBody, request: Request, sa: dict = Depends(require("org.manage"))):
    if await db.users.find_one({"email": body.admin_email.lower().strip()}):
        raise HTTPException(status_code=400, detail="Admin email already exists")
    org_id = str(uuid.uuid4())
    org = {"id": org_id, "name": body.name, "website": body.website, "timezone": body.timezone,
           "grace_minutes": 15, "total_shift_minutes": 540, "break_minutes": 60, "productive_minutes": 480,
           "departments": ["Operations", "Billing", "RCM", "HR", "IT"],
           "designations": ["Executive", "Senior Executive", "Team Lead", "Manager"],
           "subscription": "active", "created_at": iso(), "updated_at": iso()}
    await db.organizations.insert_one(org)
    admin = {"id": str(uuid.uuid4()), "organization_id": org_id, "email": body.admin_email.lower().strip(),
             "password_hash": hash_password(body.admin_password), "first_name": body.admin_first_name,
             "last_name": body.admin_last_name, "role": "org_admin", "status": "active",
             "timezone": body.timezone, "scheduled_start": "09:00", "scheduled_end": "18:00",
             "working_days_idx": [0, 1, 2, 3, 4], "employee_code": "MED1000", "created_at": iso()}
    await db.users.insert_one(admin)
    await log_audit(organization_id=org_id, actor=sa, action="ORGANIZATION_CREATED",
                    entity_type="organization", entity_id=org_id, after={"name": body.name}, request=request)
    return clean(org)


@router.get("/all-users")
async def all_users(sa: dict = Depends(require("user.manage.all"))):
    out = []
    async for u in db.users.find().sort("created_at", -1):
        org = await db.organizations.find_one({"id": u.get("organization_id")})
        u = clean(u)
        u["organization_name"] = org["name"] if org else None
        out.append(u)
    return out
