import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Upload,
  FileSearch,
  Network,
  Globe2,
  MapPin,
  ShieldAlert,
  Radar,
  FolderKanban,
  Archive,
  History,
  FileText,
  Bell,
  Bot,
  Settings,
  Users,
  LogOut,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const NAV_GROUPS = [
  {
    label: null,
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Investigate",
    items: [
      { to: "/investigate/upload", label: "Upload Email", icon: Upload },
      { to: "/investigate/emails", label: "All Emails", icon: FileSearch },
      { to: "/investigate/threat-graph", label: "Threat Graph", icon: Network },
    ],
  },
  {
    label: null,
    items: [
      { to: "/threat-intelligence", label: "Threat Intelligence", icon: Radar },
      { to: "/campaigns", label: "Campaigns", icon: Globe2 },
      { to: "/cases", label: "Cases", icon: FolderKanban },
      { to: "/evidence", label: "Evidence Vault", icon: Archive },
      { to: "/reports", label: "Forensic Reports", icon: FileText },
      { to: "/alerts", label: "Alerts", icon: Bell },
      { to: "/copilot", label: "Forensic Copilot", icon: Bot },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/audit", label: "Audit Log", icon: History },
      { to: "/admin/users", label: "Administration", icon: Users },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 shrink-0 border-r border-forensic-border bg-forensic-panel flex flex-col">
        <div className="px-4 py-5 border-b border-forensic-border">
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-forensic-accent" size={22} />
            <div>
              <div className="font-mono font-bold text-slate-100 tracking-wide">AI-MailNlyzer</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Forensic Intelligence Platform</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {NAV_GROUPS.map((group, i) => (
            <div key={i}>
              {group.label && (
                <div className="px-3 text-[10px] uppercase tracking-widest text-slate-600 mb-1">{group.label}</div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={"end" in item ? item.end : false}
                    className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-forensic-border">
          <div className="text-xs text-slate-400 mb-2">
            {user?.fullName ?? user?.email} <span className="text-slate-600">·</span> {user?.role}
          </div>
          <button onClick={handleLogout} className="nav-link w-full text-left">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
