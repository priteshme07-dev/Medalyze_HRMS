import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/common";
import { fmtDateTime } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Save, Eye, EyeOff, Plus, Trash2, ExternalLink, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [["client_name", "Client Name"], ["contact_number", "Contact Number"], ["fax_number", "Fax Number"], ["individual_npi", "Individual NPI"], ["group_npi", "Group NPI"], ["group_tax_id", "Group Tax ID"], ["medicare_ptan", "Medicare PTAN"], ["medicaid_id", "Medicaid ID"], ["mailing_address", "Mailing Address"], ["practice_address", "Practice Address"]];

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [c, setC] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [audit, setAudit] = useState([]);
  const [allEmps, setAllEmps] = useState([]);
  const [assignSel, setAssignSel] = useState([]);

  const load = () => api.get(`/clients/${id}`).then(({ data }) => { setC(data); setForm(data); setAssignSel((data.assigned_employees || []).map((a) => a.user_id)); });
  useEffect(() => { load(); if (isAdmin) { api.get("/employees").then(({ data }) => setAllEmps(data)); api.get(`/audit-logs/client/${id}`).then(({ data }) => setAudit(data)).catch(() => {}); } }, [id]);
  if (!c) return null;

  const save = async () => {
    setBusy(true);
    const data = {}; FIELDS.forEach(([k]) => { data[k] = form[k]; });
    try { await api.put(`/clients/${id}`, { reason: reason || "Client update", data }); toast.success("Client updated"); setEdit(false); setReason(""); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  const reveal = async (pid) => {
    try { const { data } = await api.post(`/clients/${id}/portals/${pid}/reveal`); setRevealed((r) => ({ ...r, [pid]: data.password })); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const hide = (pid) => setRevealed((r) => { const n = { ...r }; delete n[pid]; return n; });
  const delPortal = async (pid) => { try { await api.delete(`/clients/${id}/portals/${pid}`); toast.success("Portal deleted"); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };
  const saveAssign = async () => { try { await api.post(`/clients/${id}/assign`, { user_ids: assignSel }); toast.success("Assignments updated"); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };

  return (
    <>
      <button onClick={() => navigate(-1)} className="inline-flex items-center text-sm text-medalyze-forest hover:underline mb-4" data-testid="client-back"><ArrowLeft className="h-4 w-4 mr-1" />Back</button>
      <PageHeader title={c.client_name} subtitle={`Individual NPI: ${c.individual_npi || "—"}`} testId="client-detail"
        actions={isAdmin && (!edit ? <Button onClick={() => setEdit(true)} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="edit-client-btn">Edit</Button>
          : <Button onClick={save} disabled={busy} className="bg-lime-500 hover:bg-lime-600 text-medalyze-dark" data-testid="save-client-btn">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}<Save className="h-4 w-4 mr-2" />Save</Button>)} />

      <Tabs defaultValue="demo">
        <TabsList>
          <TabsTrigger value="demo" data-testid="tab-demographics">Demographics</TabsTrigger>
          <TabsTrigger value="portals" data-testid="tab-portals">Portals & Payer Access</TabsTrigger>
          {isAdmin && <TabsTrigger value="assign" data-testid="tab-assign">Assigned Employees</TabsTrigger>}
          {isAdmin && <TabsTrigger value="audit" data-testid="tab-client-audit">Audit History</TabsTrigger>}
        </TabsList>

        <TabsContent value="demo" className="mt-4">
          {edit && <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4"><Label className="text-amber-800">Reason for change (audited)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="client-edit-reason" className="mt-1.5" /></div>}
          <div className="bg-white border border-border rounded-lg p-6 grid sm:grid-cols-2 gap-4">
            {FIELDS.map(([k, l]) => (
              <div key={k} className={k.includes("address") ? "sm:col-span-2" : ""}>
                <Label>{l}</Label>
                {edit ? <Input value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`cd-${k}`} className="mt-1.5" /> : <p className="text-sm font-medium text-slate-800 mt-2">{c[k] || "—"}</p>}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="portals" className="mt-4 space-y-4">
          {isAdmin && <div className="flex justify-end"><AddPortalDialog clientId={id} onDone={load} /></div>}
          <div className="grid md:grid-cols-2 gap-4">
            {(c.portals || []).map((p) => (
              <div key={p.id} className="bg-white border border-border rounded-lg p-5" data-testid={`portal-${p.id}`}>
                <div className="flex items-start justify-between">
                  <div><p className="font-head font-semibold text-medalyze-dark">{p.portal_name}</p><Badge className="mt-1 bg-emerald-100 text-emerald-800 border-transparent text-xs">{p.status}</Badge></div>
                  {isAdmin && <Button size="icon" variant="ghost" className="text-red-600" onClick={() => delPortal(p.id)} data-testid={`del-portal-${p.id}`}><Trash2 className="h-4 w-4" /></Button>}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Login ID</span><span className="font-mono">{p.login_id}</span></div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Password</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{revealed[p.id] || "••••••••"}</span>
                      {revealed[p.id] ? <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => hide(p.id)} data-testid={`hide-${p.id}`}><EyeOff className="h-4 w-4" /></Button>
                        : <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => reveal(p.id)} data-testid={`reveal-${p.id}`}><Eye className="h-4 w-4" /></Button>}
                    </div>
                  </div>
                  {p.portal_link && <a href={p.portal_link} target="_blank" rel="noreferrer" className="inline-flex items-center text-medalyze-forest hover:underline text-xs"><ExternalLink className="h-3.5 w-3.5 mr-1" />Open portal</a>}
                </div>
              </div>
            ))}
            {(c.portals || []).length === 0 && <p className="text-sm text-muted-foreground">No portals configured.</p>}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" />Passwords are AES-256 encrypted at rest. Revealing a credential is recorded in the audit log.</p>
        </TabsContent>

        {isAdmin && <TabsContent value="assign" className="mt-4">
          <div className="bg-white border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="font-head font-semibold text-medalyze-dark">Assign Employees</h3><Button size="sm" onClick={saveAssign} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="save-assign-btn">Save Assignments</Button></div>
            <div className="grid sm:grid-cols-2 gap-2">
              {allEmps.map((e) => (
                <label key={e.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer" data-testid={`assign-${e.id}`}>
                  <Checkbox checked={assignSel.includes(e.id)} onCheckedChange={(ck) => setAssignSel((s) => ck ? [...s, e.id] : s.filter((x) => x !== e.id))} />
                  <span className="text-sm">{e.first_name} {e.last_name} <span className="text-muted-foreground text-xs">({e.employee_code})</span></span>
                </label>
              ))}
            </div>
          </div>
        </TabsContent>}

        {isAdmin && <TabsContent value="audit" className="mt-4">
          <div className="bg-white border border-border rounded-lg p-6">
            {audit.length === 0 ? <p className="text-sm text-muted-foreground">No audit history.</p> : audit.map((a) => (
              <div key={a.id} className="border-l-2 border-medalyze-light pl-4 py-1.5" data-testid={`caudit-${a.id}`}>
                <p className="text-sm font-medium">{a.action.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{a.changed_by?.name} · {fmtDateTime(a.created_at)}{a.reason ? ` · ${a.reason}` : ""}</p>
              </div>
            ))}
          </div>
        </TabsContent>}
      </Tabs>
    </>
  );
}

function AddPortalDialog({ clientId, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ portal_name: "", login_id: "", password: "", portal_link: "", notes: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    try { await api.post(`/clients/${clientId}/portals`, f); toast.success("Portal added"); setOpen(false); setF({ portal_name: "", login_id: "", password: "", portal_link: "", notes: "" }); onDone(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="add-portal-btn"><Plus className="h-4 w-4 mr-2" />Add Portal</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-head">Add Portal Credential</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Portal Name</Label><Input value={f.portal_name} onChange={(e) => set("portal_name", e.target.value)} placeholder="e.g. Availity" data-testid="portal-name" className="mt-1.5" /></div>
          <div><Label>Login ID</Label><Input value={f.login_id} onChange={(e) => set("login_id", e.target.value)} data-testid="portal-login" className="mt-1.5" /></div>
          <div><Label>Password</Label><Input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} data-testid="portal-password" className="mt-1.5" /></div>
          <div><Label>Portal Link</Label><Input value={f.portal_link} onChange={(e) => set("portal_link", e.target.value)} data-testid="portal-link" className="mt-1.5" /></div>
          <div><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} data-testid="portal-notes" className="mt-1.5" rows={2} /></div>
        </div>
        <DialogFooter><Button disabled={!f.portal_name || !f.login_id || !f.password} onClick={submit} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="portal-save">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
