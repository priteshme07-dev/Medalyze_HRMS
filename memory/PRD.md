# Medalyze HRMS — Product Requirements Document

## Original Problem Statement
Build a complete, secure, production-ready multi-tenant HRMS SaaS for **Medalyze Medtech LLP** (www.medalyzeus.com) combining employee HR management, attendance, time tracking, shifts, break management, leave management (policy engine + ledger + balances), holidays, client demographics, payer/portal credential vault, RBAC, notifications, reports, and immutable audit logs.

## Architecture (as built)
- **Stack:** React 19 + FastAPI + MongoDB (adapted from requested Next.js/Postgres/Prisma; same feature set & security).
- **Auth:** JWT in httpOnly cookies (access 8h + refresh 7d), bcrypt hashing, brute-force lockout (5 attempts / 15 min), forgot/reset (single-use hashed expiring tokens), change password, admin-triggered reset.
- **RBAC:** super_admin, org_admin (HR), manager, employee — permission sets in `security.py` (`has_perm`, `require`).
- **Multi-tenant:** every record carries `organization_id`; all queries tenant-scoped; super_admin cross-org.
- **Encryption:** portal credentials AES-256-GCM at rest (`ENCRYPTION_KEY` env), reveal-on-authorization + audit.
- **Backend modules:** `routers/` (auth, employees, attendance+breaks, leave, holidays+blackouts, clients, reports, notifications, audit, dashboard, settings, orgs); engines `attendance_engine.py`, `leave_engine.py`; services `audit.py`, `notifications_service.py`; `seed.py`.
- **Frontend:** `context/AuthContext`, `components/Layout` (role-aware sidebar), `ClockWidget`, `pages/*`. Brand: dark forest green + lime, Manrope/IBM Plex, inline SVG Medalyze logo, favicon.

## User Personas
- **Super Admin** — platform owner; manages organizations/tenants.
- **Org/HR Admin** — full HR operations, editing, balances, clients, reports, audit.
- **Reporting Manager** — team visibility, leave approvals.
- **Employee** — attendance, breaks, leave, own clients, profile.

## Core Requirements (static)
Attendance grace 15 min; break >60 = violation, >90 = half day; productive <8h = incomplete; leave policy per Medalyze Aug-2026 policy (EL/CL/SL/BL/OH/BR/PL/ML/CO/LWP); ledger-based balances; mandatory reason + audit on every edit; portal passwords never plaintext; employees see only assigned clients; all critical logic server-side; no cross-tenant access.

## Implemented (2026-08-26)
- ✅ Auth (login/logout/me/refresh/change/forgot/reset/admin-reset) + rate limiting
- ✅ RBAC + multi-tenant isolation (verified by testing agent)
- ✅ Employees CRUD + edit-with-reason audit, deactivate/reactivate, roles, manager assignment
- ✅ Attendance clock in/out + status engine; admin attendance edit; admins tracked too
- ✅ Break start/end, multi-break, violation/half-day thresholds, live timer
- ✅ Leave: types, policy validation engine, requests, manager+HR approval workflow, ledger transactions, balances, admin balance adjust with mandatory reason + audit
- ✅ Holidays CRUD + blackout periods
- ✅ Clients demographics + portal vault (AES-256, reveal audits CREDENTIAL_VIEWED) + employee assignment
- ✅ Reports (attendance/leave) + CSV & Excel export
- ✅ In-app notifications center
- ✅ Immutable audit logs (before/after/who/when/reason/IP/UA) + entity history tabs
- ✅ Super admin organizations list/create
- ✅ Seed demo Medalyze org (all roles, leave types, holidays, clients, portals)
- ✅ Responsive branded UI (sidebar + mobile sheet), favicon, footer links to medalyzeus.com

## Backlog / Remaining
- **P1:** Real branded email delivery via Resend (currently in-app + dev token). Scheduled jobs (annual allocation, carry-forward, year-end lapse, comp-off expiry, absent marking) — currently seeded/on-demand. Break warning "10 min remaining" push.
- **P2:** Custom-field editor UI for employees; document uploads (object storage) for sick-leave certificates; leave carry-forward automation UI; department/designation management UI in Settings; CSRF tokens for defense-in-depth.
- **P2:** Charts/trends on dashboards (Recharts); pagination on large reports.

## Next Tasks
1. Wire Resend branded emails (welcome, reset, leave lifecycle, violations).
2. Add platform-managed scheduled jobs for leave/attendance lifecycle.
3. Document upload vault for leave certificates.
