export function fmtMinutes(mins) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}

export function fmtHMS(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export function fmtTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

export function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export const STATUS_META = {
  present: { label: "Present", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  late_login: { label: "Late Login", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  break_violation: { label: "Break Violation", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  half_day: { label: "Half Day", cls: "bg-purple-100 text-purple-800 border-purple-200" },
  incomplete_shift: { label: "Incomplete Shift", cls: "bg-rose-100 text-rose-800 border-rose-200" },
  absent: { label: "Absent", cls: "bg-red-100 text-red-800 border-red-200" },
  not_started: { label: "Not Started", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

export const LEAVE_STATUS_META = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
  pending_manager: { label: "Pending Manager", cls: "bg-amber-100 text-amber-800" },
  pending_hr: { label: "Pending HR", cls: "bg-blue-100 text-blue-800" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600" },
  withdrawn: { label: "Withdrawn", cls: "bg-slate-100 text-slate-600" },
  expired: { label: "Expired", cls: "bg-zinc-100 text-zinc-600" },
};

export const ROLE_LABEL = {
  super_admin: "Super Admin",
  org_admin: "HR / Org Admin",
  manager: "Reporting Manager",
  employee: "Employee",
};
