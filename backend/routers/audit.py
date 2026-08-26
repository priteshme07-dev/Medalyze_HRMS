from fastapi import APIRouter, Depends, Query
from typing import Optional
from db import db, clean
from security import require

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("")
async def list_audit(user: dict = Depends(require("audit.view")), action: Optional[str] = None,
                     entity_type: Optional[str] = None, actor_email: Optional[str] = None,
                     limit: int = 300):
    q = {"organization_id": user["organization_id"]}
    if action:
        q["action"] = action
    if entity_type:
        q["entity_type"] = entity_type
    if actor_email:
        q["changed_by.email"] = {"$regex": actor_email, "$options": "i"}
    return [clean(a) for a in await db.audit_logs.find(q).sort("created_at", -1).limit(limit).to_list(limit)]


@router.get("/{entity_type}/{entity_id}")
async def entity_audit(entity_type: str, entity_id: str, user: dict = Depends(require("audit.view"))):
    q = {"organization_id": user["organization_id"], "entity_type": entity_type, "entity_id": entity_id}
    return [clean(a) for a in await db.audit_logs.find(q).sort("created_at", -1).limit(200).to_list(200)]
