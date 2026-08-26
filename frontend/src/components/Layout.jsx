import React, { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Clock, CalendarDays, CalendarCheck, Scale, Building2,
  FileBarChart, Bell, ShieldCheck, Settings as SettingsIcon, UserCircle, LogOut,
  Menu, KeyRound, Briefcase, Network, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { MedalyzeLogo } from "@/components/MedalyzeLogo";
import { ROLE_LABEL } from "@/lib/format";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

function navFor(user) {
  const isAdmin = user.role === "org_admin" || user.role === "super_admin";
  const isManager = user.role === "manager";
  const common = [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }];
  if (isAdmin) {
    const items = [
      ...common,
      { to: "/employees", label: "Employees", icon: Users },
      { to: "/attendance", label: "Attendance", icon: Clock },
      { to: "/leave-management", label: "Leave Management", icon: CalendarCheck },
      { to: "/leave-balances", label: "Leave Balances", icon: Scale },
      { to: "/holidays", label: "Holiday Calendar", icon: CalendarDays },
      { to: "/clients", label: "Clients", icon: Building2 },
      { to: "/reports", label: "Reports", icon: FileBarChart },
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/audit-logs", label: "Audit Logs", icon: ShieldCheck },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ];
    if (user.role === "super_admin") items.splice(1, 0, { to: "/organizations", label: "Organizations", icon: Network });
    return items;
  }
  if (isManager) {
    return [
      ...common,
      { to: "/my-attendance", label: "My Attendance", icon: Clock },
      { to: "/employees", label: "My Team", icon: Users },
      { to: "/leave-management", label: "Team Leave", icon: CalendarCheck },
      { to: "/my-leave", label: "My Leave", icon: Briefcase },
      { to: "/holidays", label: "Holiday Calendar", icon: CalendarDays },
      { to: "/my-clients", label: "My Clients", icon: Building2 },
      { to: "/notifications", label: "Notifications", icon: Bell },
    ];
  }
  return [
    ...common,
    { to: "/my-attendance", label: "My Attendance", icon: Clock },
    { to: "/my-leave", label: "My Leave", icon: Briefcase },
    { to: "/holidays", label: "Holiday Calendar", icon: CalendarDays },
    { to: "/my-clients", label: "My Clients", icon: Building2 },
    { to: "/notifications", label: "Notifications", icon: Bell },
  ];
}

function SidebarContent({ user, collapsed, onNavigate }) {
  const items = navFor(user);
  return (
    <div className="flex flex-col h-full medalyze-sidebar text-white">
      <div className={`h-16 flex items-center border-b border-white/10 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        {collapsed ? <MedalyzeLogo size={30} showText={false} /> : <MedalyzeLogo size={34} textClass="text-white" />}
      </div>
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="space-y-1">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate}
              data-testid={`nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-lime-400 text-medalyze-dark" : "text-white/80 hover:bg-white/10 hover:text-white"
                } ${collapsed ? "justify-center px-2" : ""}`
              } title={collapsed ? it.label : undefined}>
              <it.icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
              {!collapsed && <span className="truncate">{it.label}</span>}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
      {!collapsed && (
        <div className="p-3 border-t border-white/10">
          <a href="https://www.medalyzeus.com" target="_blank" rel="noreferrer"
             className="text-[11px] text-white/60 hover:text-lime-300 transition-colors" data-testid="sidebar-website-link">
            www.medalyzeus.com
          </a>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notif, setNotif] = useState({ items: [], unread: 0 });

  const loadNotif = async () => {
    try { const { data } = await api.get("/notifications"); setNotif(data); } catch {}
  };
  useEffect(() => { loadNotif(); const t = setInterval(loadNotif, 30000); return () => clearInterval(t); }, [location.pathname]);

  const markRead = async (id) => { await api.post(`/notifications/${id}/read`); loadNotif(); };
  const markAll = async () => { await api.post("/notifications/read-all"); loadNotif(); };

  const initials = `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:block shrink-0 transition-all duration-200 ${collapsed ? "w-[76px]" : "w-64"}`}>
        <div className="fixed top-0 bottom-0 z-30" style={{ width: collapsed ? 76 : 256 }}>
          <SidebarContent user={user} collapsed={collapsed} />
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="h-16 sticky top-0 z-20 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" data-testid="mobile-menu-btn"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 border-0">
                <SidebarContent user={user} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex text-slate-500"
                    onClick={() => setCollapsed(!collapsed)} data-testid="collapse-sidebar-btn">
              {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>
            <div className="lg:hidden"><MedalyzeLogo size={28} /></div>
            <div className="hidden lg:block">
              <p className="text-xs text-slate-400 font-medium">{user.organization_name}</p>
              <p className="text-sm font-head font-semibold text-medalyze-dark -mt-0.5">Employee Management, Attendance & Operations</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" data-testid="notif-bell">
                  <Bell className="h-5 w-5 text-slate-600" />
                  {notif.unread > 0 && <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-lime-500 text-[10px] font-bold text-medalyze-dark flex items-center justify-center">{notif.unread}</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
                  {notif.unread > 0 && <button onClick={markAll} className="text-xs text-medalyze-forest hover:underline" data-testid="notif-mark-all">Mark all read</button>}
                </div>
                <DropdownMenuSeparator />
                <ScrollArea className="h-80">
                  {notif.items.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>}
                  {notif.items.map((n) => (
                    <button key={n.id} onClick={() => { markRead(n.id); if (n.link) navigate(n.link); }}
                      className={`w-full text-left px-3 py-2.5 hover:bg-muted border-b border-border/60 ${!n.read ? "bg-lime-50/60" : ""}`}
                      data-testid={`notif-item-${n.id}`}>
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    </button>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors" data-testid="user-menu-btn">
                  <Avatar className="h-8 w-8"><AvatarFallback className="bg-medalyze-dark text-white text-xs font-semibold">{initials}</AvatarFallback></Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-semibold text-slate-800 leading-none">{user.first_name} {user.last_name}</p>
                    <p className="text-[11px] text-muted-foreground">{ROLE_LABEL[user.role]}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")} data-testid="menu-profile"><UserCircle className="h-4 w-4 mr-2" />My Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/change-password")} data-testid="menu-change-password"><KeyRound className="h-4 w-4 mr-2" />Change Password</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-red-600" data-testid="menu-logout"><LogOut className="h-4 w-4 mr-2" />Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1600px] w-full animate-fade-up">{children}</main>
        <footer className="px-6 py-4 border-t border-border text-center text-xs text-muted-foreground">
          Medalyze Medtech LLP · <a href="https://www.medalyzeus.com" target="_blank" rel="noreferrer" className="text-medalyze-forest hover:underline">www.medalyzeus.com</a>
        </footer>
      </div>
    </div>
  );
}
