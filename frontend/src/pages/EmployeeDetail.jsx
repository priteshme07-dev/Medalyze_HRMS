import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/common";
import { ROLE_LABEL, fmtDateTime, fmtDate } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Loader2, KeyRound, Power } from "lucide-react";
import { toast } from "sonner";

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [emp, setEmp] = useState(null);
  const [managers, setManagers] = useState([]);
  const [balances, setBalances] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [audit, setAudit] = useState([]);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const load = () => {
    api.get(`/employees/${id}`).then(({ data }) => { setEmp(data); setForm(data); });
    api.get("/employees/managers").then(({ data }) => setManagers(data));
    if (isAdmin) {
      api.get(`/leave/balances/${id}`).then(({ data }) => setBalances(data)).catch(() => {});
      api.get(`/leave/balances/${id}/ledger`).then(({ data }) => setLedger(data)).catch(() => {});
      api.get(`/audit-logs/employee/${id}`).then(({ data }) => setAudit(data)).catch(() => {});
    }
  };
  useEffect(() => { load(); }, [id]);
  if (!emp) return null;
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    // ✅ FIX: Employee Code was not on this list, so it couldn't be edited anywhere in the UI
    // even though the backend already supports and validates it.
    const fields = ["first_name", "last_name", "email", "phone", "employee_code", "department", "designation", "role", "manager_id", "date_of_birth", "joining_date", "scheduled_start", "scheduled_end", "timezone"];
    const data = {}; fields.forEach((f) => { data[f] = form[f]; });
    try { await api.put(`/employees/${id}`, { reason: reason || "Employee record update", data }); toast.success("Employee updated"); setEdit(false); setReason(""); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };

  const toggleStatus = async () => {
    try { await api.delete(`/employees/${id}`, { params: { reason: "Status toggled by admin" } }); toast.success("Status updated"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const triggerReset = async () => {
    setResetBusy(true);
    try { await api.post("/auth/admin-trigger-reset", { user_id: id }); toast.success("Password reset link sent"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setResetBusy(false); }
  };

  const F = ({ label, k, type = "text", disabled }) => (
    <div>
      <Label>{label}</Label>
      {edit && !disabled ? <Input type={type} value={form[k] || ""} onChange={(e) => set(k, e.target.value)} data-testid={`ed-${k}`} className="mt-1.5" />
        : <p className="text-sm font-medium text-slate-800 mt-2">{(type === "date" && emp[k]) ? fmtDate(emp[k]) : (emp[k] || "—")}</p>}
    </div>
  );

  return (
    <>
      <button onClick={() => navigate("/employees")} className="inline-flex items-center text-sm text-medalyze-forest hover:underline mb-4" data-testid="back-btn"><ArrowLeft className="h-4 w-4 mr-1" />Back to employees</button>
      <PageHeader title={`${emp.first_name} ${emp.last_name}`} subtitle={`${emp.employee_code} · ${emp.designation || "—"}`} testId="employee-detail"
        actions={isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={triggerReset} disabled={resetBusy} data-testid="trigger-reset-btn">{resetBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}Reset Password</Button>
            <Button variant="outline" onClick={toggleStatus} className={emp.status === "active" ? "text-red-600" : "text-emerald-600"} data-testid="toggle-status-btn"><Power className="h-4 w-4 mr-2" />{emp.status === "active" ? "Deactivate" : "Reactivate"}</Button>
            {!edit ? <Button onClick={() => setEdit(true)} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="edit-employee-btn">Edit</Button>
              : <Button onClick={save} disabled={busy} className="bg-lime-500 hover:bg-lime-600 text-medalyze-dark" data-testid="save-employee-btn">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}<Save className="h-4 w-4 mr-2" />Save</Button>}
          </div>
        )} />

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info" data-testid="tab-info">Information</TabsTrigger>
          {isAdmin && <TabsTrigger value="leave" data-testid="tab-leave-balance">Leave Balance</TabsTrigger>}
          {isAdmin && <TabsTrigger value="audit" data-testid="tab-audit">Audit History</TabsTrigger>}
        </TabsList>

        <TabsContent value="info" className="mt-4 space-y-6">
          {edit && <div className="bg-amber-50 border border-amber-200 rounded-md p-3"><Label className="text-amber-800">Reason for change (audited)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Department reassignment" data-testid="edit-reason" className="mt-1.5" /></div>}
          <div className="bg-white border border-border rounded-lg p-6 grid sm:grid-cols-2 gap-4">
            <F label="Employee Code" k="employee_code" /><F label="First Name" k="first_name" />
            <F label="Last Name" k="last_name" /><F label="Email" k="email" />
            <F label="Phone" k="phone" />
            <F label="Department" k="department" /><F label="Designation" k="designation" />
            <div><Label>Role</Label>{edit ? <Select value={form.role} onValueChange={(v) => set("role", v)}><SelectTrigger className="mt-1.5" data-testid="ed-role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employee">Employee</SelectItem><SelectItem value="manager">Reporting Manager</SelectItem><SelectItem value="org_admin">HR / Org Admin</SelectItem></SelectContent></Select> : <p className="mt-2"><Badge className="bg-medalyze-light/40 text-medalyze-dark border-transparent">{ROLE_LABEL[emp.role]}</Badge></p>}</div>
            <div><Label>Reporting Manager</Label>{edit ? <Select value={form.manager_id || ""} onValueChange={(v) => set("manager_id", v)}><SelectTrigger className="mt-1.5" data-testid="ed-manager"><SelectValue placeholder="None" /></SelectTrigger><SelectContent>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select> : <p className="text-sm font-medium mt-2">{managers.find((m) => m.id === emp.manager_id)?.name || "—"}</p>}</div>
            <F label="Date of Birth" k="date_of_birth" type="date" /><F label="Joining Date" k="joining_date" type="date" />
            <F label="Scheduled Start" k="scheduled_start" /><F label="Scheduled End" k="scheduled_end" />
          </div>
        </TabsContent>

        {isAdmin && <TabsContent value="leave" className="mt-4 space-y-6">
          <div className="flex justify-end"><AdjustBalanceDialog userId={id} balances={balances} onDone={load} /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {balances.map((b) => <div key={b.leave_type_id} className="bg-white border border-border rounded-lg p-4"><p className="text-xs text-muted-foreground truncate">{b.leave_type}</p><p className="font-head text-2xl font-extrabold text-medalyze-dark">{b.available_balance}</p><p className="text-xs text-muted-foreground">Used {b.used} · Alloc {b.allocated}</p></div>)}
          </div>
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-head font-semibold text-medalyze-dark mb-3">Leave Ledger</h3>
            {ledger.length === 0 ? <p className="text-sm text-muted-foreground">No transactions.</p> : (
              <div className="space-y-1.5 text-sm">
                {ledger.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-border/60 last:border-0" data-testid={`ledger-${t.id}`}>
                    <div>
                      <span className="font-medium text-slate-800">{t.transaction_type}</span> <span className="text-muted-foreground">· {t.leave_type_name}</span>
                      {/* ✅ FIX: derive the credited/used label from the amount's sign instead of
                          trusting free-text `reason` alone, so a credit never reads as "used". */}
                      <span className={`ml-2 text-[11px] font-semibold uppercase tracking-wide ${t.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>{t.amount >= 0 ? "Credited" : "Used"}</span>
                      <div className="text-xs text-muted-foreground">{t.reason} · {fmtDateTime(t.created_at)}</div>
                    </div>
                    <span className={`font-semibold ${t.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>{t.amount >= 0 ? "+" : ""}{t.amount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>}

        {isAdmin && <TabsContent value="audit" className="mt-4">
          <div className="bg-white border border-border rounded-lg p-6">
            {audit.length === 0 ? <p className="text-sm text-muted-foreground">No audit history.</p> : (
              <div className="space-y-3">
                {audit.map((a) => (
                  <div key={a.id} className="border-l-2 border-medalyze-light pl-4 py-1" data-testid={`audit-${a.id}`}>
                    <p className="text-sm font-medium text-slate-800">{a.action.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">{a.changed_by?.name} ({a.changed_by?.role}) · {fmtDateTime(a.created_at)}</p>
                    {a.reason && <p className="text-xs text-slate-500 italic">Reason: {a.reason}</p>}
                    {a.before && a.after && <p className="text-xs mt-1 text-slate-600">{Object.keys(a.after).map((k) => `${k}: ${JSON.stringify(a.before[k])} → ${JSON.stringify(a.after[k])}`).join(", ")}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>}
      </Tabs>
    </>
  );
}

function AdjustBalanceDialog({ userId, balances, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ leave_type_id: "", amount: 0, transaction_type: "ADJUSTMENT", reason: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try { await api.post(`/leave/balances/${userId}/adjust`, { ...f, amount: parseFloat(f.amount) }); toast.success("Balance adjusted"); setOpen(false); setF({ leave_type_id: "", amount: 0, transaction_type: "ADJUSTMENT", reason: "" }); onDone(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" data-testid="modify-balance-btn">Modify Leave Balance</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-head">Modify Leave Balance</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Leave Type</Label><Select value={f.leave_type_id} onValueChange={(v) => set("leave_type_id", v)}><SelectTrigger className="mt-1.5" data-testid="adj-type"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{balances.map((b) => <SelectItem key={b.leave_type_id} value={b.leave_type_id}>{b.leave_type} (bal {b.available_balance})</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Transaction Type</Label><Select value={f.transaction_type} onValueChange={(v) => set("transaction_type", v)}><SelectTrigger className="mt-1.5" data-testid="adj-txn"><SelectValue /></SelectTrigger><SelectContent>{["ADJUSTMENT", "MANAGEMENT_GRANT", "CARRY_FORWARD", "COMP_OFF_EARNED", "EXPIRY", "COMP_OFF_EXPIRED"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Amount (use negative to deduct)</Label><Input type="number" step="0.5" value={f.amount} onChange={(e) => set("amount", e.target.value)} data-testid="adj-amount" className="mt-1.5" /></div>
          <div><Label>Reason (required)</Label><Textarea value={f.reason} onChange={(e) => set("reason", e.target.value)} data-testid="adj-reason" className="mt-1.5" rows={2} /></div>
        </div>
        <DialogFooter><Button disabled={busy || !f.leave_type_id || !f.reason} onClick={submit} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="adj-save">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apply</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
