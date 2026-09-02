import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/common";
import { fmtDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";

const TYPE_CLS = { mandatory: "bg-red-100 text-red-800", company: "bg-emerald-100 text-emerald-800", optional: "bg-amber-100 text-amber-800", us_aligned: "bg-blue-100 text-blue-800", custom: "bg-slate-100 text-slate-700" };

export default function Holidays() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", date: "", type: "company", description: "" });

  const load = () => api.get("/holidays").then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    try { await api.post("/holidays", { ...form, optional: form.type === "optional" }); toast.success("Holiday added"); setOpen(false); setForm({ name: "", date: "", type: "company", description: "" }); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id, name) => {
    // ✅ FIX: deleting fired immediately on click with no confirmation — a misclick removed a
    // real holiday with no undo.
    if (!window.confirm(`Remove the holiday "${name}"? This can't be undone.`)) return;
    try { await api.delete(`/holidays/${id}`); toast.success("Removed"); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  // ✅ FIX: neither the form nor the API rejected an empty Name/Date — Save now stays disabled
  // until both are filled (the backend also now rejects a blank name/date server-side).
  const canSave = form.name.trim().length > 0 && !!form.date;

  return (
    <>
      <PageHeader title="Holiday Calendar" subtitle="Company, mandatory, optional and US-aligned holidays" testId="holidays-page"
        actions={isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="add-holiday-btn"><Plus className="h-4 w-4 mr-2" />Add Holiday</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-head">Add Holiday</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="holiday-name" className="mt-1.5" /></div>
                <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="holiday-date" className="mt-1.5" /></div>
                <div><Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger className="mt-1.5" data-testid="holiday-type"><SelectValue /></SelectTrigger>
                    <SelectContent>{["mandatory", "company", "optional", "us_aligned", "custom"].map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={add} disabled={!canSave} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="holiday-save">Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )} />
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={CalendarDays} title="No holidays configured" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Holiday</TableHead><TableHead>Date</TableHead><TableHead>Type</TableHead>{isAdmin && <TableHead></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {rows.map((h) => (
                <TableRow key={h.id} data-testid={`holiday-row-${h.id}`}>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  <TableCell>{fmtDate(h.date)}</TableCell>
                  <TableCell><Badge className={`${TYPE_CLS[h.type] || TYPE_CLS.custom} border-transparent capitalize`}>{(h.type || "").replace("_", " ")}</Badge></TableCell>
                  {isAdmin && <TableCell className="text-right"><Button size="icon" variant="ghost" className="text-red-600" onClick={() => del(h.id, h.name)} data-testid={`del-holiday-${h.id}`}><Trash2 className="h-4 w-4" /></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
