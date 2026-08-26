import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/common";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Bell, BellRing } from "lucide-react";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/notifications").then(({ data }) => setItems(data.items));
  useEffect(() => { load(); }, []);
  const markAll = async () => { await api.post("/notifications/read-all"); load(); };
  const markRead = async (id) => { await api.post(`/notifications/${id}/read`); load(); };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Your alerts and announcements" testId="notifications-page"
        actions={<Button variant="outline" onClick={markAll} data-testid="mark-all-btn">Mark all read</Button>} />
      <div className="bg-white border border-border rounded-lg divide-y divide-border">
        {items.length === 0 ? <EmptyState icon={Bell} title="No notifications" /> : items.map((n) => (
          <button key={n.id} onClick={() => markRead(n.id)} className={`w-full text-left flex items-start gap-3 p-4 hover:bg-muted transition-colors ${!n.read ? "bg-lime-50/50" : ""}`} data-testid={`np-${n.id}`}>
            <div className={`rounded-md p-2 ${!n.read ? "bg-lime-100 text-lime-700" : "bg-slate-100 text-slate-400"}`}>{!n.read ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}</div>
            <div className="flex-1"><p className="font-medium text-slate-800">{n.title}</p><p className="text-sm text-muted-foreground">{n.message}</p><p className="text-xs text-slate-400 mt-1">{fmtDateTime(n.created_at)}</p></div>
          </button>
        ))}
      </div>
    </>
  );
}
