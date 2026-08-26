import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { MedalyzeLogo } from "@/components/MedalyzeLogo";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const BG = "https://images.unsplash.com/photo-1781513144825-aa1e284c5950?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBtZWRpY2FsJTIwb2ZmaWNlJTIwaW50ZXJpb3J8ZW58MHx8fHwxNzg3NzU3NDYxfDA&ixlib=rb-4.1.0&q=85";

function AuthShell({ children }) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex flex-1 relative medalyze-sidebar">
        <img src={BG} alt="Medalyze medical office" className="absolute inset-0 w-full h-full object-cover opacity-25" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <MedalyzeLogo size={44} textClass="text-white" />
          <div>
            <h2 className="font-head text-4xl font-extrabold tracking-tight leading-tight">Medalyze HRMS</h2>
            <p className="mt-3 text-white/80 max-w-md">Employee Management, Attendance & Operations — a secure internal platform built for Medalyze Medtech LLP.</p>
          </div>
          <p className="text-white/50 text-sm">www.medalyzeus.com</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await login(email, password); toast.success("Welcome back"); navigate("/"); }
    catch (err) { setError(formatApiError(err.response?.data?.detail) || err.message); }
    finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <div className="lg:hidden mb-8 flex justify-center"><MedalyzeLogo size={40} /></div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Medalyze Medtech LLP</p>
      <h1 className="font-head text-3xl font-extrabold tracking-tight text-medalyze-dark mt-1">Sign in</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Access your HRMS workspace.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                 placeholder="you@medalyzeus.com" data-testid="login-email" className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                 placeholder="••••••••" data-testid="login-password" className="mt-1.5" />
        </div>
        {error && <p className="text-sm text-red-600" data-testid="login-error">{error}</p>}
        <Button type="submit" disabled={loading} data-testid="login-submit-button"
                className="w-full bg-medalyze-dark hover:bg-medalyze-forest text-white">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Login
        </Button>
      </form>
      <div className="mt-4 text-center">
        <Link to="/forgot-password" className="text-sm text-medalyze-forest hover:underline" data-testid="forgot-password-link">Forgot Password?</Link>
      </div>
      <p className="mt-8 text-center text-xs text-slate-400">
        <a href="https://www.medalyzeus.com" target="_blank" rel="noreferrer" className="hover:text-medalyze-forest">www.medalyzeus.com</a>
      </p>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setSent(true); if (data.dev_token) setDevToken(data.dev_token);
    } catch { setSent(true); } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <div className="lg:hidden mb-8 flex justify-center"><MedalyzeLogo size={40} /></div>
      <h1 className="font-head text-2xl font-extrabold tracking-tight text-medalyze-dark">Reset your password</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Enter your email and we'll send you a secure reset link.</p>
      {sent ? (
        <div className="space-y-4" data-testid="forgot-success">
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
            If an account exists for {email}, a reset link has been generated.
          </p>
          {devToken && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="font-semibold text-amber-800">Dev reset link (email not wired yet):</p>
              <Link to={`/reset-password?token=${devToken}`} className="text-medalyze-forest underline break-all" data-testid="dev-reset-link">
                /reset-password?token={devToken.slice(0, 24)}…
              </Link>
            </div>
          )}
          <Link to="/login" className="inline-flex items-center text-sm text-medalyze-forest hover:underline"><ArrowLeft className="h-4 w-4 mr-1" />Back to login</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="fp-email">Email</Label>
            <Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                   data-testid="forgot-email" className="mt-1.5" placeholder="you@medalyzeus.com" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-medalyze-dark hover:bg-medalyze-forest" data-testid="forgot-submit">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send reset link
          </Button>
          <Link to="/login" className="inline-flex items-center text-sm text-medalyze-forest hover:underline"><ArrowLeft className="h-4 w-4 mr-1" />Back to login</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [pw, setPw] = useState(""); const [cpw, setCpw] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw, confirm_password: cpw });
      toast.success("Password reset successful. Please sign in."); navigate("/login");
    } catch (err) { setError(formatApiError(err.response?.data?.detail)); } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <div className="lg:hidden mb-8 flex justify-center"><MedalyzeLogo size={40} /></div>
      <h1 className="font-head text-2xl font-extrabold tracking-tight text-medalyze-dark">Set a new password</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Choose a strong password (min 8 characters).</p>
      <form onSubmit={submit} className="space-y-4">
        <div><Label>New Password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} data-testid="reset-password" className="mt-1.5" /></div>
        <div><Label>Confirm Password</Label><Input type="password" value={cpw} onChange={(e) => setCpw(e.target.value)} required data-testid="reset-confirm" className="mt-1.5" /></div>
        {error && <p className="text-sm text-red-600" data-testid="reset-error">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full bg-medalyze-dark hover:bg-medalyze-forest" data-testid="reset-submit">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Update password
        </Button>
      </form>
    </AuthShell>
  );
}
