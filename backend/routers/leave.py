import uuid
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from db import db, now_utc, iso, clean
from security import get_current_user, require, is_admin
from audit import log_audit
from leave_engine import (validate_leave_request, calculate_leave_balance, add_transaction, working_days)
from notifications_service import create_notification, notify_role

router = APIRouter(prefix="/leave", tags=["leave"])


class LeaveValidateBody(BaseModel):
    leave_type_id: str
    start_date: str
    end_date: str


class LeaveRequestBody(BaseModel):
    leave_type_id: str
    start_date: str
    end_date: str
    reason: str
    additional_comments: Optional[str] = None
    documentation_url: Optional[str] = None


class ApproveBody(BaseModel):
    comment: Optional[str] = None


class RejectBody(BaseModel):
    reason: str


class AdjustBody(BaseModel):
    leave_type_id: str
    amount: float
    transaction_type: str = "ADJUSTMENT"
    reason: str
    year: Optional[int] = None


@router.get("/types")
async def leave_types(user: dict = Depends(get_current_user)):
    return [clean(t) async for t in db.leave_types.find(
        {"organization_id": user["organization_id"], "active": True}).sort("name", 1)]


@router.get("/balances")
async def my_balances(user: dict = Depends(get_current_user), user_id: Optional[str] = None,
                      year: Optional[int] = None):
    target = user["id"]
    if user_id and (is_admin(user) or user["role"] == "manager"):
        target = user_id
    yr = year or now_utc().year
    out = []
    async for t in db.leave_types.find({"organization_id": user["organization_id"], "active": True}):
        bal = await calculate_leave_balance(user["organization_id"], target, t["id"], yr)
        out.append({"leave_type_id": t["id"], "leave_type": t["name"], "code": t["code"],
                    "annual_entitlement": t.get("annual_entitlement"), **bal})
    return out


@router.get("/balances/{user_id}")
async def get_balances(user_id: str, user: dict = Depends(require("leave.balance.view")),
                       year: Optional[int] = None):
    yr = year or now_utc().year
    out = []
    async for t in db.leave_types.find({"organization_id": user["organization_id"], "active": True}):
        bal = await calculate_leave_balance(user["organization_id"], user_id, t["id"], yr)
        out.append({"leave_type_id": t["id"], "leave_type": t["name"], "code": t["code"], **bal})
    return out


@router.get("/balances/{user_id}/ledger")
async def balance_ledger(user_id: str, user: dict = Depends(require("leave.balance.view")),
                         leave_type_id: Optional[str] = None):
    q = {"organization_id": user["organization_id"], "user_id": user_id}
    if leave_type_id:
        q["leave_type_id"] = leave_type_id
    txns = [clean(t) for t in await db.leave_transactions.find(q).sort("created_at", -1).to_list(500)]
    types = {t["id"]: t["name"] async for t in db.leave_types.find({"organization_id": user["organization_id"]})}
    for t in txns:
        t["leave_type_name"] = types.get(t["leave_type_id"], "")
    return txns


@router.post("/balances/{user_id}/adjust")
async def adjust_balance(user_id: str, body: AdjustBody, request: Request,
                         admin: dict = Depends(require("leave.balance.edit"))):
    if not body.reason or not body.reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required for balance adjustments")
    emp = await db.users.find_one({"id": user_id, "organization_id": admin["organization_id"]})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    lt = await db.leave_types.find_one({"id": body.leave_type_id, "organization_id": admin["organization_id"]})
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    yr = body.year or now_utc().year
    before = await calculate_leave_balance(admin["organization_id"], user_id, body.leave_type_id, yr)
    txn = await add_transaction(organization_id=admin["organization_id"], user_id=user_id,
                                leave_type_id=body.leave_type_id, year=yr,
                                transaction_type=body.transaction_type, amount=body.amount,
                                reason=body.reason,
                                created_by={"id": admin["id"], "name": f"{admin['first_name']} {admin['last_name']}"})
    after = await calculate_leave_balance(admin["organization_id"], user_id, body.leave_type_id, yr)
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="LEAVE_BALANCE_MODIFIED",
                    entity_type="leave_balance", entity_id=user_id,
                    before={"available_balance": before["available_balance"]},
                    after={"available_balance": after["available_balance"], "adjustment": body.amount,
                           "leave_type": lt["name"]},
                    reason=body.reason, request=request)
    await create_notification(organization_id=admin["organization_id"], user_id=user_id,
                              ntype="leave_balance_changed", title="Leave balance updated",
                              message=f"{lt['name']} adjusted by {body.amount:+g}. Reason: {body.reason}")
    return {"transaction": txn, "new_balance": after}


@router.post("/validate")
async def validate(body: LeaveValidateBody, user: dict = Depends(get_current_user)):
    lt = await db.leave_types.find_one({"id": body.leave_type_id, "organization_id": user["organization_id"]})
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    full = await db.users.find_one({"id": user["id"]})
    res = await validate_leave_request(organization_id=user["organization_id"], user=full,
                                       leave_type=lt, start_date=body.start_date, end_date=body.end_date)
    return res


@router.get("/requests")
async def list_requests(user: dict = Depends(get_current_user), scope: Optional[str] = None,
                        status: Optional[str] = None, department: Optional[str] = None):
    q = {"organization_id": user["organization_id"]}
    if scope == "team" or (user["role"] == "manager" and not is_admin(user) and scope != "mine"):
        if is_admin(user) and scope != "team":
            pass
        else:
            team = [u["id"] async for u in db.users.find({"manager_id": user["id"]})]
            q["$or"] = [{"manager_id": user["id"]}, {"user_id": {"$in": team}}]
    if not is_admin(user) and user["role"] != "manager":
        q = {"organization_id": user["organization_id"], "user_id": user["id"]}
    if scope == "mine":
        q = {"organization_id": user["organization_id"], "user_id": user["id"]}
    if status:
        q["status"] = status
    out = []
    async for r in db.leave_requests.find(q).sort("created_at", -1).limit(500):
        out.append(await enrich_request(r))
    return out


async def enrich_request(r):
    r = clean(r)
    u = await db.users.find_one({"id": r["user_id"]})
    lt = await db.leave_types.find_one({"id": r["leave_type_id"]})
    r["employee_name"] = f"{u['first_name']} {u['last_name']}" if u else "Unknown"
    r["department"] = u.get("department") if u else None
    r["leave_type_name"] = lt["name"] if lt else ""
    r["leave_type_code"] = lt["code"] if lt else ""
    return r


@router.get("/requests/{req_id}")
async def get_request(req_id: str, user: dict = Depends(get_current_user)):
    r = await db.leave_requests.find_one({"id": req_id, "organization_id": user["organization_id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if not is_admin(user) and user["role"] != "manager" and r["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not permitted")
    return await enrich_request(r)


@router.post("/requests")
async def create_request(body: LeaveRequestBody, request: Request, user: dict = Depends(get_current_user)):
    lt = await db.leave_types.find_one({"id": body.leave_type_id, "organization_id": user["organization_id"]})
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    full = await db.users.find_one({"id": user["id"]})
    val = await validate_leave_request(organization_id=user["organization_id"], user=full,
                                       leave_type=lt, start_date=body.start_date, end_date=body.end_date)
    if not val["valid"]:
        raise HTTPException(status_code=400, detail="; ".join(val["errors"]))
    hr_required = "HR" in val["approvalsRequired"]
    doc = {
        "id": str(uuid.uuid4()), "organization_id": user["organization_id"], "user_id": user["id"],
        "leave_type_id": body.leave_type_id, "start_date": body.start_date, "end_date": body.end_date,
        "requested_days": val["computed_days"], "reason": body.reason,
        "additional_comments": body.additional_comments, "documentation_url": body.documentation_url,
        "status": "pending_manager", "manager_id": full.get("manager_id"),
        "hr_approval_required": hr_required, "documentation_required": val["documentationRequired"],
        "warnings": val["warnings"], "rejection_reason": None,
        "created_at": iso(), "updated_at": iso(),
    }
    await db.leave_requests.insert_one(doc)
    await log_audit(organization_id=user["organization_id"], actor=user, action="LEAVE_SUBMITTED",
                    entity_type="leave_request", entity_id=doc["id"],
                    after={"leave_type": lt["name"], "days": val["computed_days"],
                           "range": f"{body.start_date} to {body.end_date}"}, request=request)
    await create_notification(organization_id=user["organization_id"], user_id=user["id"],
                              ntype="leave_submitted", title="Leave request submitted",
                              message=f"Your {lt['name']} request is pending manager approval.")
    if full.get("manager_id"):
        await create_notification(organization_id=user["organization_id"], user_id=full["manager_id"],
                                  ntype="leave_submitted", title="New leave request",
                                  message=f"{full['first_name']} {full['last_name']} requested {lt['name']} ({val['computed_days']} days).",
                                  link="/leave-management")
    return await enrich_request(doc)


async def deduct_on_approval(r):
    lt = await db.leave_types.find_one({"id": r["leave_type_id"]})
    if lt and lt["code"] != "LWP":
        yr = datetime.fromisoformat(r["start_date"]).year if "T" not in r["start_date"] else datetime.fromisoformat(r["start_date"]).year
        yr = int(r["start_date"][:4])
        await add_transaction(organization_id=r["organization_id"], user_id=r["user_id"],
                              leave_type_id=r["leave_type_id"], year=yr, transaction_type="LEAVE_USED",
                              amount=-abs(float(r["requested_days"])), reason=f"Leave approved: {r['reason']}",
                              created_by={"id": "system", "name": "System"}, reference_id=r["id"])


@router.post("/requests/{req_id}/approve")
async def approve_request(req_id: str, body: ApproveBody, request: Request,
                          user: dict = Depends(get_current_user)):
    r = await db.leave_requests.find_one({"id": req_id, "organization_id": user["organization_id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r["status"] == "pending_manager":
        if not (user["role"] == "manager" or is_admin(user)):
            raise HTTPException(status_code=403, detail="Only managers can approve at this stage")
        if r.get("hr_approval_required"):
            new_status = "pending_hr"
        else:
            new_status = "approved"
        await db.leave_requests.update_one({"id": req_id}, {"$set": {
            "status": new_status, "manager_approved_by": user["id"], "manager_approved_at": iso(), "updated_at": iso()}})
        if new_status == "approved":
            await deduct_on_approval(r)
        else:
            await notify_role(organization_id=user["organization_id"], roles=["org_admin"],
                              ntype="leave_submitted", title="Leave requires HR approval",
                              message="A leave request is pending HR approval.", link="/leave-management")
        action = "LEAVE_APPROVED"
    elif r["status"] == "pending_hr":
        if not is_admin(user):
            raise HTTPException(status_code=403, detail="Only HR/Admin can approve at this stage")
        new_status = "approved"
        await db.leave_requests.update_one({"id": req_id}, {"$set": {
            "status": new_status, "hr_approved_by": user["id"], "hr_approved_at": iso(), "updated_at": iso()}})
        await deduct_on_approval(r)
        action = "LEAVE_APPROVED"
    else:
        raise HTTPException(status_code=400, detail=f"Cannot approve a request in status {r['status']}")
    await log_audit(organization_id=user["organization_id"], actor=user, action=action,
                    entity_type="leave_request", entity_id=req_id,
                    before={"status": r["status"]}, after={"status": new_status},
                    reason=body.comment, request=request)
    await create_notification(organization_id=user["organization_id"], user_id=r["user_id"],
                              ntype="leave_approved" if new_status == "approved" else "leave_submitted",
                              title="Leave update",
                              message="Your leave request was approved." if new_status == "approved"
                              else "Your leave request advanced to HR approval.")
    nr = await db.leave_requests.find_one({"id": req_id})
    return await enrich_request(nr)


@router.post("/requests/{req_id}/reject")
async def reject_request(req_id: str, body: RejectBody, request: Request,
                         user: dict = Depends(get_current_user)):
    r = await db.leave_requests.find_one({"id": req_id, "organization_id": user["organization_id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if not (user["role"] == "manager" or is_admin(user)):
        raise HTTPException(status_code=403, detail="Not permitted")
    if r["status"] not in ("pending_manager", "pending_hr"):
        raise HTTPException(status_code=400, detail="Request is not pending")
    await db.leave_requests.update_one({"id": req_id}, {"$set": {
        "status": "rejected", "rejection_reason": body.reason, "rejected_by": user["id"], "updated_at": iso()}})
    await log_audit(organization_id=user["organization_id"], actor=user, action="LEAVE_REJECTED",
                    entity_type="leave_request", entity_id=req_id,
                    before={"status": r["status"]}, after={"status": "rejected"},
                    reason=body.reason, request=request)
    await create_notification(organization_id=user["organization_id"], user_id=r["user_id"],
                              ntype="leave_rejected", title="Leave request rejected",
                              message=f"Your leave request was rejected. Reason: {body.reason}")
    nr = await db.leave_requests.find_one({"id": req_id})
    return await enrich_request(nr)


@router.post("/requests/{req_id}/cancel")
async def cancel_request(req_id: str, request: Request, user: dict = Depends(get_current_user)):
    r = await db.leave_requests.find_one({"id": req_id, "organization_id": user["organization_id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r["user_id"] != user["id"] and not is_admin(user):
        raise HTTPException(status_code=403, detail="Not permitted")
    new_status = "cancelled" if r["status"] in ("pending_manager", "pending_hr", "draft") else "withdrawn"
    if r["status"] == "approved":
        yr = int(r["start_date"][:4])
        lt = await db.leave_types.find_one({"id": r["leave_type_id"]})
        if lt and lt["code"] != "LWP":
            await add_transaction(organization_id=r["organization_id"], user_id=r["user_id"],
                                  leave_type_id=r["leave_type_id"], year=yr, transaction_type="REVERSAL",
                                  amount=abs(float(r["requested_days"])), reason="Leave withdrawn",
                                  created_by={"id": user["id"], "name": "reversal"}, reference_id=r["id"])
    await db.leave_requests.update_one({"id": req_id}, {"$set": {"status": new_status, "updated_at": iso()}})
    await log_audit(organization_id=user["organization_id"], actor=user, action="LEAVE_CANCELLED",
                    entity_type="leave_request", entity_id=req_id,
                    before={"status": r["status"]}, after={"status": new_status}, request=request)
    nr = await db.leave_requests.find_one({"id": req_id})
    return await enrich_request(nr)
