import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Scale, ArrowRight } from "lucide-react";

export default function LeaveBalances() {
  const navigate = useNavigate();
  const [emps, setEmps] = useState([]);
  const [balMap, setBalMap] = useState({});
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/employees", { params: { search: q || undefined } }).then(async ({ data }) => {
      setEmps(data);
      const m = {};
      await Promise.all(data.slice(0, 30).map(async (e) => {
        try { const { data: b } = await api.get(`/leave/balances/${e.id}`); m[e.id] = b; } catch {}
      }));
      setBalMap(m);
    });
  }, [q]);

  const code = (bals, c) => (bals || []).find((b) => b.code === c)?.available_balance ?? "—";

  return (
    <>
      <PageHeader title="Leave Balances" subtitle="View and adjust employee leave balances" testId="leave-balances-page" />
      <Input placeholder="Search employees..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm mb-4" data-testid="lb-search" />
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {emps.length === 0 ? <EmptyState icon={Scale} title="No employees" /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>EL</TableHead><TableHead>CL</TableHead><TableHead>SL</TableHead><TableHead>BL</TableHead><TableHead>Comp-Off</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {emps.map((e) => (
                  <TableRow key={e.id} data-testid={`lb-row-${e.id}`}>
                    <TableCell className="font-medium">{e.first_name} {e.last_name}<div className="text-xs text-muted-foreground">{e.employee_code}</div></TableCell>
                    <TableCell>{code(balMap[e.id], "EL")}</TableCell>
                    <TableCell>{code(balMap[e.id], "CL")}</TableCell>
                    <TableCell>{code(balMap[e.id], "SL")}</TableCell>
                    <TableCell>{code(balMap[e.id], "BL")}</TableCell>
                    <TableCell>{code(balMap[e.id], "CO")}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => navigate(`/employees/${e.id}`)} data-testid={`lb-manage-${e.id}`}>Manage <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></TableCell>
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
