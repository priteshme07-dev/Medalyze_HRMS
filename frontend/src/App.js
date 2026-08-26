import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import { Login, ForgotPassword, ResetPassword } from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import MyAttendance from "@/pages/MyAttendance";
import MyLeave from "@/pages/MyLeave";
import Holidays from "@/pages/Holidays";
import MyClients from "@/pages/MyClients";
import Profile from "@/pages/Profile";
import ChangePassword from "@/pages/ChangePassword";
import Employees from "@/pages/Employees";
import EmployeeDetail from "@/pages/EmployeeDetail";
import AttendanceAdmin from "@/pages/AttendanceAdmin";
import LeaveManagement from "@/pages/LeaveManagement";
import LeaveBalances from "@/pages/LeaveBalances";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Reports from "@/pages/Reports";
import NotificationsPage from "@/pages/NotificationsPage";
import AuditLogs from "@/pages/AuditLogs";
import Settings from "@/pages/Settings";
import Organizations from "@/pages/Organizations";
import { Loader2 } from "lucide-react";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-medalyze-forest" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-medalyze-forest" /></div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/my-attendance" element={<Protected><MyAttendance /></Protected>} />
      <Route path="/my-leave" element={<Protected><MyLeave /></Protected>} />
      <Route path="/holidays" element={<Protected><Holidays /></Protected>} />
      <Route path="/my-clients" element={<Protected><MyClients /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/change-password" element={<Protected><ChangePassword /></Protected>} />
      <Route path="/employees" element={<Protected><Employees /></Protected>} />
      <Route path="/employees/:id" element={<Protected><EmployeeDetail /></Protected>} />
      <Route path="/attendance" element={<Protected><AttendanceAdmin /></Protected>} />
      <Route path="/leave-management" element={<Protected><LeaveManagement /></Protected>} />
      <Route path="/leave-balances" element={<Protected><LeaveBalances /></Protected>} />
      <Route path="/clients" element={<Protected><Clients /></Protected>} />
      <Route path="/clients/:id" element={<Protected><ClientDetail /></Protected>} />
      <Route path="/reports" element={<Protected><Reports /></Protected>} />
      <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
      <Route path="/audit-logs" element={<Protected><AuditLogs /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/organizations" element={<Protected><Organizations /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
