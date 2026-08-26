import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [org, setOrg] = useState(null);
  const [types, setTypes] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/settings/organization").then(({ data }) => setOrg(data));
    api.get("/settings/leave-types").then(({ data }) => setTypes(data)).catch(() => {});
  }, []);
  if (!org) return null;
  const set = (k, v) => setOrg((o) => ({ ...o, [k]: v }));

  const saveOrg = async () => {
    setBusy(true);
    try { await api.put("/settings/organization", { reason: "Settings updated", data: { name: org.name, website: org.website, timezone: org.timezone, grace_minutes: parseInt(org.grace_minutes), break_minutes: parseInt(org.break_minutes), productive_minutes: parseInt(org.productive_minutes) } }); toast.success("Settings saved"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };

  const updateType = async (t, patch) => {
    try { await api.put(`/settings/leave-types/${t.id}`, { ...t, ...patch }); toast.success("Leave type updated"); api.get("/settings/leave-types").then(({ data }) => setTypes(data)); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Organization, attendance and leave policy configuration" testId="settings-page" />
      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org" data-testid="tab-org">Organization</TabsTrigger>
          <TabsTrigger value="attendance" data-testid="tab-att-settings">Attendance</TabsTrigger>
          <TabsTrigger value="leave" data-testid="tab-leave-policy">Leave Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="org" className="mt-4">
          <div className="bg-white border border-border rounded-lg p-6 max-w-xl space-y-4">
            <div><Label>Organization Name</Label><Input value={org.name || ""} onChange={(e) => set("name", e.target.value)} data-testid="org-name" className="mt-1.5" /></div>
            <div><Label>Website</Label><Input value={org.website || ""} onChange={(e) => set("website", e.target.value)} data-testid="org-website" className="mt-1.5" /></div>
            <div><Label>Timezone</Label><Input value={org.timezone || ""} onChange={(e) => set("timezone", e.target.value)} data-testid="org-tz" className="mt-1.5" /></div>
            <Button onClick={saveOrg} disabled={busy} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="save-org-btn">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <div className="bg-white border border-border rounded-lg p-6 max-w-xl space-y-4">
            <div><Label>Grace Period (minutes)</Label><Input type="number" value={org.grace_minutes ?? 15} onChange={(e) => set("grace_minutes", e.target.value)} data-testid="grace-min" className="mt-1.5" /></div>
            <div><Label>Allowed Break (minutes)</Label><Input type="number" value={org.break_minutes ?? 60} onChange={(e) => set("break_minutes", e.target.value)} data-testid="break-min" className="mt-1.5" /></div>
            <div><Label>Required Productive (minutes)</Label><Input type="number" value={org.productive_minutes ?? 480} onChange={(e) => set("productive_minutes", e.target.value)} data-testid="prod-min" className="mt-1.5" /></div>
            <p className="text-xs text-muted-foreground">Break &gt; 60 min = Break Violation · &gt; 90 min = Half Day · Productive &lt; target = Incomplete Shift</p>
            <Button onClick={saveOrg} disabled={busy} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="save-att-btn">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
          </div>
        </TabsContent>

        <TabsContent value="leave" className="mt-4">
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Leave Type</TableHead><TableHead>Code</TableHead><TableHead>Entitlement</TableHead><TableHead>Carry Fwd</TableHead><TableHead>Encashable</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id} data-testid={`lt-row-${t.id}`}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                    <TableCell><Input type="number" defaultValue={t.annual_entitlement} className="w-20 h-8" onBlur={(e) => e.target.value != t.annual_entitlement && updateType(t, { annual_entitlement: parseFloat(e.target.value) })} data-testid={`lt-ent-${t.code}`} /></TableCell>
                    <TableCell><Switch checked={t.carry_forward_allowed} onCheckedChange={(v) => updateType(t, { carry_forward_allowed: v })} data-testid={`lt-cf-${t.code}`} /></TableCell>
                    <TableCell><Switch checked={t.encashable} onCheckedChange={(v) => updateType(t, { encashable: v })} data-testid={`lt-enc-${t.code}`} /></TableCell>
                    <TableCell><Switch checked={t.active} onCheckedChange={(v) => updateType(t, { active: v })} data-testid={`lt-active-${t.code}`} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Leave policy rules are enforced by the server-side policy engine. Entitlements here drive annual allocation.</p>
        </TabsContent>
      </Tabs>
    </>
  );
}
