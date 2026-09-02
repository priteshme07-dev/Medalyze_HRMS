import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, LeaveStatusBadge, StatCard, EmptyState } from "@/components/common";
import { fmtDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, CalendarCheck, Clock, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

// ✅ FIX: "withdrawn" is a real status a leave request can carry (see cancel_request in the
// leave router), but it had no filter option — "all" was the only way to see withdrawn
// requests. Added alongside the other statuses.
const STATUS_OPTIONS = ["all", "pending_manager", "pending_hr", "approved", "rejected", "cancelled", "withdrawn"];

export default function LeaveManagement() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("all");
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [detail, setDetail] = useState(null);

  const load = () => api.get("/leave/requests", { params: { status: status === "all" ? undefined : status } }).then(({ data }) => setRows(data));
  useEffect(() => { load(); }, [status]);

  const approve = async (id) => { try { await api.post(`/leave/requests/${id}/approve`, {}); toast.success("Request approved"); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };
  const reject = async () => { try { await api.post(`/leave/requests/${rejectFor}/reject`, { reason: rejectReason }); toast.success("Request rejected"); setRejectFor(null); setRejectReason(""); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };

  const counts = {
    pending: rows.filter((r) => ["pending_manager", "pending_hr"].includes(r.status)).length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };

  return (
    <>
      <PageHeader title="Leave Management" subtitle="Review and action leave requests" testId="leave-management-page" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending" value={counts.pending} icon={Clock} tone="amber" />
        <StatCard label="Approved" value={counts.approved} icon={CheckCircle2} tone="lime" />
        <StatCard label="Rejected" value={counts.rejected} icon={XCircle} tone="red" />
        <StatCard label="Total" value={rows.length} icon={CalendarCheck} />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-56" data-testid="leave-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={CalendarCheck} title="No leave requests" /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Days</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} data-testid={`lm-row-${r.id}`} className="cursor-pointer" onClick={() => setDetail(r)}>
                    <TableCell className="font-medium">{r.employee_name}<div className="text-xs text-muted-foreground">{r.department}</div></TableCell>
                    <TableCell>{r.leave_type_name}</TableCell>
                    <TableCell>{fmtDate(r.start_date)}</TableCell>
                    <TableCell>{fmtDate(r.end_date)}</TableCell>
                    <TableCell>{r.requested_days}</TableCell>
                    <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {["pending_manager", "pending_hr"].includes(r.status) && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => approve(r.id)} data-testid={`approve-${r.id}`}><ThumbsUp className="h-3.5 w-3.5 mr-1" />Approve</Button>
                          <Button size="sm" variant="outline" className="text-red-600 h-8" onClick={() => setRejectFor(r.id)} data-testid={`reject-${r.id}`}>Reject</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-head">Reject Leave Request</DialogTitle></DialogHeader>
          <div><Label>Reason for rejection</Label><Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} data-testid="reject-reason" className="mt-1.5" /></div>
          <DialogFooter><Button onClick={reject} disabled={!rejectReason} variant="destructive" data-testid="reject-confirm">Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-head">Leave Request Details</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <p><b>Employee:</b> {detail.employee_name}</p>
              <p><b>Type:</b> {detail.leave_type_name}</p>
              <p><b>Dates:</b> {fmtDate(detail.start_date)} → {fmtDate(detail.end_date)} ({detail.requested_days} days)</p>
              <p><b>Reason:</b> {detail.reason}</p>
              {detail.hr_approval_required && <p className="text-amber-700">Requires HR approval</p>}
              {detail.documentation_required && <p className="text-amber-700">Documentation required {detail.documentation_url && <a href={detail.documentation_url} className="underline" target="_blank" rel="noreferrer">(view)</a>}</p>}
              {(detail.warnings || []).map((w, i) => <p key={i} className="text-amber-700 text-xs">⚠ {w}</p>)}
              {detail.rejection_reason && <p className="text-red-600"><b>Rejection:</b> {detail.rejection_reason}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
