import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import ClockWidget from "@/components/ClockWidget";
import { PageHeader, StatCard, EmptyState } from "@/components/common";
import { fmtDate } from "@/lib/format";
import { Users, CheckCircle2, Clock, UserX, AlertTriangle, Coffee, TimerOff, CalendarClock, Activity, Scale, PieChart } from "lucide-react";
import { Link } from "react-router-dom";

function AdminDashboard() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/dashboard/admin").then(({ data }) => setS(data)).catch(() => {}); }, []);
  if (!s) return null;
  const cards = [
    { label: "Total Employees", value: s.total_employees, icon: Users },
    { label: "Present", value: s.present, icon: CheckCircle2, tone: "lime" },
    { label: "Late Login", value: s.late_login, icon: Clock, tone: "amber" },
    { label: "Absent", value: s.absent, icon: UserX, tone: "red" },
    { label: "Half Day", value: s.half_day, icon: AlertTriangle, tone: "purple" },
    { label: "Incomplete Shift", value: s.incomplete_shift, icon: TimerOff, tone: "red" },
    { label: "Break Violations", value: s.break_violations, icon: Coffee, tone: "amber" },
    { label: "Currently Working", value: s.currently_working, icon: Activity, tone: "lime" },
    { label: "On Break", value: s.currently_on_break, icon: Coffee, tone: "blue" },
    { label: "Pending Leave", value: s.pending_leave_requests, icon: CalendarClock, tone: "amber" },
    { label: "Approved Leave", value: s.approved_leave, icon: Scale, tone: "lime" },
    { label: "Rejected Leave", value: s.rejected_leave, icon: PieChart, tone: "red" },
  ];
  return (
    <>
      <PageHeader title="Operations Dashboard" subtitle="Live workforce overview for today" testId="admin-dashboard" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => <StatCard key={i} {...c} testId={`stat-${c.label.toLowerCase().replace(/\s+/g, "-")}`} />)}
      </div>
      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1"><ClockWidget /></div>
        <div className="lg:col-span-2 bg-white border border-border rounded-lg p-6">
          <h3 className="font-head font-semibold text-lg text-medalyze-dark mb-1">Quick Actions</h3>
          <p className="text-sm text-muted-foreground mb-4">Jump to the modules you use most.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/leave-management" className="border border-border rounded-md p-4 hover:border-medalyze-forest transition-colors" data-testid="qa-leave">
              <CalendarClock className="h-5 w-5 text-medalyze-forest mb-2" /><p className="font-semibold text-slate-800">Review Leave Requests</p><p className="text-xs text-muted-foreground">{s.pending_leave_requests} pending approval</p></Link>
            <Link to="/employees" className="border border-border rounded-md p-4 hover:border-medalyze-forest transition-colors" data-testid="qa-employees">
              <Users className="h-5 w-5 text-medalyze-forest mb-2" /><p className="font-semibold text-slate-800">Manage Employees</p><p className="text-xs text-muted-foreground">{s.total_employees} active employees</p></Link>
            <Link to="/attendance" className="border border-border rounded-md p-4 hover:border-medalyze-forest transition-colors" data-testid="qa-attendance">
              <Clock className="h-5 w-5 text-medalyze-forest mb-2" /><p className="font-semibold text-slate-800">Attendance Records</p><p className="text-xs text-muted-foreground">View & edit attendance</p></Link>
            <Link to="/clients" className="border border-border rounded-md p-4 hover:border-medalyze-forest transition-colors" data-testid="qa-clients">
              <Users className="h-5 w-5 text-medalyze-forest mb-2" /><p className="font-semibold text-slate-800">Clients & Portals</p><p className="text-xs text-muted-foreground">Manage client vault</p></Link>
          </div>
        </div>
      </div>
    </>
  );
}

function EmployeeDashboard() {
  const [d, setD] = useState(null);
  const load = () => api.get("/dashboard/employee").then(({ data }) => setD(data)).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title="My Dashboard" subtitle="Your attendance, leave and holidays at a glance" testId="employee-dashboard" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1"><ClockWidget onChange={load} /></div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-head font-semibold text-lg text-medalyze-dark">My Leave Balance</h3>
              <Link to="/my-leave" className="text-sm text-medalyze-forest hover:underline" data-testid="view-leave-link">View all</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(d?.balances || []).filter(b => b.available > 0 || ["EL","CL","SL"].includes(b.code)).map((b) => (
                <div key={b.code} className="border border-border rounded-md p-3" data-testid={`bal-${b.code}`}>
                  <p className="text-xs text-muted-foreground truncate">{b.leave_type}</p>
                  <p className="font-head text-2xl font-extrabold text-medalyze-dark">{b.available}<span className="text-sm font-medium text-slate-400"> days</span></p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-head font-semibold text-lg text-medalyze-dark mb-4">Upcoming Holidays</h3>
            {(d?.upcoming_holidays || []).length === 0 ? <EmptyState icon={CalendarClock} title="No upcoming holidays" /> : (
              <div className="space-y-2">
                {d.upcoming_holidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-2 border-b border-border/60 last:border-0">
                    <div><p className="font-medium text-slate-800">{h.name}</p><p className="text-xs text-muted-foreground capitalize">{h.type?.replace("_", " ")}</p></div>
                    <p className="text-sm font-semibold text-medalyze-forest">{fmtDate(h.date)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminDashboard /> : <EmployeeDashboard />;
}
