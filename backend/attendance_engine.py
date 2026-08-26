from datetime import datetime, timezone, timedelta

# Default policy constants
DEFAULT_GRACE_MIN = 15
DEFAULT_TOTAL_MIN = 540      # 9 hours
DEFAULT_BREAK_MIN = 60       # 1 hour
DEFAULT_PRODUCTIVE_MIN = 480  # 8 hours
BREAK_VIOLATION_MIN = 60
BREAK_HALFDAY_MIN = 90
BREAK_WARNING_REMAINING = 10


def parse_hhmm(value: str):
    h, m = value.split(":")
    return int(h), int(m)


def compute_attendance(*, login_time, logout_time, breaks, shift, grace=DEFAULT_GRACE_MIN):
    """All datetimes are timezone-aware UTC. shift = {scheduled_start,scheduled_end,break_minutes,productive_minutes}.
    Returns dict of computed metrics + status.
    breaks: list of {start, end} ISO strings (end may be None)."""
    result = {
        "total_logged_minutes": 0,
        "total_break_minutes": 0,
        "productive_minutes": 0,
        "late_minutes": 0,
        "status": "present",
        "violation_type": None,
    }
    if not login_time:
        result["status"] = "absent"
        return result

    # break total
    break_total = 0
    for b in (breaks or []):
        if b.get("start") and b.get("end"):
            s = datetime.fromisoformat(b["start"])
            e = datetime.fromisoformat(b["end"])
            break_total += max(0, (e - s).total_seconds() / 60.0)
    result["total_break_minutes"] = round(break_total)

    # late calculation
    sched = shift.get("scheduled_start", "09:00")
    sh, sm = parse_hhmm(sched)
    scheduled_dt = login_time.replace(hour=sh, minute=sm, second=0, microsecond=0)
    late = (login_time - scheduled_dt).total_seconds() / 60.0
    is_late = late > grace
    if is_late:
        result["late_minutes"] = round(late)

    if logout_time:
        logged = (logout_time - login_time).total_seconds() / 60.0
        result["total_logged_minutes"] = round(logged)
        productive = logged - break_total
        result["productive_minutes"] = round(productive)

    # status priority: half_day > break_violation / incomplete > late > present
    productive_target = shift.get("productive_minutes", DEFAULT_PRODUCTIVE_MIN)
    status = "present"
    violation = None
    if break_total > BREAK_HALFDAY_MIN:
        status = "half_day"
        violation = "break_halfday"
    elif break_total > BREAK_VIOLATION_MIN:
        status = "break_violation"
        violation = "break_violation"

    if logout_time and result["productive_minutes"] < productive_target and status not in ("half_day",):
        if status == "break_violation":
            pass  # keep break violation but note incomplete via violation
        else:
            status = "incomplete_shift"
            violation = "incomplete_shift"

    if status == "present" and is_late:
        status = "late_login"

    result["status"] = status
    result["violation_type"] = violation
    return result
