import uuid
from db import db, now_utc, iso


async def create_notification(*, organization_id, user_id, ntype, title, message, link=None):
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": organization_id,
        "user_id": user_id,
        "type": ntype,
        "title": title,
        "message": message,
        "link": link,
        "read": False,
        "created_at": iso(),
    }
    await db.notifications.insert_one(doc)
    return doc


async def notify_role(*, organization_id, roles, ntype, title, message, link=None, exclude=None):
    q = {"organization_id": organization_id, "role": {"$in": roles}}
    async for u in db.users.find(q):
        if exclude and u["id"] == exclude:
            continue
        await create_notification(organization_id=organization_id, user_id=u["id"],
                                  ntype=ntype, title=title, message=message, link=link)
