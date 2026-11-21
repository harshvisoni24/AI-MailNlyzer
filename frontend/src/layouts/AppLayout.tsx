import ThemeToggle from "../components/ThemeToggle";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Upload,
  FileSearch,
  Network,
  Globe2,
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
  Search,
  ChevronDown,
  Microscope,
  Shield,
  Mail,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

type Item = { to: string; label: string; icon: any };

const THREAT_INTEL: Item[] = [
  { to: "/threat-intelligence", label: "Threat Intelligence", icon: Radar },
  { to: "/campaigns", label: "Campaigns", icon: Globe2 },
  { to: "/investigate/threat-graph", label: "Threat Graph", icon: Network },
];
const INVESTIGATIONS: Item[] = [
  { to: "/investigate/emails", label: "All Emails", icon: FileSearch },
  { to: "/cases", label: "Cases", icon: FolderKanban },
  { to: "/evidence", label: "Evidence Vault", icon: Archive },
  { to: "/copilot", label: "Forensic Copilot", icon: Bot },
];
const REPORTS: Item[] = [{ to: "/reports", label: "Forensic Reports", icon: FileText }];
const MORE: Item[] = [
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/audit", label: "Audit Log", icon: History },
  { to: "/admin/users", label: "Administration", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Dropdown({ label, icon: Icon, items }: { label: string; icon: any; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const active = items.some((i) => location.pathname.startsWith(i.to));

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={`top-link ${active ? "active" : ""}`}>
        <Icon size={15} className="hidden min-[1500px]:block" />
        {label}
        <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="dropdown-menu absolute left-0 top-full mt-2 min-w-[210px] panel p-1.5 z-50 shadow-glow">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${
                  isActive ? "bg-sky-500/20 text-sky-700 dark:text-white" : "text-slate-300 hover:bg-slate-500/10 hover:text-sky-700 dark:hover:text-white"
                }`
              }
            >
              <i.icon size={15} />
              {i.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get("/alerts")
      .then((res) => setUnread((res.data as { isRead: boolean }[]).filter((a) => !a.isRead).length))
      .catch(() => setUnread(0));
  }, [location.pathname]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/investigate/emails?q=${encodeURIComponent(q)}`);
  }

  const name = user?.fullName ?? user?.email ?? "User";
  const initials = name
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="shrink-0 border-b border-sky-500/30 bg-[#040d1f]/90 backdrop-blur shadow-[0_1px_20px_-6px_rgba(56,189,248,0.4)] z-40">
        <div className="flex items-center gap-4 px-5 h-[68px]">
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="relative">
              <Shield className="text-sky-400" size={34} strokeWidth={1.6} />
              <ShieldAlert className="absolute inset-0 m-auto text-sky-300" size={15} />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-slate-50 text-[17px] tracking-wide">AI-MailNlyzer</div>
              <div className="text-[10px] text-slate-400">Forensic Intelligence Platform</div>
            </div>
          </NavLink>

          <nav className="flex items-center gap-1 ml-4">
            <NavLink to="/" end className={({ isActive }) => `top-link ${isActive ? "active" : ""}`}>
              <LayoutDashboard size={15} className="hidden min-[1500px]:block" /> Dashboard
            </NavLink>
            <NavLink to="/investigate/upload" className={({ isActive }) => `top-link ${isActive ? "active" : ""}`}>
              <Upload size={15} className="hidden min-[1500px]:block" /> Upload Email
            </NavLink>
            <Dropdown label="Threat Intelligence" icon={Radar} items={THREAT_INTEL} />
            <Dropdown label="Investigations" icon={Microscope} items={INVESTIGATIONS} />
            <Dropdown label="Reports" icon={FileText} items={REPORTS} />
            <Dropdown label="More" icon={Settings} items={MORE} />
          </nav>

          <form onSubmit={handleSearch} className="ml-auto relative w-[300px] min-w-[200px] shrink max-w-[24vw]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emails, domains, IPs..."
              className="w-full rounded-full bg-[#0a1a38]/80 border border-sky-500/30 pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />
          </form>

          <div className="h-8 w-px bg-sky-500/20" />

          <NavLink to="/alerts" className="relative p-2 rounded-full hover:bg-slate-500/10">
            <Bell size={20} className="text-sky-300" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </NavLink>

          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2.5 pl-1">
              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-sm font-bold text-white ring-2 ring-sky-400/40">
                {initials}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-[#040d1f]" />
              </div>
              <div className="text-left leading-tight hidden min-[1400px]:block whitespace-nowrap">
                <div className="text-sm font-semibold text-slate-100">{name}</div>
                <div className="text-[11px] text-slate-400 capitalize">{user?.role?.toLowerCase()}</div>
              </div>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {menuOpen && (
              <div className="dropdown-menu absolute right-0 top-full mt-2 w-44 panel p-1.5 z-50">
                <NavLink to="/settings" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-500/10">
                  <Settings size={15} /> Settings
                </NavLink>
                <div className="px-1 pb-2"><ThemeToggle/></div>
                <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-500/10">
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <footer className="relative shrink-0 overflow-hidden h-[60px] px-5 flex items-center justify-between text-[11.5px] text-slate-300 bg-gradient-to-r from-[#061633] via-[#040d1f] to-[#061a3d] border-t border-sky-500/20">
        {/* glowing top edge */}
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent" />
        <div className="pointer-events-none absolute -top-2 left-[8%] w-[34%] h-4 bg-sky-400/30 blur-xl" />
        <style>{`@keyframes footer-scan{from{transform:translateX(-100%)}to{transform:translateX(420%)}}`}</style>
        {/* scan light sweeping along the top edge */}
        <div
          className="pointer-events-none absolute top-0 left-0 h-[2px] w-1/5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent"
          style={{ animation: "footer-scan 6s linear infinite" }}
        />
        {/* circuit traces */}
        <img
         src="/digital_india_background.svg"
         alt=""
         aria-hidden
         className="pointer-events-none absolute right-0 bottom-0 h-full w-auto max-w-[380px] object-contain object-right-bottom opacity-60"
         style={{ maskImage: "linear-gradient(to right, transparent, #000 40%)", WebkitMaskImage: "linear-gradient(to right, transparent, #000 40%)" }}
         />       
        {/* soft glow at the right end */}
        <div className="pointer-events-none absolute right-0 top-0 h-full w-[420px] bg-[radial-gradient(ellipse_at_100%_100%,rgba(37,99,235,0.28),transparent_70%)]" />

        <div className="relative z-10 flex items-center gap-2.5">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-sky-400/40 blur-md" />
            <img
              src="/bvm-logo.png"
              alt="BVM logo"
              className="relative h-11 w-11 rounded-full bg-white object-contain p-0.5 ring-2 ring-sky-400/70 shadow-glow"
            />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold tracking-wide text-white">
              BVM_<span className="text-sky-400">Team_Suspicious</span>
            </div>
            <div className="text-[10px] text-slate-400">Birla Vishvakarma Mahavidyalaya</div>
          </div>
        </div>

        <div className="relative z-10 hidden lg:flex items-center gap-3 text-slate-200">
          <span className="w-32 h-px bg-gradient-to-r from-transparent to-slate-200/80" />
          <span className="flex items-center gap-1.5"><Lock size={12} className="text-sky-400" />Secure</span><span className="text-sky-400">•</span>
          <span className="flex items-center gap-1.5"><Search size={12} className="text-sky-400" />Analyze</span><span className="text-sky-400">•</span>
          <span className="flex items-center gap-1.5"><Radar size={12} className="text-sky-400" />Investigate</span><span className="text-sky-400">•</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-sky-400" />Protect</span>
          <span className="w-32 h-px bg-gradient-to-l from-transparent to-slate-200/80" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <span className="flex items-center gap-2 text-white font-semibold">
            <span className="relative flex items-center justify-center">
              <Shield size={20} className="text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]" strokeWidth={1.6} />
              <Mail size={9} className="absolute text-sky-200" />
            </span>
            AI-MailNlyzer <span className="font-normal text-slate-400">v1.0.0</span>
          </span>
          <span className="h-6 w-px bg-sky-500/40" />
          <span className="hidden md:inline text-slate-300">Powered by AI • Built for a Safer Digital India</span>
        </div>
      </footer>
    </div>
  );
}
