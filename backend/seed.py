import os
import uuid
from datetime import datetime, timedelta
from db import db, iso, now_utc
from security import hash_password
from leave_engine import add_transaction

LEAVE_TYPES = [
    ("Earned / Privilege Leave", "EL", 12, True, 12, True, False),
    ("Casual Leave", "CL", 3, False, 0, False, False),
    ("Sick Leave", "SL", 3, False, 0, False, True),
    ("Birthday Leave", "BL", 1, False, 0, False, False),
    ("Optional Holidays", "OH", 3, False, 0, False, False),
    ("Bereavement Leave", "BR", 3, False, 0, False, False),
    ("Paternity Leave", "PL", 5, False, 0, False, False),
    ("Maternity Leave", "ML", 182, False, 0, False, True),
    ("Comp-Off", "CO", 0, False, 0, False, False),
    ("Leave Without Pay", "LWP", 0, False, 0, False, False),
]

HOLIDAYS = [
    ("Republic Day", "2026-01-26", "mandatory", False),
    ("Independence Day", "2026-08-15", "mandatory", False),
    ("Gandhi Jayanti", "2026-10-02", "mandatory", False),
    ("Diwali", "2026-11-08", "company", False),
    ("Holi", "2026-03-14", "company", False),
    ("Makar Sankranti / Uttarayan", "2026-01-14", "optional", True),
    ("Maha Shivratri", "2026-02-15", "optional", True),
    ("Raksha Bandhan", "2026-08-28", "optional", True),
    ("Ganesh Chaturthi", "2026-09-14", "optional", True),
    ("Christmas Eve", "2026-12-24", "optional", True),
    ("Thanksgiving (US)", "2026-11-26", "us_aligned", False),
]


async def seed():
    sa_email = os.environ.get("SUPER_ADMIN_EMAIL", "priteshme07@gmail.com").lower()
    sa_pw = os.environ.get("SUPER_ADMIN_PASSWORD", "Medalyze@123")

    org = await db.organizations.find_one({"name": "Medalyze Medtech LLP"})
    if not org:
        org_id = str(uuid.uuid4())
        org = {"id": org_id, "name": "Medalyze Medtech LLP", "website": "www.medalyzeus.com",
               "timezone": "Asia/Kolkata", "grace_minutes": 15, "total_shift_minutes": 540,
               "break_minutes": 60, "productive_minutes": 480,
               "departments": ["Operations", "Billing", "RCM", "HR", "IT"],
               "designations": ["Executive", "Senior Executive", "Team Lead", "Manager", "AR Caller"],
               "subscription": "active", "created_at": iso(), "updated_at": iso()}
        await db.organizations.insert_one(org)
    org_id = org["id"]

    # Ensure super admin
    existing_sa = await db.users.find_one({"email": sa_email})
    if not existing_sa:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "organization_id": org_id, "email": sa_email,
            "password_hash": hash_password(sa_pw), "first_name": "Pritesh", "last_name": "Owner",
            "role": "super_admin", "status": "active", "timezone": "Asia/Kolkata",
            "scheduled_start": "09:00", "scheduled_end": "18:00", "working_days_idx": [0, 1, 2, 3, 4],
            "working_days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "employee_code": "MED0001",
            "department": "Management", "designation": "Founder", "date_of_birth": "1990-06-15",
            "created_at": iso()})
    else:
        await db.users.update_one({"email": sa_email}, {"$set": {"password_hash": hash_password(sa_pw)}})

    # Leave types
    lt_map = {}
    for name, code, ent, cf, cfl, enc, doc in LEAVE_TYPES:
        lt = await db.leave_types.find_one({"organization_id": org_id, "code": code})
        if not lt:
            lt = {"id": str(uuid.uuid4()), "organization_id": org_id, "name": name, "code": code,
                  "annual_entitlement": ent, "carry_forward_allowed": cf, "carry_forward_limit": cfl,
                  "encashable": enc, "requires_documentation": doc, "active": True,
                  "created_at": iso(), "updated_at": iso()}
            await db.leave_types.insert_one(lt)
        lt_map[code] = lt["id"]

    # Holidays
    for name, d, typ, opt in HOLIDAYS:
        if not await db.holidays.find_one({"organization_id": org_id, "name": name}):
            await db.holidays.insert_one({"id": str(uuid.uuid4()), "organization_id": org_id, "name": name,
                                          "date": d, "type": typ, "optional": opt, "created_at": iso(),
                                          "updated_at": iso()})

    # Demo users
    demo = [
        ("hr@medalyzeus.com", "HR", "Admin", "org_admin", "HR", "HR Manager", None, "1988-06-10", "MED1001"),
        ("manager@medalyzeus.com", "Ravi", "Menon", "manager", "Operations", "Team Lead", None, "1991-03-22", "MED1002"),
    ]
    ids = {}
    for email, fn, ln, role, dept, desig, mgr, dob, code in demo:
        u = await db.users.find_one({"email": email})
        if not u:
            uid = str(uuid.uuid4())
            await db.users.insert_one({"id": uid, "organization_id": org_id, "email": email,
                "password_hash": hash_password("Medalyze@123"), "first_name": fn, "last_name": ln,
                "role": role, "department": dept, "designation": desig, "manager_id": mgr,
                "status": "active", "timezone": "Asia/Kolkata", "scheduled_start": "09:00",
                "scheduled_end": "18:00", "working_days_idx": [0, 1, 2, 3, 4],
                "working_days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "employee_code": code,
                "date_of_birth": dob, "joining_date": "2024-01-15", "custom_fields": {}, "created_at": iso()})
            ids[email] = uid
        else:
            ids[email] = u["id"]

    mgr_id = ids.get("manager@medalyzeus.com")
    employees = [
        ("emp1@medalyzeus.com", "Anita", "Sharma", "Billing", "AR Caller", "1995-06-05", "MED1003"),
        ("emp2@medalyzeus.com", "John", "Doe", "RCM", "Senior Executive", "1993-09-12", "MED1004"),
        ("emp3@medalyzeus.com", "Priya", "Nair", "Operations", "Executive", "1996-11-20", "MED1005"),
    ]
    emp_ids = []
    for email, fn, ln, dept, desig, dob, code in employees:
        u = await db.users.find_one({"email": email})
        if not u:
            uid = str(uuid.uuid4())
            await db.users.insert_one({"id": uid, "organization_id": org_id, "email": email,
                "password_hash": hash_password("Medalyze@123"), "first_name": fn, "last_name": ln,
                "role": "employee", "department": dept, "designation": desig, "manager_id": mgr_id,
                "status": "active", "timezone": "Asia/Kolkata", "scheduled_start": "09:00",
                "scheduled_end": "18:00", "working_days_idx": [0, 1, 2, 3, 4],
                "working_days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "employee_code": code,
                "date_of_birth": dob, "joining_date": "2024-06-01", "custom_fields": {}, "created_at": iso()})
            emp_ids.append(uid)
        else:
            emp_ids.append(u["id"])

    # Allocate leave for all org members (idempotent: skip if allocation txn exists)
    yr = now_utc().year
    all_members = [u async for u in db.users.find({"organization_id": org_id, "role": {"$ne": "super_admin"}})]
    for u in all_members:
        for code, ltid in lt_map.items():
            ent = next((x[2] for x in LEAVE_TYPES if x[1] == code), 0)
            if ent <= 0 or code in ("ML", "LWP"):
                continue
            has = await db.leave_transactions.find_one({"organization_id": org_id, "user_id": u["id"],
                                                        "leave_type_id": ltid, "year": yr,
                                                        "transaction_type": "ALLOCATION"})
            if not has:
                await add_transaction(organization_id=org_id, user_id=u["id"], leave_type_id=ltid, year=yr,
                                      transaction_type="ALLOCATION", amount=float(ent),
                                      reason="Annual allocation (seed)",
                                      created_by={"id": "system", "name": "System"})

    # Clients + portals
    if await db.clients.count_documents({"organization_id": org_id}) == 0:
        from security import encrypt_secret
        c1 = {"id": str(uuid.uuid4()), "organization_id": org_id, "client_name": "A & A Physical Therapy",
              "mailing_address": "120 Main St, Newark, NJ 07102", "practice_address": "120 Main St, Newark, NJ 07102",
              "individual_npi": "1234567890", "group_npi": "0987654321", "group_tax_id": "22-3456789",
              "fax_number": "+1-973-555-0101", "contact_number": "+1-973-555-0100",
              "medicare_ptan": "PT12345", "medicaid_id": "MC998877", "status": "active",
              "created_at": iso(), "updated_at": iso()}
        c2 = {"id": str(uuid.uuid4()), "organization_id": org_id, "client_name": "Sunrise Rehab Center",
              "mailing_address": "500 Oak Ave, Austin, TX 78701", "practice_address": "500 Oak Ave, Austin, TX 78701",
              "individual_npi": "5556667778", "group_npi": "1112223334", "group_tax_id": "74-1122334",
              "fax_number": "+1-512-555-0202", "contact_number": "+1-512-555-0200",
              "medicare_ptan": "PT67890", "medicaid_id": "MC554433", "status": "active",
              "created_at": iso(), "updated_at": iso()}
        await db.clients.insert_many([c1, c2])
        portals = [
            (c1["id"], "Availity", "aa_pt_availity", "Av@il2026!", "https://www.availity.com"),
            (c1["id"], "WebPT", "aa_pt_webpt", "WebPt#2026", "https://www.webpt.com"),
            (c2["id"], "UHC", "sunrise_uhc", "Uhc$2026rehab", "https://www.uhcprovider.com"),
            (c2["id"], "eviCore", "sunrise_evicore", "Evi!Core2026", "https://www.evicore.com"),
        ]
        for cid, pn, lid, pw, link in portals:
            await db.client_portals.insert_one({"id": str(uuid.uuid4()), "organization_id": org_id,
                "client_id": cid, "portal_name": pn, "login_id": lid,
                "encrypted_password": encrypt_secret(pw), "portal_link": link, "notes": "",
                "status": "active", "created_at": iso(), "updated_at": iso()})
        # assign employees
        if emp_ids:
            for cid in [c1["id"]]:
                for uid in emp_ids[:2]:
                    await db.client_employee_assignments.insert_one({"id": str(uuid.uuid4()),
                        "organization_id": org_id, "client_id": cid, "user_id": uid, "created_at": iso()})
            await db.client_employee_assignments.insert_one({"id": str(uuid.uuid4()),
                "organization_id": org_id, "client_id": c2["id"], "user_id": emp_ids[-1], "created_at": iso()})

    print("[SEED] Medalyze org ready.")
