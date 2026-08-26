import uuid
from datetime import datetime, timezone, timedelta, date
from db import db, now_utc, iso

# Leave type codes
EL = "EL"       # Earned / Privilege
CL = "CL"       # Casual
SL = "SL"       # Sick
BL = "BL"       # Birthday
OH = "OH"       # Optional Holiday
BR = "BR"       # Bereavement
PL = "PL"       # Paternity
ML = "ML"       # Maternity
CO = "CO"       # Comp-Off
LWP = "LWP"     # Leave Without Pay


def parse_date(d):
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    return datetime.fromisoformat(d).date()


async def working_days(organization_id, start, end, working_day_set=None):
    """Count working days between start and end inclusive, excluding weekends & holidays."""
    start = parse_date(start)
    end = parse_date(end)
    wd = set(working_day_set or [0, 1, 2, 3, 4])  # Mon-Fri default (0=Mon)
    holidays = set()
    async for h in db.holidays.find({"organization_id": organization_id, "optional": {"$ne": True}}):
        holidays.add(h["date"][:10])
    count = 0
    cur = start
    while cur <= end:
        if cur.weekday() in wd and cur.isoformat() not in holidays:
            count += 1
        cur += timedelta(days=1)
    return count


async def calculate_leave_balance(organization_id, user_id, leave_type_id, year):
    """Rebuild balance from ledger transactions (source of truth)."""
    txns = await db.leave_transactions.find({
        "organization_id": organization_id, "user_id": user_id,
        "leave_type_id": leave_type_id, "year": year,
    }).to_list(1000)
    opening = 0.0
    allocated = 0.0
    carry_forward = 0.0
    used = 0.0
    expired = 0.0
    adjustments = 0.0
    comp_earned = 0.0
    for t in txns:
        tt = t["transaction_type"]
        amt = float(t["amount"])
        if tt == "ALLOCATION":
            allocated += amt
        elif tt == "CARRY_FORWARD":
            carry_forward += amt
        elif tt == "LEAVE_USED":
            used += abs(amt)
        elif tt == "EXPIRY":
            expired += abs(amt)
        elif tt in ("ADJUSTMENT", "MANAGEMENT_GRANT", "REVERSAL"):
            adjustments += amt
        elif tt == "COMP_OFF_EARNED":
            comp_earned += amt
        elif tt == "COMP_OFF_EXPIRED":
            expired += abs(amt)
    # pending = approved-pending requests not yet finalized
    pending = 0.0
    async for r in db.leave_requests.find({
        "organization_id": organization_id, "user_id": user_id,
        "leave_type_id": leave_type_id,
        "status": {"$in": ["pending_manager", "pending_hr"]},
    }):
        pending += float(r.get("requested_days", 0))
    available = opening + allocated + carry_forward + adjustments + comp_earned - used - expired
    return {
        "opening_balance": round(opening, 2),
        "allocated": round(allocated, 2),
        "carry_forward": round(carry_forward, 2),
        "used": round(used, 2),
        "pending": round(pending, 2),
        "expired": round(expired, 2),
        "adjustments": round(adjustments + comp_earned, 2),
        "available_balance": round(available, 2),
    }


async def add_transaction(*, organization_id, user_id, leave_type_id, year, transaction_type,
                          amount, reason, created_by, reference_id=None):
    bal_before = await calculate_leave_balance(organization_id, user_id, leave_type_id, year)
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": organization_id,
        "user_id": user_id,
        "leave_type_id": leave_type_id,
        "year": year,
        "transaction_type": transaction_type,
        "amount": amount,
        "previous_balance": bal_before["available_balance"],
        "new_balance": round(bal_before["available_balance"] + amount, 2),
        "reference_id": reference_id,
        "reason": reason,
        "created_by": created_by,
        "created_at": iso(),
    }
    await db.leave_transactions.insert_one(doc)
    # sync summary balance doc
    bal_after = await calculate_leave_balance(organization_id, user_id, leave_type_id, year)
    await db.leave_balances.update_one(
        {"organization_id": organization_id, "user_id": user_id, "leave_type_id": leave_type_id, "year": year},
        {"$set": {**bal_after, "updated_at": iso()},
         "$setOnInsert": {"id": str(uuid.uuid4()), "organization_id": organization_id,
                          "user_id": user_id, "leave_type_id": leave_type_id, "year": year,
                          "created_at": iso()}},
        upsert=True,
    )
    doc.pop("_id", None)
    return doc


async def validate_leave_request(*, organization_id, user, leave_type, start_date, end_date, requested_days=None):
    """Returns structured validation dict."""
    warnings = []
    errors = []
    approvals = ["Reporting Manager"]
    doc_required = False

    code = leave_type.get("code")
    start = parse_date(start_date)
    end = parse_date(end_date)
    today = now_utc().date()

    if user.get("status") == "inactive":
        errors.append("Employee is not active.")
    if end < start:
        errors.append("End date cannot be before start date.")

    days = requested_days
    if days is None:
        if code in (EL, CL, BR, PL):
            days = await working_days(organization_id, start, end, user.get("working_days_idx"))
        else:
            days = (end - start).days + 1

    # balance check via ledger
    year = start.year
    bal = await calculate_leave_balance(organization_id, user["id"], leave_type["id"], year)
    if code != LWP:
        remaining = bal["available_balance"] - bal["pending"]
        if days > remaining:
            errors.append(f"Insufficient {leave_type['name']} balance. Available {remaining}, requested {days}.")

    notice = (start - today).days

    # Type-specific rules
    if code == EL:
        if notice < 7:
            warnings.append("EL/PL request submitted with less than 7 days notice — HR exception approval required.")
            approvals.append("HR")
        elif notice < 14:
            warnings.append("EL/PL request submitted with less than 14 days standard notice.")
    elif code == CL:
        if days > 3:
            errors.append("Casual Leave cannot exceed 3 consecutive working days per instance.")
    elif code == SL:
        span = (end - start).days + 1
        if span >= 3:
            doc_required = True
            approvals.append("HR")
            warnings.append("Sick leave of 3+ consecutive days requires mandatory medical documentation.")
        elif span == 2:
            warnings.append("A medical certificate may be requested for 2 consecutive sick days.")
    elif code == BL:
        dob = user.get("date_of_birth")
        if dob:
            if parse_date(dob).month != start.month:
                errors.append("Birthday Leave must be used during your birthday month.")
        if days > 1:
            errors.append("Birthday Leave is limited to 1 day.")
    elif code == OH:
        if start.day > 5:
            warnings.append("Optional Holiday requests should be submitted within the first 5 calendar days of the month.")
    elif code == PL:
        approvals.append("HR")
        if days > 5:
            errors.append("Paternity Leave is limited to 5 working days.")
    elif code == BR:
        if days > 3:
            warnings.append("Bereavement beyond 3 days must be applied via EL/CL/LWP.")
    elif code == ML:
        approvals.append("HR")
        doc_required = True
    elif code == CO:
        pass
    elif code == LWP:
        approvals.append("HR")

    # Holiday / weekend conflict warning
    hol = await db.holidays.find_one({"organization_id": organization_id,
                                      "date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
                                      "optional": {"$ne": True}})
    if hol:
        warnings.append(f"Requested range overlaps a holiday ({hol['name']}).")

    # Blackout period
    async for bp in db.blackout_periods.find({"organization_id": organization_id}):
        bs, be = parse_date(bp["start_date"]), parse_date(bp["end_date"])
        if not (end < bs or start > be):
            types = bp.get("leave_type_codes") or []
            if not types or code in types:
                if bp.get("restrict"):
                    errors.append(f"Leave submission restricted during blackout period: {bp.get('reason')}.")
                else:
                    warnings.append(f"Request falls within a blackout period: {bp.get('reason')}. Elevated approval required.")
                    if "HR" not in approvals:
                        approvals.append("HR")

    return {
        "valid": len(errors) == 0,
        "warnings": warnings,
        "errors": errors,
        "approvalsRequired": approvals,
        "documentationRequired": doc_required,
        "computed_days": days,
    }
