import uuid
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from db import db, now_utc, iso, clean
from security import get_current_user, require, is_admin, encrypt_secret, decrypt_secret, has_perm
from audit import log_audit, diff_fields

router = APIRouter(prefix="/clients", tags=["clients"])

CLIENT_FIELDS = ["client_name", "mailing_address", "practice_address", "individual_npi",
                 "group_npi", "group_tax_id", "fax_number", "contact_number",
                 "medicare_ptan", "medicaid_id", "status"]


class ClientBody(BaseModel):
    client_name: str
    mailing_address: Optional[str] = None
    practice_address: Optional[str] = None
    individual_npi: Optional[str] = None
    group_npi: Optional[str] = None
    group_tax_id: Optional[str] = None
    fax_number: Optional[str] = None
    contact_number: Optional[str] = None
    medicare_ptan: Optional[str] = None
    medicaid_id: Optional[str] = None
    status: Optional[str] = "active"


class ClientUpdate(BaseModel):
    reason: str = "Client update"
    data: dict


class PortalBody(BaseModel):
    portal_name: str
    login_id: str
    password: str
    portal_link: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "active"


class PortalUpdate(BaseModel):
    portal_name: Optional[str] = None
    login_id: Optional[str] = None
    password: Optional[str] = None
    portal_link: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


async def assigned_client_ids(user):
    return [a["client_id"] async for a in db.client_employee_assignments.find(
        {"organization_id": user["organization_id"], "user_id": user["id"]})]


@router.get("")
async def list_clients(user: dict = Depends(get_current_user), search: Optional[str] = None):
    q = {"organization_id": user["organization_id"]}
    if not (is_admin(user) or has_perm(user, "client.view.all")):
        ids = await assigned_client_ids(user)
        q["id"] = {"$in": ids}
    if search:
        q["$or"] = [{"client_name": {"$regex": search, "$options": "i"}},
                    {"individual_npi": {"$regex": search, "$options": "i"}},
                    {"group_npi": {"$regex": search, "$options": "i"}},
                    {"group_tax_id": {"$regex": search, "$options": "i"}},
                    {"contact_number": {"$regex": search, "$options": "i"}}]
    out = []
    async for c in db.clients.find(q).sort("client_name", 1):
        c = clean(c)
        c["assigned_count"] = await db.client_employee_assignments.count_documents({"client_id": c["id"]})
        c["portal_count"] = await db.client_portals.count_documents({"client_id": c["id"]})
        out.append(c)
    return out


@router.post("")
async def create_client(body: ClientBody, request: Request, admin: dict = Depends(require("client.manage"))):
    doc = {"id": str(uuid.uuid4()), "organization_id": admin["organization_id"], **body.model_dump(),
           "created_at": iso(), "updated_at": iso()}
    await db.clients.insert_one(doc)
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="CLIENT_CREATED",
                    entity_type="client", entity_id=doc["id"], after=clean(doc), request=request)
    return clean(doc)


async def can_view_client(user, client_id):
    if is_admin(user) or has_perm(user, "client.view.all"):
        return True
    ids = await assigned_client_ids(user)
    return client_id in ids


@router.get("/{cid}")
async def get_client(cid: str, user: dict = Depends(get_current_user)):
    c = await db.clients.find_one({"id": cid, "organization_id": user["organization_id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    if not await can_view_client(user, cid):
        raise HTTPException(status_code=403, detail="You are not assigned to this client")
    c = clean(c)
    assigns = []
    async for a in db.client_employee_assignments.find({"client_id": cid}):
        u = await db.users.find_one({"id": a["user_id"]})
        if u:
            assigns.append({"user_id": u["id"], "name": f"{u['first_name']} {u['last_name']}",
                            "employee_code": u.get("employee_code"), "assignment_id": a["id"]})
    c["assigned_employees"] = assigns
    portals = []
    for p in await db.client_portals.find({"client_id": cid}).to_list(100):
        p = clean(p)
        p.pop("encrypted_password", None)
        p["password"] = "••••••••"
        portals.append(p)
    c["portals"] = portals
    return c


@router.put("/{cid}")
async def update_client(cid: str, body: ClientUpdate, request: Request, admin: dict = Depends(require("client.manage"))):
    c = await db.clients.find_one({"id": cid, "organization_id": admin["organization_id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    updates = {k: v for k, v in body.data.items() if k in CLIENT_FIELDS}
    before, after = diff_fields(c, {**c, **updates}, set(updates.keys()))
    updates["updated_at"] = iso()
    await db.clients.update_one({"id": cid}, {"$set": updates})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="CLIENT_UPDATED",
                    entity_type="client", entity_id=cid, before=before, after=after,
                    reason=body.reason, request=request)
    return clean(await db.clients.find_one({"id": cid}))


@router.delete("/{cid}")
async def archive_client(cid: str, request: Request, admin: dict = Depends(require("client.manage"))):
    c = await db.clients.find_one({"id": cid, "organization_id": admin["organization_id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.clients.update_one({"id": cid}, {"$set": {"status": "archived", "updated_at": iso()}})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="CLIENT_ARCHIVED",
                    entity_type="client", entity_id=cid, request=request)
    return {"message": "Client archived"}


# -------- Assignments --------
class AssignBody(BaseModel):
    user_ids: List[str]


@router.post("/{cid}/assign")
async def assign_employees(cid: str, body: AssignBody, request: Request, admin: dict = Depends(require("client.assign"))):
    c = await db.clients.find_one({"id": cid, "organization_id": admin["organization_id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.client_employee_assignments.delete_many({"client_id": cid})
    for uid in body.user_ids:
        await db.client_employee_assignments.insert_one({
            "id": str(uuid.uuid4()), "organization_id": admin["organization_id"],
            "client_id": cid, "user_id": uid, "created_at": iso()})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="CLIENT_ASSIGNMENT_UPDATED",
                    entity_type="client", entity_id=cid, after={"assigned": body.user_ids}, request=request)
    return {"message": "Assignments updated", "count": len(body.user_ids)}


# -------- Portals (credential vault) --------
@router.get("/{cid}/portals")
async def list_portals(cid: str, user: dict = Depends(get_current_user)):
    if not await can_view_client(user, cid):
        raise HTTPException(status_code=403, detail="Not permitted")
    out = []
    for p in await db.client_portals.find({"client_id": cid}).to_list(100):
        p = clean(p)
        p.pop("encrypted_password", None)
        p["password"] = "••••••••"
        out.append(p)
    return out


@router.post("/{cid}/portals")
async def add_portal(cid: str, body: PortalBody, request: Request, admin: dict = Depends(require("client.manage"))):
    c = await db.clients.find_one({"id": cid, "organization_id": admin["organization_id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    doc = {"id": str(uuid.uuid4()), "organization_id": admin["organization_id"], "client_id": cid,
           "portal_name": body.portal_name, "login_id": body.login_id,
           "encrypted_password": encrypt_secret(body.password), "portal_link": body.portal_link,
           "notes": body.notes, "status": body.status or "active", "created_at": iso(), "updated_at": iso()}
    await db.client_portals.insert_one(doc)
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="PORTAL_ADDED",
                    entity_type="client_portal", entity_id=doc["id"],
                    after={"portal_name": body.portal_name, "login_id": body.login_id, "client_id": cid},
                    request=request)
    safe = clean(doc)
    safe.pop("encrypted_password", None)
    safe["password"] = "••••••••"
    return safe


@router.put("/{cid}/portals/{pid}")
async def update_portal(cid: str, pid: str, body: PortalUpdate, request: Request,
                        admin: dict = Depends(require("client.manage"))):
    p = await db.client_portals.find_one({"id": pid, "client_id": cid, "organization_id": admin["organization_id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Portal not found")
    updates = {}
    for f in ["portal_name", "login_id", "portal_link", "notes", "status"]:
        v = getattr(body, f)
        if v is not None:
            updates[f] = v
    if body.password:
        updates["encrypted_password"] = encrypt_secret(body.password)
    updates["updated_at"] = iso()
    await db.client_portals.update_one({"id": pid}, {"$set": updates})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="PORTAL_UPDATED",
                    entity_type="client_portal", entity_id=pid,
                    after={k: v for k, v in updates.items() if k != "encrypted_password"},
                    meta={"password_changed": bool(body.password)}, request=request)
    return {"message": "Portal updated"}


@router.delete("/{cid}/portals/{pid}")
async def delete_portal(cid: str, pid: str, request: Request, admin: dict = Depends(require("client.manage"))):
    p = await db.client_portals.find_one({"id": pid, "client_id": cid, "organization_id": admin["organization_id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Portal not found")
    await db.client_portals.delete_one({"id": pid})
    await log_audit(organization_id=admin["organization_id"], actor=admin, action="PORTAL_DELETED",
                    entity_type="client_portal", entity_id=pid,
                    after={"portal_name": p.get("portal_name")}, request=request)
    return {"message": "Portal deleted"}


@router.post("/{cid}/portals/{pid}/reveal")
async def reveal_portal(cid: str, pid: str, request: Request, user: dict = Depends(require("client.portal.reveal"))):
    p = await db.client_portals.find_one({"id": pid, "client_id": cid, "organization_id": user["organization_id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Portal not found")
    await log_audit(organization_id=user["organization_id"], actor=user, action="CREDENTIAL_VIEWED",
                    entity_type="client_portal", entity_id=pid,
                    meta={"portal_name": p.get("portal_name")}, request=request)
    return {"password": decrypt_secret(p["encrypted_password"])}
