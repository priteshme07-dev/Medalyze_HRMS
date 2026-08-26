import React, { useEffect, useState, useRef } from "react";
import api, { formatApiError } from "@/lib/api";
import { fmtHMS, fmtTime, fmtMinutes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Coffee, Play } from "lucide-react";
import { AttStatusBadge } from "@/components/common";
import { toast } from "sonner";

export default function ClockWidget({ onChange }) {
  const [att, setAtt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = async () => {
    try { const { data } = await api.get("/attendance/today"); setAtt(data); } catch {}
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { timer.current = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer.current); }, []);

  const act = async (fn) => {
    setBusy(true);
    try { await fn(); await load(); onChange && onChange(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const loggedIn = att && att.login_time;
  const loggedOut = att && att.logout_time;
  const onBreak = att && att.on_break;
  const activeBreak = onBreak && (att.breaks || []).find((b) => !b.end);

  let elapsed = 0;
  if (onBreak && activeBreak) elapsed = (now - new Date(activeBreak.start).getTime()) / 1000;
  else if (loggedIn && !loggedOut) elapsed = (now - new Date(att.login_time).getTime()) / 1000;

  return (
    <div className="bg-white border border-border rounded-lg p-6" data-testid="clock-widget">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Today's Attendance</p>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        {att && <AttStatusBadge status={att.status} />}
      </div>

      <div className={`rounded-lg py-6 text-center ${onBreak ? "bg-blue-50" : loggedIn && !loggedOut ? "bg-lime-50" : "bg-slate-50"}`}>
        {onBreak && <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600 mb-1">On Break</p>}
        {loggedOut ? (
          <p className="font-head text-3xl font-extrabold text-medalyze-dark">Shift Complete</p>
        ) : (
          <p className="font-head text-4xl sm:text-5xl font-extrabold tracking-tight text-medalyze-dark tabular-nums" data-testid="live-timer">
            {loggedIn ? fmtHMS(elapsed) : "--:--:--"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4 text-center">
        <div><p className="text-[11px] uppercase text-slate-400 font-semibold">Login</p><p className="text-sm font-semibold text-slate-700">{fmtTime(att?.login_time)}</p></div>
        <div><p className="text-[11px] uppercase text-slate-400 font-semibold">Break</p><p className="text-sm font-semibold text-slate-700">{fmtMinutes(att?.total_break_minutes)}</p></div>
        <div><p className="text-[11px] uppercase text-slate-400 font-semibold">Productive</p><p className="text-sm font-semibold text-slate-700">{att?.logout_time ? fmtMinutes(att?.productive_minutes) : "—"}</p></div>
      </div>

      <div className="mt-5 space-y-2.5">
        {!loggedIn && (
          <Button disabled={busy} onClick={() => act(() => api.post("/attendance/login"))}
            className="w-full py-6 text-base bg-lime-500 hover:bg-lime-600 text-medalyze-dark font-semibold" data-testid="clock-in-btn">
            <LogIn className="h-5 w-5 mr-2" />Clock In
          </Button>
        )}
        {loggedIn && !loggedOut && (
          <div className="grid grid-cols-2 gap-2.5">
            {!onBreak ? (
              <Button disabled={busy} onClick={() => act(() => api.post("/breaks/start"))} variant="outline"
                className="py-6 border-blue-300 text-blue-700 hover:bg-blue-50" data-testid="start-break-btn">
                <Coffee className="h-5 w-5 mr-2" />Start Break
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => act(() => api.post("/breaks/end"))}
                className="py-6 bg-blue-600 hover:bg-blue-700 text-white" data-testid="end-break-btn">
                <Play className="h-5 w-5 mr-2" />End Break
              </Button>
            )}
            <Button disabled={busy || onBreak} onClick={() => act(() => api.post("/attendance/logout"))}
              className="py-6 bg-medalyze-dark hover:bg-medalyze-forest text-white" data-testid="clock-out-btn">
              <LogOut className="h-5 w-5 mr-2" />Logout
            </Button>
          </div>
        )}
        {loggedOut && <p className="text-center text-sm text-emerald-700 font-medium">You've completed your shift today. Great work!</p>}
      </div>
    </div>
  );
}
