import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/common";
import { Building2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function MyClients() {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  useEffect(() => { api.get("/clients", { params: { search: q || undefined } }).then(({ data }) => setClients(data)); }, [q]);

  return (
    <>
      <PageHeader title="My Clients" subtitle="Clients assigned to you" testId="my-clients-page" />
      <Input placeholder="Search clients..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm mb-4" data-testid="client-search" />
      {clients.length === 0 ? <EmptyState icon={Building2} title="No clients assigned" hint="Your admin will assign clients to you." /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => (
            <button key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="text-left bg-white border border-border rounded-lg p-5 hover:border-medalyze-forest transition-colors" data-testid={`client-card-${c.id}`}>
              <div className="flex items-start justify-between">
                <div className="rounded-md bg-medalyze-light/50 p-2 text-medalyze-forest"><Building2 className="h-5 w-5" /></div>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </div>
              <p className="font-head font-semibold text-medalyze-dark mt-3">{c.client_name}</p>
              <p className="text-xs text-muted-foreground mt-1">NPI: {c.individual_npi || "—"} · {c.portal_count} portals</p>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
