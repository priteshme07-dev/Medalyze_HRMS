import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/common";
import { fmtDateTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";

export default function AuditLogs() {
  const [rows, setRows] = useState([]);
  const [action, setAction] = useState("");

  useEffect(() => {
    const t = setTimeout(() => api.get("/audit-logs", { params: { action: action || undefined } }).then(({ data }) => setRows(data)), 300);
    return () => clearTimeout(t);
  }, [action]);

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Immutable, append-only record of all critical actions" testId="audit-logs-page" />
      <Input placeholder="Filter by action (e.g. LEAVE_APPROVED)" value={action} onChange={(e) => setAction(e.target.value.toUpperCase())} className="max-w-sm mb-4" data-testid="audit-filter" />
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={ShieldCheck} title="No audit entries" /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>By</TableHead><TableHead>Change</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} data-testid={`audit-row-${a.id}`}>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(a.created_at)}</TableCell>
                    <TableCell><Badge variant="outline" className="border-medalyze-light bg-medalyze-light/30 text-medalyze-dark text-xs">{a.action.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-xs">{a.entity_type}</TableCell>
                    <TableCell className="text-xs">{a.changed_by?.name}<div className="text-slate-400">{a.changed_by?.role}</div></TableCell>
                    <TableCell className="text-xs max-w-xs">
                      {a.before && a.after ? Object.keys(a.after).slice(0, 3).map((k) => <div key={k} className="truncate"><b>{k}:</b> {JSON.stringify(a.before[k])} → {JSON.stringify(a.after[k])}</div>) : (a.reason || "—")}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">{a.ip_address || "—"}</TableCell>
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
