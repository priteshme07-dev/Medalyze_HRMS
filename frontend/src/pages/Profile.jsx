import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { PageHeader } from "@/components/common";
import { ROLE_LABEL, fmtDate } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

function Row({ label, value }) {
  return <div className="flex justify-between py-2.5 border-b border-border/60 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><span className="text-sm font-medium text-slate-800">{value || "—"}</span></div>;
}

export default function Profile() {
  const { user } = useAuth();
  const [balances, setBalances] = useState([]);
  useEffect(() => { api.get("/leave/balances").then(({ data }) => setBalances(data)).catch(() => {}); }, []);
  const initials = `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase();

  return (
    <>
      <PageHeader title="My Profile" subtitle="Your personal and employment information" testId="profile-page" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white border border-border rounded-lg p-6 text-center">
          <Avatar className="h-20 w-20 mx-auto"><AvatarFallback className="bg-medalyze-dark text-white text-xl font-bold">{initials}</AvatarFallback></Avatar>
          <p className="font-head text-xl font-bold text-medalyze-dark mt-3">{user.first_name} {user.last_name}</p>
          <p className="text-sm text-muted-foreground">{user.designation || "—"}</p>
          <Badge className="mt-2 bg-medalyze-light text-medalyze-dark border-transparent">{ROLE_LABEL[user.role]}</Badge>
          <p className="text-xs text-slate-400 mt-3">{user.employee_code}</p>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-head font-semibold text-medalyze-dark mb-3">Employment Information</h3>
            <Row label="Email" value={user.email} />
            <Row label="Phone" value={user.phone} />
            <Row label="Department" value={user.department} />
            <Row label="Designation" value={user.designation} />
            <Row label="Joining Date" value={user.joining_date ? fmtDate(user.joining_date) : null} />
            <Row label="Timezone" value={user.timezone} />
            <Row label="Shift" value={`${user.scheduled_start} – ${user.scheduled_end}`} />
            <Row label="Working Days" value={(user.working_days || []).join(", ")} />
          </div>
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-head font-semibold text-medalyze-dark mb-3">Leave Balance</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {balances.filter(b => b.available_balance > 0).map((b) => (
                <div key={b.leave_type_id} className="border border-border rounded-md p-3"><p className="text-xs text-muted-foreground truncate">{b.leave_type}</p><p className="font-head text-xl font-bold text-medalyze-dark">{b.available_balance}</p></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
