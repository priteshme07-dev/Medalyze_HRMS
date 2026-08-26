import React, { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ChangePassword() {
  const [f, setF] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post("/auth/change-password", f); toast.success("Password changed successfully"); setF({ current_password: "", new_password: "", confirm_password: "" }); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Change Password" subtitle="Update your account password" testId="change-password-page" />
      <form onSubmit={submit} className="bg-white border border-border rounded-lg p-6 max-w-md space-y-4">
        <div><Label>Current Password</Label><Input type="password" value={f.current_password} onChange={(e) => set("current_password", e.target.value)} required data-testid="cp-current" className="mt-1.5" /></div>
        <div><Label>New Password</Label><Input type="password" value={f.new_password} onChange={(e) => set("new_password", e.target.value)} required minLength={8} data-testid="cp-new" className="mt-1.5" /></div>
        <div><Label>Confirm New Password</Label><Input type="password" value={f.confirm_password} onChange={(e) => set("confirm_password", e.target.value)} required data-testid="cp-confirm" className="mt-1.5" /></div>
        <Button type="submit" disabled={busy} className="bg-medalyze-dark hover:bg-medalyze-forest" data-testid="cp-submit">{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Update Password</Button>
      </form>
    </>
  );
}
