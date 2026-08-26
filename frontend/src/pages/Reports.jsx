import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { API } from "@/lib/api";
import { PageHeader, AttStatusBadge, EmptyState } from "@/components/common";
import { fmtDate } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, FileBarChart } from "lucide-react";

export default function Reports() {
  const [att, setAtt] = useState([]);
  const [leave, setLeave] = useState([]);
  const [range, setRange] = useState({ from: "", to: "" });

  const loadAtt = () => api.get("/reports/attendance", { params: { date_from: range.from || undefined, date_to: range.to || undefined } }).then(({ data }) => setAtt(data));
  useEffect(() => { loadAtt(); }, [range]);
  useEffect(() => { api.get("/reports/leave").then(({ data }) => setLeave(data)); }, []);

  const download = (path) => {
    const p = new URLSearchParams();
    if (range.from) p.set("date_from", range.from);
    if (range.to) p.set("date_to", range.to);
    window.open(`${API}${path}?${p.toString()}`, "_blank");
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Attendance and leave reports with CSV / Excel export" testId="reports-page" />
      <Tabs defaultValue="attendance">
        <TabsList><TabsTrigger value="attendance" data-testid="tab-att-report">Attendance</TabsTrigger><TabsTrigger value="leave" data-testid="tab-leave-report">Leave</TabsTrigger></TabsList>

        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end bg-white border border-border rounded-lg p-4">
            <div><Label>From</Label><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} data-testid="rep-from" className="mt-1.5" /></div>
            <div><Label>To</Label><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} data-testid="rep-to" className="mt-1.5" /></div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => download("/reports/attendance/export/csv")} data-testid="att-csv"><FileDown className="h-4 w-4 mr-2" />CSV</Button>
              <Button className="bg-medalyze-dark hover:bg-medalyze-forest" onClick={() => download("/reports/attendance/export/excel")} data-testid="att-excel"><FileDown className="h-4 w-4 mr-2" />Excel</Button>
            </div>
          </div>
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            {att.length === 0 ? <EmptyState icon={FileBarChart} title="No records for this range" /> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Employee</TableHead><TableHead>Login</TableHead><TableHead>Logout</TableHead><TableHead>Productive</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{att.slice(0, 100).map((r, i) => <TableRow key={i}><TableCell>{fmtDate(r.Date)}</TableCell><TableCell>{r.Employee}</TableCell><TableCell>{r.Login || "—"}</TableCell><TableCell>{r.Logout || "—"}</TableCell><TableCell>{r["Productive Min"]}m</TableCell><TableCell><AttStatusBadge status={r.Status} /></TableCell></TableRow>)}</TableBody>
              </Table></div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="leave" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => window.open(`${API}/reports/leave/export/csv`, "_blank")} data-testid="leave-csv"><FileDown className="h-4 w-4 mr-2" />CSV</Button>
            <Button className="bg-medalyze-dark hover:bg-medalyze-forest" onClick={() => window.open(`${API}/reports/leave/export/excel`, "_blank")} data-testid="leave-excel"><FileDown className="h-4 w-4 mr-2" />Excel</Button>
          </div>
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            {leave.length === 0 ? <EmptyState icon={FileBarChart} title="No leave records" /> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Days</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{leave.slice(0, 100).map((r, i) => <TableRow key={i}><TableCell>{r.Employee}</TableCell><TableCell>{r["Leave Type"]}</TableCell><TableCell>{fmtDate(r.From)}</TableCell><TableCell>{fmtDate(r.To)}</TableCell><TableCell>{r.Days}</TableCell><TableCell className="capitalize">{(r.Status || "").replace("_", " ")}</TableCell></TableRow>)}</TableBody>
              </Table></div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
