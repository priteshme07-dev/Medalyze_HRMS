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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Network } from "lucide-react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

export default function Organizations() {
  const { isSuperAdmin } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", website: "www.medalyzeus.com", timezone: "Asia/Kolkata", admin_email: "", admin_password: "", admin_first_name: "", admin_last_name: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const load = () => api.get("/organizations").then(({ data }) => setOrgs(data));
  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin]);
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const create = async () => {
    try { await api.post("/organizations", f); toast.success("Organization created"); setOpen(false); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <>
      <PageHeader title="Organizations" subtitle="Platform tenants and their administrators" testId="organizations-page"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="add-org-btn"><Plus className="h-4 w-4 mr-2" />New Organization</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="font-head">Create Organization</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Organization Name</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} data-testid="org-new-name" className="mt-1.5" /></div>
                <div><Label>Website</Label><Input value={f.website} onChange={(e) => set("website", e.target.value)} className="mt-1.5" /></div>
                <div><Label>Timezone</Label><Input value={f.timezone} onChange={(e) => set("timezone", e.target.value)} className="mt-1.5" /></div>
                <div><Label>Admin First Name</Label><Input value={f.admin_first_name} onChange={(e) => set("admin_first_name", e.target.value)} className="mt-1.5" /></div>
                <div><Label>Admin Last Name</Label><Input value={f.admin_last_name} onChange={(e) => set("admin_last_name", e.target.value)} className="mt-1.5" /></div>
                <div className="col-span-2"><Label>Admin Email</Label><Input type="email" value={f.admin_email} onChange={(e) => set("admin_email", e.target.value)} data-testid="org-admin-email" className="mt-1.5" /></div>
                <div className="col-span-2"><Label>Admin Password</Label><Input type="password" value={f.admin_password} onChange={(e) => set("admin_password", e.target.value)} data-testid="org-admin-pw" className="mt-1.5" /></div>
              </div>
              <DialogFooter><Button onClick={create} disabled={!f.name || !f.admin_email || !f.admin_password} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="org-create-btn">Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        } />
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {orgs.length === 0 ? <EmptyState icon={Network} title="No organizations" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Organization</TableHead><TableHead>Website</TableHead><TableHead>Timezone</TableHead><TableHead>Users</TableHead><TableHead>Subscription</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {orgs.map((o) => (
                <TableRow key={o.id} data-testid={`org-row-${o.id}`}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell className="text-sm">{o.website}</TableCell>
                  <TableCell className="text-sm">{o.timezone}</TableCell>
                  <TableCell>{o.user_count}</TableCell>
                  <TableCell><Badge className="bg-emerald-100 text-emerald-800 border-transparent">{o.subscription || "active"}</Badge></TableCell>
                  <TableCell className="text-sm">{fmtDate(o.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
