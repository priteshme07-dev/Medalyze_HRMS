import uuid
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, field_validator
from typing import Optional
from db import db, now_utc, iso, clean
from security import get_current_user, require
from audit import log_audit, diff_fields

router = APIRouter(prefix="/holidays", tags=["holidays"])


class HolidayBody(BaseModel):
    name: str
    date: str
    type: str = "company"  # mandatory | company | optional | us_aligned | custom
    optional: bool = False
    description: Optional[str] = None

    # ✅ FIX: reject blank name/date instead of silently accepting them (finding: "Add Holiday
    # saves successfully with an empty name and no date").
    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v):
        if not v or not v.strip():
            raise ValueError("Holiday name is required")
        return v.strip()

    @field_validator("date")
    @classmethod
    def date_must_be_valid(cls, v):
        if not v or not v.strip():
            raise ValueError("Holiday date is required")
        try:
            datetime.strptime(v.strip(), "%Y-%m-%d")
        except ValueError:
            raise ValueError("Holiday date must be a valid YYYY-MM-DD date")
        return v.strip()


@router.get("")
async def list_holidays(user: dict = Depends(get_current_user), year: Optional[int] = None):
    q = {"organization_id": user["organization_id"]}
    hols = [clean(h) for h in await db.holidays.find(q).sort("date", 1).to_list(500)]
    if year:
        hols = [h for h in hols if h["date"][:4] == str(year)]
    return hols


@router.post("")
async def add_holiday(body: HolidayBody, request: Request, admin: dict = Depends(require("holiday.manage"))):
    doc = {"id": str(uuid.uuid4()), "organization_id": admin["organization_id"], "name": body.name,
           "date": body.date, "type": body.type, "optional": body.optional or body.type == "optional",
           "description": body.description, "created_at": iso(), "updated_at": iso()}
    await db.holidays.insert_one(doc)
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="HOLIDAY_CREATED",
                     entity_type="holiday", entity_id=doc["id"], after=clean(doc), request=request)
    return clean(doc)


@router.put("/{hid}")
async def edit_holiday(hid: str, body: HolidayBody, request: Request, admin: dict = Depends(require("holiday.manage"))):
    h = await db.holidays.find_one({"id": hid, "organization_id": admin["organization_id"]})
    if not h:
        raise HTTPException(status_code=404, detail="Holiday not found")
    updates = {"name": body.name, "date": body.date, "type": body.type,
               "optional": body.optional or body.type == "optional", "description": body.description, "updated_at": iso()}
    before, after = diff_fields(h, {**h, **updates})
    await db.holidays.update_one({"id": hid}, {"$set": updates})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="HOLIDAY_UPDATED",
                     entity_type="holiday", entity_id=hid, before=before, after=after, request=request)
    return clean(await db.holidays.find_one({"id": hid}))


@router.delete("/{hid}")
async def del_holiday(hid: str, request: Request, admin: dict = Depends(require("holiday.manage"))):
    h = await db.holidays.find_one({"id": hid, "organization_id": admin["organization_id"]})
    if not h:
        raise HTTPException(status_code=404, detail="Holiday not found")
    await db.holidays.delete_one({"id": hid})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="HOLIDAY_DELETED",
                     entity_type="holiday", entity_id=hid, before=clean(h), request=request)
    return {"message": "Holiday removed"}


# -------- Blackout periods --------
bo_router = APIRouter(prefix="/blackouts", tags=["blackouts"])


class BlackoutBody(BaseModel):
    reason: str
    start_date: str
    end_date: str
    leave_type_codes: Optional[list] = None
    restrict: bool = False


@bo_router.get("")
async def list_blackouts(user: dict = Depends(get_current_user)):
    return [clean(b) for b in await db.blackout_periods.find(
        {"organization_id": user["organization_id"]}).sort("start_date", 1).to_list(200)]


@bo_router.post("")
async def add_blackout(body: BlackoutBody, request: Request, admin: dict = Depends(require("blackout.manage"))):
    doc = {"id": str(uuid.uuid4()), "organization_id": admin["organization_id"], **body.model_dump(),
           "created_at": iso()}
    await db.blackout_periods.insert_one(doc)
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="BLACKOUT_CREATED",
                     entity_type="blackout", entity_id=doc["id"], after=clean(doc), request=request)
    return clean(doc)


@bo_router.delete("/{bid}")
async def del_blackout(bid: str, request: Request, admin: dict = Depends(require("blackout.manage"))):
    await db.blackout_periods.delete_one({"id": bid, "organization_id": admin["organization_id"]})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="BLACKOUT_DELETED",
                     entity_type="blackout", entity_id=bid, request=request)
    return {"message": "Blackout removed"}
