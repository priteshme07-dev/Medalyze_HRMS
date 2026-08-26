from fastapi import APIRouter, Depends, HTTPException
from db import db, clean, iso, now_utc
from security import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(user: dict = Depends(get_current_user), unread_only: bool = False):
    q = {"organization_id": user["organization_id"], "user_id": user["id"]}
    if unread_only:
        q["read"] = False
    items = [clean(n) for n in await db.notifications.find(q).sort("created_at", -1).limit(100).to_list(100)]
    unread = await db.notifications.count_documents({**{"organization_id": user["organization_id"],
                                                        "user_id": user["id"]}, "read": False})
    return {"items": items, "unread": unread}


@router.post("/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"message": "ok"}


@router.post("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"message": "ok"}
