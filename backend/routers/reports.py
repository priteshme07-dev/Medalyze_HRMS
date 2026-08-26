import io
import csv
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from db import db, clean, now_utc
from security import require
from leave_engine import calculate_leave_balance

router = APIRouter(prefix="/reports", tags=["reports"])


async def attendance_rows(org, date_from, date_to):
    q = {"organization_id": org}
    if date_from and date_to:
        q["date"] = {"$gte": date_from, "$lte": date_to}
    rows = []
    async for a in db.attendance.find(q).sort("date", -1).limit(5000):
        u = await db.users.find_one({"id": a["user_id"]})
        rows.append({
            "Date": a.get("date"), "Employee": f"{u['first_name']} {u['last_name']}" if u else "",
            "Code": u.get("employee_code") if u else "", "Department": u.get("department") if u else "",
            "Scheduled": a.get("scheduled_login"), "Login": (a.get("login_time") or "")[:19].replace("T", " "),
            "Logout": (a.get("logout_time") or "")[:19].replace("T", " "),
            "Total Min": a.get("total_logged_minutes"), "Break Min": a.get("total_break_minutes"),
            "Productive Min": a.get("productive_minutes"), "Late Min": a.get("late_minutes"),
            "Status": a.get("status"),
        })
    return rows


async def leave_rows(org):
    types = {t["id"]: t["name"] async for t in db.leave_types.find({"organization_id": org})}
    rows = []
    async for r in db.leave_requests.find({"organization_id": org}).sort("created_at", -1).limit(5000):
        u = await db.users.find_one({"id": r["user_id"]})
        rows.append({
            "Employee": f"{u['first_name']} {u['last_name']}" if u else "",
            "Department": u.get("department") if u else "",
            "Leave Type": types.get(r["leave_type_id"], ""), "From": r.get("start_date"),
            "To": r.get("end_date"), "Days": r.get("requested_days"), "Status": r.get("status"),
            "Reason": r.get("reason"),
        })
    return rows


def csv_response(rows, filename):
    output = io.StringIO()
    if rows:
        w = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})


def excel_response(rows, filename):
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    if rows:
        ws.append(list(rows[0].keys()))
        for r in rows:
            ws.append(list(r.values()))
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/attendance")
async def attendance_report(user: dict = Depends(require("report.view")),
                            date_from: Optional[str] = None, date_to: Optional[str] = None):
    return await attendance_rows(user["organization_id"], date_from, date_to)


@router.get("/attendance/export/csv")
async def attendance_csv(user: dict = Depends(require("report.view")),
                         date_from: Optional[str] = None, date_to: Optional[str] = None):
    rows = await attendance_rows(user["organization_id"], date_from, date_to)
    return csv_response(rows, "attendance_report.csv")


@router.get("/attendance/export/excel")
async def attendance_excel(user: dict = Depends(require("report.view")),
                           date_from: Optional[str] = None, date_to: Optional[str] = None):
    rows = await attendance_rows(user["organization_id"], date_from, date_to)
    return excel_response(rows, "attendance_report.xlsx")


@router.get("/leave")
async def leave_report(user: dict = Depends(require("report.view"))):
    return await leave_rows(user["organization_id"])


@router.get("/leave/export/csv")
async def leave_csv(user: dict = Depends(require("report.view"))):
    return csv_response(await leave_rows(user["organization_id"]), "leave_report.csv")


@router.get("/leave/export/excel")
async def leave_excel(user: dict = Depends(require("report.view"))):
    return excel_response(await leave_rows(user["organization_id"]), "leave_report.xlsx")
