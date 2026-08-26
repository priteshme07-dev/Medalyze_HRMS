import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, LeaveStatusBadge, EmptyState } from "@/components/common";
import { fmtDate } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Plus, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

function ApplyLeaveDialog({ types, onDone }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leave_type_id: "", start_date: "", end_date: "", reason: "", documentation_url: "", additional_comments: "" });
  const [val, setVal] = useState(null);
  const [balance, setBalance] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (form.leave_type_id && form.start_date && form.end_date) {
      api.post("/leave/validate", { leave_type_id: form.leave_type_id, start_date: form.start_date, end_date: form.end_date })
        .then(({ data }) => setVal(data)).catch(() => setVal(null));
    } else setVal(null);
  }, [form.leave_type_id, form.start_date, form.end_date]);

  useEffect(() => {
    if (form.leave_type_id) api.get("/leave/balances").then(({ data }) => {
      const b = data.find((x) => x.leave_type_id === form.leave_type_id); setBalance(b);
    });
  }, [form.leave_type_id]);

  const submit = async () => {
    setBusy(true);
    try { await api.post("/leave/requests", form); toast.success("Leave request submitted"); setOpen(false); setForm({ leave_type_id: "", start_date: "", end_date: "", reason: "", documentation_url: "", additional_comments: "" }); onDone(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const days = val?.computed_days ?? 0;
  const available = balance?.available_balance ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="apply-leave-btn"><Plus className="h-4 w-4 mr-2" />Apply Leave</Button></DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-head">Apply for Leave</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Leave Type</Label>
            <Select value={form.leave_type_id} onValueChange={(v) => set("leave_type_id", v)}>
              <SelectTrigger data-testid="leave-type-select" className="mt-1.5"><SelectValue placeholder="Select leave type" /></SelectTrigger>
              <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>From Date</Label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} data-testid="leave-from" className="mt-1.5" /></div>
            <div><Label>To Date</Label><Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} data-testid="leave-to" className="mt-1.5" /></div>
          </div>
          {balance && (
            <div className="grid grid-cols-3 gap-2 text-center bg-muted rounded-md p-3">
              <div><p className="text-xs text-muted-foreground">Available</p><p className="font-head text-lg font-bold text-medalyze-dark">{available}</p></div>
              <div><p className="text-xs text-muted-foreground">Requested</p><p className="font-head text-lg font-bold text-medalyze-dark">{days}</p></div>
              <div><p className="text-xs text-muted-foreground">Remaining</p><p className="font-head text-lg font-bold text-medalyze-dark">{(available - days).toFixed(1)}</p></div>
            </div>
          )}
          <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} data-testid="leave-reason" className="mt-1.5" rows={2} /></div>
          {val?.documentationRequired && <div><Label>Documentation URL</Label><Input value={form.documentation_url} onChange={(e) => set("documentation_url", e.target.value)} placeholder="Link to medical certificate" data-testid="leave-doc" className="mt-1.5" /></div>}
          {val && (
            <div className="space-y-2">
              {val.errors.map((e, i) => <div key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2.5" data-testid="leave-error"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{e}</div>)}
              {val.warnings.map((w, i) => <div key={i} className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2.5"><Info className="h-4 w-4 mt-0.5 shrink-0" />{w}</div>)}
              {val.approvalsRequired?.length > 0 && <p className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Approvals required: {val.approvalsRequired.join(", ")}</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button disabled={busy || !val?.valid || !form.reason} onClick={submit} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="leave-submit-btn">
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MyLeave() {
  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);

  const load = () => {
    api.get("/leave/types").then(({ data }) => setTypes(data));
    api.get("/leave/balances").then(({ data }) => setBalances(data));
    api.get("/leave/requests", { params: { scope: "mine" } }).then(({ data }) => setRequests(data));
  };
  useEffect(() => { load(); }, []);

  const cancel = async (id) => { try { await api.post(`/leave/requests/${id}/cancel`); toast.success("Request updated"); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };

  return (
    <>
      <PageHeader title="My Leave" subtitle="Balance, requests and applications" testId="my-leave-page"
        actions={<ApplyLeaveDialog types={types} onDone={load} />} />
      <Tabs defaultValue="balance">
        <TabsList data-testid="leave-tabs">
          <TabsTrigger value="balance" data-testid="tab-balance">My Balance</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests">My Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="balance" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {balances.map((b) => (
              <div key={b.leave_type_id} className="bg-white border border-border rounded-lg p-4" data-testid={`balance-card-${b.code}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 truncate">{b.leave_type}</p>
                <p className="font-head text-3xl font-extrabold text-medalyze-dark mt-1">{b.available_balance}<span className="text-sm text-slate-400"> days</span></p>
                <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
                  <div className="flex justify-between"><span>Allocated</span><span className="font-medium text-slate-600">{b.allocated}</span></div>
                  <div className="flex justify-between"><span>Used</span><span className="font-medium text-slate-600">{b.used}</span></div>
                  <div className="flex justify-between"><span>Pending</span><span className="font-medium text-amber-600">{b.pending}</span></div>
                  {b.carry_forward > 0 && <div className="flex justify-between"><span>Carry forward</span><span className="font-medium text-slate-600">{b.carry_forward}</span></div>}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            {requests.length === 0 ? <EmptyState title="No leave requests yet" hint="Apply for leave using the button above." /> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Days</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {requests.map((r) => (
                      <TableRow key={r.id} data-testid={`req-row-${r.id}`}>
                        <TableCell className="font-medium">{r.leave_type_name}</TableCell>
                        <TableCell>{fmtDate(r.start_date)}</TableCell>
                        <TableCell>{fmtDate(r.end_date)}</TableCell>
                        <TableCell>{r.requested_days}</TableCell>
                        <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-right">
                          {["pending_manager", "pending_hr", "approved"].includes(r.status) &&
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => cancel(r.id)} data-testid={`cancel-${r.id}`}>Cancel</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
