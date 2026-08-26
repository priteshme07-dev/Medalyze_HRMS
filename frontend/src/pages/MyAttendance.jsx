import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, AttStatusBadge, EmptyState } from "@/components/common";
import { fmtDate, fmtTime, fmtMinutes } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock } from "lucide-react";

export default function MyAttendance() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/attendance").then(({ data }) => setRows(data)).catch(() => {}); }, []);
  return (
    <>
      <PageHeader title="My Attendance" subtitle="Your attendance history and productive time" testId="my-attendance-page" />
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={Clock} title="No attendance records yet" hint="Clock in from your dashboard to begin." /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Login</TableHead><TableHead>Logout</TableHead>
                <TableHead>Total</TableHead><TableHead>Break</TableHead><TableHead>Productive</TableHead>
                <TableHead>Late</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} data-testid={`att-row-${a.id}`}>
                    <TableCell className="font-medium">{fmtDate(a.date)}</TableCell>
                    <TableCell>{fmtTime(a.login_time)}</TableCell>
                    <TableCell>{fmtTime(a.logout_time)}</TableCell>
                    <TableCell>{fmtMinutes(a.total_logged_minutes)}</TableCell>
                    <TableCell>{fmtMinutes(a.total_break_minutes)}</TableCell>
                    <TableCell>{fmtMinutes(a.productive_minutes)}</TableCell>
                    <TableCell>{a.late_minutes ? `${a.late_minutes}m` : "—"}</TableCell>
                    <TableCell><AttStatusBadge status={a.status} /></TableCell>
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
