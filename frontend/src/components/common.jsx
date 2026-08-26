import React from "react";
import { Badge } from "@/components/ui/badge";
import { STATUS_META, LEAVE_STATUS_META } from "@/lib/format";

export function PageHeader({ title, subtitle, actions, testId }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6" data-testid={testId}>
      <div>
        <h1 className="font-head text-2xl sm:text-3xl font-bold tracking-tight text-medalyze-dark">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = "default", testId }) {
  const tones = {
    default: "text-medalyze-dark",
    lime: "text-lime-600",
    amber: "text-amber-600",
    red: "text-red-600",
    blue: "text-blue-600",
    purple: "text-purple-600",
  };
  return (
    <div className="stat-tile bg-white border border-border rounded-lg p-4 flex items-start justify-between" data-testid={testId}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className={`font-head text-3xl font-extrabold mt-1.5 ${tones[tone]}`}>{value}</p>
      </div>
      {Icon && <div className="rounded-md bg-medalyze-light/50 p-2 text-medalyze-forest"><Icon className="h-5 w-5" /></div>}
    </div>
  );
}

export function AttStatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.not_started;
  return <Badge variant="outline" className={`border ${m.cls}`}>{m.label}</Badge>;
}

export function LeaveStatusBadge({ status }) {
  const m = LEAVE_STATUS_META[status] || LEAVE_STATUS_META.draft;
  return <Badge className={`${m.cls} hover:${m.cls} border-transparent`}>{m.label}</Badge>;
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="text-center py-14 text-muted-foreground" data-testid="empty-state">
      {Icon && <Icon className="h-10 w-10 mx-auto mb-3 opacity-40" />}
      <p className="font-medium text-slate-600">{title}</p>
      {hint && <p className="text-sm mt-1">{hint}</p>}
    </div>
  );
}
