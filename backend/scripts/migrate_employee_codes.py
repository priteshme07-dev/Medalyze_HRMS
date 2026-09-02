"""
One-off migration: re-code every employee in an organization to the standardized
MM001, MM002, ... format (two-letter "MM" prefix + zero-padded 3-digit sequence).

This is the data-migration half of the QA report's "Standardize Employee ID to the
format MM001" request. It is deliberately NOT run automatically as part of a deploy:
renumbering employee_code touches every employee record and anything that keys off
that code (reports already exported, payroll references, etc.), so it should be
reviewed and run deliberately by whoever administers the database.

What it does, in order (matching the QA report's recommended sequence):
  1. Loads every employee in the organization, ordered by joining_date (falling back
     to created_at, then first_name) so the mapping is reproducible and auditable.
  2. Assigns MM001, MM002, ... in that order — this also resolves the three existing
     duplicate-code collisions, since every employee gets a fresh, unique code
     regardless of what they had before.
  3. Prints the full old-code -> new-code mapping.
  4. With --apply, writes the new codes to the database (each write is also recorded
     to the audit log as an EMPLOYEE_CODE_MIGRATED action). Without --apply, it only
     prints the plan (dry run) and changes nothing.

Usage (run from the backend/ directory, with the same environment/.env the API uses):
    python scripts/migrate_employee_codes.py                     # dry run, prints the mapping
    python scripts/migrate_employee_codes.py --org "Medalyze Medtech LLP" --apply
"""
import argparse
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import db, iso  # noqa: E402
from audit import log_audit  # noqa: E402

PREFIX = "MM"


def sort_key(u):
    return (u.get("joining_date") or u.get("created_at") or "", u.get("first_name") or "")


async def run(org_name: str | None, apply: bool):
    q = {}
    if org_name:
        org = await db.organizations.find_one({"name": org_name})
        if not org:
            print(f"No organization named {org_name!r} found.")
            return
        q["organization_id"] = org["id"]
    else:
        orgs = await db.organizations.find({}).to_list(50)
        if len(orgs) != 1:
            print("Multiple (or zero) organizations found — pass --org \"Exact Org Name\" to disambiguate.")
            for o in orgs:
                print(f"  - {o['name']}")
            return
        q["organization_id"] = orgs[0]["id"]

    employees = await db.users.find({**q, "role": {"$ne": "super_admin"}}).to_list(1000)
    employees.sort(key=sort_key)

    plan = []
    for i, u in enumerate(employees, start=1):
        new_code = f"{PREFIX}{i:03d}"
        plan.append((u, u.get("employee_code"), new_code))

    print(f"{'OLD CODE':<12}{'NEW CODE':<12}{'NAME':<28}EMAIL")
    for u, old, new in plan:
        name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
        print(f"{(old or '—'):<12}{new:<12}{name:<28}{u.get('email', '')}")

    if not apply:
        print(f"\nDry run only — {len(plan)} employees would be renumbered. Re-run with --apply to write these changes.")
        return

    for u, old, new in plan:
        if old == new:
            continue
        await db.users.update_one({"id": u["id"]}, {"$set": {"employee_code": new, "updated_at": iso()}})
        await log_audit(organization_id=q["organization_id"],
                         actor={"id": "system", "first_name": "Migration", "last_name": "Script", "role": "system"},
                         action="EMPLOYEE_CODE_MIGRATED", entity_type="employee", entity_id=u["id"],
                         before={"employee_code": old}, after={"employee_code": new},
                         reason="Standardize employee ID to MM### format", request=None)
    print(f"\nApplied — {len(plan)} employees now use the MM### employee code format.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org", default=None, help="Exact organization name (only needed if more than one org exists)")
    parser.add_argument("--apply", action="store_true", help="Actually write the changes (default is dry-run)")
    args = parser.parse_args()
    asyncio.run(run(args.org, args.apply))
