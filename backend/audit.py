import uuid
from db import db, now_utc, iso, sanitize


async def log_audit(*, organization_id, actor, action, entity_type, entity_id=None,
                    before=None, after=None, reason=None, request=None, meta=None):
    ip = None
    ua = None
    if request is not None:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": organization_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "before": sanitize(before) if isinstance(before, dict) else before,
        "after": sanitize(after) if isinstance(after, dict) else after,
        "reason": reason,
        "changed_by": {
            "id": actor.get("id") if actor else None,
            "name": f"{actor.get('first_name','')} {actor.get('last_name','')}".strip() if actor else "System",
            "email": actor.get("email") if actor else None,
            "role": actor.get("role") if actor else "system",
        },
        "ip_address": ip,
        "user_agent": ua,
        "meta": meta,
        "created_at": iso(),
    }
    await db.audit_logs.insert_one(doc)
    return doc


def diff_fields(before: dict, after: dict, fields=None):
    """Return dicts of only changed fields."""
    b, a = {}, {}
    keys = fields or set(list((before or {}).keys()) + list((after or {}).keys()))
    for k in keys:
        if (before or {}).get(k) != (after or {}).get(k):
            b[k] = (before or {}).get(k)
            a[k] = (after or {}).get(k)
    return b, a
