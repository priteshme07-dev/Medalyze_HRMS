import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/common";
import { ROLE_LABEL } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Users, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";

function AddEmployeeDialog({ managers, onDone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", department: "", designation: "", role: "employee", manager_id: "", date_of_birth: "", joining_date: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try { await api.post("/employees", { ...f, manager_id: f.manager_id || null }); toast.success("Employee added"); setOpen(false); setF({ first_name: "", last_name: "", email: "", department: "", designation: "", role: "employee", manager_id: "", date_of_birth: "", joining_date: "" }); onDone(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="add-employee-btn"><Plus className="h-4 w-4 mr-2" />Add Employee</Button></DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-head">Add Employee</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name</Label><Input value={f.first_name} onChange={(e) => set("first_name", e.target.value)} data-testid="emp-first" className="mt-1.5" /></div>
          <div><Label>Last Name</Label><Input value={f.last_name} onChange={(e) => set("last_name", e.target.value)} data-testid="emp-last" className="mt-1.5" /></div>
          <div className="col-span-2"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} data-testid="emp-email" className="mt-1.5" /></div>
          <div><Label>Department</Label><Input value={f.department} onChange={(e) => set("department", e.target.value)} data-testid="emp-dept" className="mt-1.5" /></div>
          <div><Label>Designation</Label><Input value={f.designation} onChange={(e) => set("designation", e.target.value)} data-testid="emp-desig" className="mt-1.5" /></div>
          <div><Label>Role</Label>
            <Select value={f.role} onValueChange={(v) => set("role", v)}><SelectTrigger className="mt-1.5" data-testid="emp-role"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="employee">Employee</SelectItem><SelectItem value="manager">Reporting Manager</SelectItem><SelectItem value="org_admin">HR / Org Admin</SelectItem></SelectContent></Select></div>
          <div><Label>Reporting Manager</Label>
            <Select value={f.manager_id} onValueChange={(v) => set("manager_id", v)}><SelectTrigger className="mt-1.5" data-testid="emp-manager"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Date of Birth</Label><Input type="date" value={f.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} data-testid="emp-dob" className="mt-1.5" /></div>
          <div><Label>Joining Date</Label><Input type="date" value={f.joining_date} onChange={(e) => set("joining_date", e.target.value)} data-testid="emp-join" className="mt-1.5" /></div>
        </div>
        <p className="text-xs text-muted-foreground">Default password: <b>Medalyze@123</b> (employee should change on first login).</p>
        <DialogFooter><Button disabled={busy || !f.first_name || !f.email} onClick={submit} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="emp-save">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Employees() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [managers, setManagers] = useState([]);
  const [q, setQ] = useState("");

  // ✅ FIX: search fired one request per keystroke with nothing to stop an older, slower
  // response from landing after a newer one and overwriting it with broader/stale results.
  // A request-sequence guard ensures only the response for the most recently sent request is
  // ever applied, and a debounce keeps us from firing a request on every keystroke at all.
  const requestSeq = useRef(0);
  const load = () => {
    const mySeq = ++requestSeq.current;
    return api.get("/employees", { params: { search: q || undefined } }).then(({ data }) => {
      if (mySeq !== requestSeq.current) return; // a newer search superseded this one
      setRows(data);
    });
  };
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => { api.get("/employees/managers").then(({ data }) => setManagers(data)); }, []);

  return (
    <>
      <PageHeader title={isManager ? "My Team" : "Employees"} subtitle="Manage employee records, roles and assignments" testId="employees-page"
        actions={!isManager && <AddEmployeeDialog managers={managers} onDone={load} />} />
      <Input placeholder="Search by name, email or code..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm mb-4" data-testid="employee-search" />
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={Users} title="No employees found" /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Department</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id} data-testid={`emp-row-${u.id}`}>
                    <TableCell className="font-mono text-xs">{u.employee_code}</TableCell>
                    <TableCell className="font-medium">{u.first_name} {u.last_name}<div className="text-xs text-muted-foreground">{u.email}</div></TableCell>
                    <TableCell>{u.department || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="border-medalyze-light bg-medalyze-light/30 text-medalyze-dark">{ROLE_LABEL[u.role]}</Badge></TableCell>
                    <TableCell><Badge className={u.status === "active" ? "bg-emerald-100 text-emerald-800 border-transparent" : "bg-red-100 text-red-800 border-transparent"}>{u.status}</Badge></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => navigate(`/employees/${u.id}`)} data-testid={`view-emp-${u.id}`}><Eye className="h-4 w-4 mr-1" />View</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
