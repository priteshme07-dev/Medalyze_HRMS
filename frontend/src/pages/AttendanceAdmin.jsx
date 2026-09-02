import React, { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, AttStatusBadge, EmptyState } from "@/components/common";
import { fmtDate, fmtTime, fmtMinutes } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Clock, Pencil } from "lucide-react";
import ClockWidget from "@/components/ClockWidget";
import { toast } from "sonner";

export default function AttendanceAdmin() {
  const [rows, setRows] = useState([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [editRow, setEditRow] = useState(null);
  const [ef, setEf] = useState({ status: "", reason: "" });

  // ✅ FIX: keep the latest filter values in a ref so any caller of `load()` (including
  // ClockWidget's onChange after a break start/end) always reads the current filter, and a
  // request-sequence counter so a slower, older response can never overwrite a newer one.
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const requestSeq = useRef(0);

  const load = () => {
    const mySeq = ++requestSeq.current;
    const { from, to } = rangeRef.current;
    return api
      .get("/attendance", { params: { date_from: from || undefined, date_to: to || undefined } })
      .then(({ data }) => {
        // A newer request already started after this one — discard this stale response.
        if (mySeq !== requestSeq.current) return;
        setRows(data);
      })
      .catch((e) => {
        if (mySeq !== requestSeq.current) return;
        toast.error(formatApiError(e.response?.data?.detail));
      });
  };

  // ✅ FIX: debounce filter changes so a date being typed digit-by-digit doesn't fire a
  // request per keystroke (previously produced things like date_from=0002-09-01 mid-entry).
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const saveEdit = async () => {
    try { await api.put(`/attendance/${editRow.id}`, { reason: ef.reason || "Attendance correction", data: { status: ef.status } }); toast.success("Attendance updated"); setEditRow(null); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <>
      <PageHeader title="Attendance" subtitle="Organization attendance records — including admins" testId="attendance-admin-page" />
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1"><ClockWidget onChange={load} /></div>
        <div className="lg:col-span-2 bg-white border border-border rounded-lg p-6">
          <h3 className="font-head font-semibold text-medalyze-dark mb-3">Filter</h3>
          <div className="flex gap-3 flex-wrap items-end">
            <div><Label>From</Label><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} data-testid="att-from" className="mt-1.5" /></div>
            <div><Label>To</Label><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} data-testid="att-to" className="mt-1.5" /></div>
            <Button variant="outline" onClick={() => setRange({ from: "", to: "" })} data-testid="att-clear">Clear</Button>
          </div>
        </div>
      </div>
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={Clock} title="No attendance records" /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Employee</TableHead><TableHead>Login</TableHead><TableHead>Logout</TableHead><TableHead>Break</TableHead><TableHead>Productive</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} data-testid={`att-admin-row-${a.id}`}>
                    <TableCell>{fmtDate(a.date)}</TableCell>
                    <TableCell className="font-medium">{a.employee_name}<div className="text-xs text-muted-foreground">{a.employee_code}</div></TableCell>
                    <TableCell>{fmtTime(a.login_time)}</TableCell>
                    <TableCell>{fmtTime(a.logout_time)}</TableCell>
                    <TableCell>{fmtMinutes(a.total_break_minutes)}</TableCell>
                    <TableCell>{fmtMinutes(a.productive_minutes)}</TableCell>
                    <TableCell><AttStatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => { setEditRow(a); setEf({ status: a.status, reason: "" }); }} data-testid={`edit-att-${a.id}`}><Pencil className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-head">Edit Attendance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Status</Label><Select value={ef.status} onValueChange={(v) => setEf({ ...ef, status: v })}><SelectTrigger className="mt-1.5" data-testid="edit-att-status"><SelectValue /></SelectTrigger><SelectContent>{["present", "late_login", "break_violation", "half_day", "incomplete_shift", "absent"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Reason (audited)</Label><Textarea value={ef.reason} onChange={(e) => setEf({ ...ef, reason: e.target.value })} data-testid="edit-att-reason" className="mt-1.5" rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={saveEdit} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="edit-att-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
