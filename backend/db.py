import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime = None) -> str:
    return (dt or now_utc()).isoformat()


def clean(doc):
    """Remove Mongo _id and sensitive fields for API responses."""
    if not doc:
        return doc
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


SENSITIVE_KEYS = {"password", "password_hash", "encrypted_password", "confirm_password", "new_password", "current_password"}


def sanitize(data):
    """Strip sensitive keys from audit payloads."""
    if not isinstance(data, dict):
        return data
    return {k: v for k, v in data.items() if k not in SENSITIVE_KEYS}
