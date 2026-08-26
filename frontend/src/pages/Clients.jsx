import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Building2, Eye } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [["client_name", "Client Name"], ["contact_number", "Contact Number"], ["fax_number", "Fax Number"], ["individual_npi", "Individual NPI"], ["group_npi", "Group NPI"], ["group_tax_id", "Group Tax ID"], ["medicare_ptan", "Medicare PTAN"], ["medicaid_id", "Medicaid ID"], ["mailing_address", "Mailing Address"], ["practice_address", "Practice Address"]];

export default function Clients() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});

  const load = () => api.get("/clients", { params: { search: q || undefined } }).then(({ data }) => setRows(data));
  useEffect(() => { load(); }, [q]);

  const add = async () => {
    if (!form.client_name) return toast.error("Client name is required");
    try { await api.post("/clients", form); toast.success("Client created"); setOpen(false); setForm({}); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <>
      <PageHeader title="Clients" subtitle="Client demographics, portals and assignments" testId="clients-page"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="add-client-btn"><Plus className="h-4 w-4 mr-2" />Add Client</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-head">Add Client</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map(([k, l]) => <div key={k} className={k.includes("address") ? "col-span-2" : ""}><Label>{l}</Label><Input value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`client-${k}`} className="mt-1.5" /></div>)}
              </div>
              <DialogFooter><Button onClick={add} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="client-save">Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        } />
      <Input placeholder="Search by name, NPI, Tax ID, phone..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md mb-4" data-testid="clients-search" />
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={Building2} title="No clients found" /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>NPI</TableHead><TableHead>Tax ID</TableHead><TableHead>Contact</TableHead><TableHead>Employees</TableHead><TableHead>Portals</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} data-testid={`client-row-${c.id}`}>
                    <TableCell className="font-medium">{c.client_name}</TableCell>
                    <TableCell className="font-mono text-xs">{c.individual_npi || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.group_tax_id || "—"}</TableCell>
                    <TableCell>{c.contact_number || "—"}</TableCell>
                    <TableCell>{c.assigned_count}</TableCell>
                    <TableCell>{c.portal_count}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => navigate(`/clients/${c.id}`)} data-testid={`view-client-${c.id}`}><Eye className="h-4 w-4 mr-1" />Open</Button></TableCell>
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
