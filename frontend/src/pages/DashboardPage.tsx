import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Mail,
  ShieldAlert,
  AlertTriangle,
  FolderOpen,
  BarChart3,
  PieChart as PieIcon,
  Zap,
  Globe2,
  Bell,
  Activity,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  Info,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CircleMarker, MapContainer, TileLayer, Tooltip as MapTooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../lib/api";
import { DashboardSummary } from "../types";
import { useAuth } from "../contexts/AuthContext";

const MALICIOUS = new Set(["PHISHING", "BEC", "MALWARE_DELIVERY", "FINANCIAL_FRAUD", "CREDENTIAL_HARVESTING", "IMPERSONATION"]);
const CLEAN = new Set(["LEGITIMATE", "LOW_RISK"]);

const C = { total: "#22d3ee", malicious: "#ef4444", suspicious: "#f59e0b", clean: "#38bdf8" };

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function level(score: number | null | undefined) {
  if (score == null) return { label: "N/A", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30", dot: "bg-slate-400" };
  if (score >= 90) return { label: "Critical", cls: "bg-red-500/20 text-red-400 border-red-500/40", dot: "bg-red-500" };
  if (score >= 70) return { label: "High", cls: "bg-orange-500/20 text-orange-300 border-orange-500/40", dot: "bg-sky-400" };
  if (score >= 40) return { label: "Medium", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", dot: "bg-yellow-400" };
  return { label: "Low", cls: "bg-green-500/20 text-green-400 border-green-500/40", dot: "bg-green-400" };
}

function Spark({ data, color, id }: { data: { v: number }[]; color: string; id: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function trend(series: number[]) {
  const half = Math.floor(series.length / 2);
  const prev = series.slice(0, half).reduce((a, b) => a + b, 0);
  const cur = series.slice(half).reduce((a, b) => a + b, 0);
  if (prev === 0) return cur === 0 ? 0 : 100;
  return Math.round(((cur - prev) / prev) * 100);
}

interface ThreatPoint {
  ip: string;
  lat: number;
  lon: number;
  city?: string;
  country?: string;
  emails: number;
  maxScore: number;
}

function FitBounds({ pts }: { pts: ThreatPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length === 0) return;
    map.fitBounds(pts.map((p) => [p.lat, p.lon] as [number, number]), { padding: [34, 34], maxZoom: 4 });
  }, [pts, map]);
  return null;
}

function pointColor(score: number) {
  return score >= 90 ? "#ef4444" : score >= 70 ? "#f97316" : "#38bdf8";
}

function growth(series: number[]) {
  const first = series[0] ?? 0;
  const last = series[series.length - 1] ?? 0;
  if (first === 0) return last === 0 ? 0 : 100;
  return Math.round(((last - first) / first) * 100);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [caseDays, setCaseDays] = useState<number[] | null>(null);

  useEffect(() => {
    api
      .get("/dashboard")
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load dashboard data. Check that the backend and database are running."));
    // Cumulative case count per day (last 7 days) for the Active Cases sparkline
    api
      .get("/cases")
      .then((res) => {
        const list = res.data as { createdAt: string }[];
        const ends = Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setHours(23, 59, 59, 999);
          d.setDate(d.getDate() - (6 - i));
          return d.getTime();
        });
        setCaseDays(ends.map((end) => list.filter((c) => new Date(c.createdAt).getTime() <= end).length));
      })
      .catch(() => setCaseDays(null));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const points = useMemo<ThreatPoint[]>(() => (data as (DashboardSummary & { threatMap?: ThreatPoint[] }) | null)?.threatMap ?? [], [data]);

  const firstName = (user?.fullName ?? user?.email ?? "Analyst").split(/[\s@]+/)[0];
  const stamp = `${now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}, ${now.toLocaleTimeString("en-GB")}`;

  const weekly = data?.weeklyTrend ?? [];
  const cats = data?.threatCategories ?? [];
  const count = (pred: (c: string) => boolean) => cats.filter((c) => pred(c.classification)).reduce((a, c) => a + c.count, 0);
  const malicious = count((c) => MALICIOUS.has(c));
  const suspicious = count((c) => c === "SUSPICIOUS");
  const clean = count((c) => CLEAN.has(c));
  const distTotal = malicious + suspicious + clean;
  const pct = (n: number) => (distTotal ? Math.round((n / distTotal) * 100) : 0);
  const dist = [
    { name: "Malicious", value: malicious, color: C.malicious },
    { name: "Suspicious", value: suspicious, color: C.suspicious },
    { name: "Clean", value: clean, color: C.clean },
  ];

  const intelFlag = (data?.systemHealth as { threatIntel?: boolean } | undefined)?.threatIntel;
  const health: { name: string; ok: boolean; optional?: boolean }[] = data
    ? [
        { name: "Analysis Engine", ok: data.systemHealth.aiService },
        ...(typeof intelFlag === "boolean" ? [{ name: "Threat Intel Feeds", ok: intelFlag, optional: true }] : []),
        { name: "Database", ok: data.systemHealth.database },
        { name: "API Services", ok: true },
      ]
    : [];
  // Optional services (API keys) don't lower the overall percentage
  const core = health.filter((h) => !h.optional);
  const healthPct = core.length ? Math.round((core.filter((h) => h.ok).length / core.length) * 100) : 0;
  const online = !!data && data.systemHealth.database;

  const cards = data
    ? [
        { label: "Emails Analyzed", value: data.metrics.emailsAnalyzed, icon: Mail, color: C.total, series: weekly.map((w) => w.total), glow: "text-cyan-300" },
        {
          label: "Threats Detected",
          value: data.metrics.threatsDetected,
          icon: ShieldAlert,
          color: "#3b82f6",
          series: weekly.map((w) => w.malicious + w.suspicious),
          glow: "text-red-400",
        },
        { label: "Critical Threats", value: data.metrics.criticalThreats, icon: AlertTriangle, color: C.malicious, series: weekly.map((w) => w.malicious), glow: "text-red-400", alwaysRed: true },
        { label: "Active Cases", value: data.metrics.activeCases, icon: FolderOpen, color: "#a855f7", series: caseDays, glow: "text-cyan-300", cumulative: true },
      ]
    : [];

  return (
    <div className="p-5 max-w-[1500px] mx-auto space-y-4">
      {error && <div className="panel p-4 text-sm text-red-400">{error}</div>}

      {/* Hero + metric cards */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.28fr)_minmax(0,1fr)] gap-4">
        <div className="panel relative overflow-hidden min-h-[190px] flex items-center pl-2 pr-6 py-4 !border-sky-400/30 shadow-[0_0_40px_-16px_rgba(56,189,248,0.7)]">
          <img
            src="/hero-map.svg"
            alt=""
            aria-hidden="true"
            className="absolute right-0 top-1/2 -translate-y-1/2 w-[48%] max-w-[520px] pointer-events-none select-none"
            style={{
              filter: "brightness(1.2) saturate(1.15)",
              maskImage: "linear-gradient(to right, transparent 0%, black 48%, black 92%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 48%, black 90%, transparent 100%)",
            }}
          />
          <img
            src="/hero-shield.svg"
            alt=""
            aria-hidden="true"
            className="relative shrink-0 w-[170px] h-auto select-none drop-shadow-[0_0_22px_rgba(34,211,238,0.3)]"
          />
          <div className="relative z-10 ml-1">
            <h1 className="text-[27px] font-bold text-white leading-tight tracking-tight">
              Welcome Back, <span className="text-cyan-400">{firstName}!</span>
            </h1>
            <p className="text-[12.5px] text-slate-100 mt-1.5 whitespace-nowrap">Here's what's happening with your security operations today.</p>
            <div className="mt-5 flex items-center gap-3 text-[13px]">
              <span className={`flex items-center gap-2 font-medium ${online ? "text-green-400" : "text-red-400"}`}>
                <span className={`w-2.5 h-2.5 rounded-full animate-pulse-dot ${online ? "bg-green-400 shadow-[0_0_8px_#4ade80]" : "bg-red-500"}`} />
                System {online ? "Online" : "Offline"}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">{stamp}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((m, i) => {
            const d = m.series ? (m.cumulative ? growth(m.series) : trend(m.series)) : null;
            const up = (d ?? 0) >= 0;
            const trendColor = m.alwaysRed ? "text-red-400" : d === null || d === 0 ? "text-green-400" : up ? "text-green-400" : "text-red-400";
            return (
              <div key={m.label} className="panel px-3.5 pt-4 pb-3 flex flex-col">
                <m.icon size={32} className={`${m.glow}`} strokeWidth={1.6} style={{ filter: `drop-shadow(0 0 7px ${m.color})` }} />
                <div className="text-[34px] font-bold text-white leading-none mt-4">{m.value}</div>
                <div className="text-[12px] text-slate-300 mt-1.5 whitespace-nowrap">{m.label}</div>
                <div className="flex items-end justify-between mt-3 h-11">
                  <span className={`text-[11.5px] font-semibold flex items-center pb-0.5 whitespace-nowrap ${trendColor}`}>
                    {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    {d !== null ? `${up ? "+" : ""}${d}%` : "—"}
                  </span>
                  <div className="w-[68px] h-11 shrink-0" style={{ filter: `drop-shadow(0 0 4px ${m.color}88)` }}>
                    {m.series ? <Spark id={`sp${i}`} color={m.color} data={m.series.map((v) => ({ v }))} /> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)_minmax(0,1.5fr)] gap-4">
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="panel-title"><BarChart3 size={18} className="text-sky-400" /> Threat Analytics</h2>
            <span className="text-xs text-slate-300 border border-sky-500/30 rounded-md px-3 py-1.5 bg-[#0a1a38]/80">Last 7 Days</span>
          </div>
          <div className="flex justify-end gap-4 text-xs text-slate-300 mb-1">
            {[["Total", C.total], ["Malicious", C.malicious], ["Suspicious", C.suspicious]].map(([n, c]) => (
              <span key={n} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{n}</span>
            ))}
          </div>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(120,170,255,0.08)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={{ stroke: "#1e3a6a" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#081226", border: "1px solid #12284a", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="total" stroke={C.total} strokeWidth={2.5} dot={{ r: 3.5, fill: C.total }} style={{ filter: "drop-shadow(0 0 5px #22d3ee)" }} />
                <Line type="monotone" dataKey="malicious" stroke={C.malicious} strokeWidth={2.5} dot={{ r: 3.5, fill: C.malicious }} style={{ filter: "drop-shadow(0 0 5px #ef4444)" }} />
                <Line type="monotone" dataKey="suspicious" stroke={C.suspicious} strokeWidth={2.5} dot={{ r: 3.5, fill: C.suspicious }} style={{ filter: "drop-shadow(0 0 5px #f59e0b)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-4 flex flex-col">
          <h2 className="panel-title mb-2"><PieIcon size={18} className="text-sky-400" /> Threat Distribution</h2>
          <div className="flex flex-1 items-center gap-3">
            <div className="relative w-[124px] h-[124px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distTotal ? dist : [{ name: "None", value: 1, color: "#12284a" }]}
                    dataKey="value"
                    innerRadius={38}
                    outerRadius={58}
                    paddingAngle={distTotal ? 2 : 0}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {(distTotal ? dist : [{ color: "#12284a" }]).map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[20px] font-bold text-white leading-none">{pct(malicious)}%</div>
                <div className="text-xs text-red-400 mt-0.5">Malicious</div>
              </div>
            </div>
            <div className="space-y-4 flex-1 text-sm">
              {dist.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-slate-200">
                    <span className="w-3.5 h-3.5 rounded-full" style={{ background: d.color, boxShadow: `0 0 8px ${d.color}` }} />
                    {d.name}
                  </span>
                  <span className="text-slate-300">{pct(d.value)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="panel-title"><Zap size={18} className="text-sky-400" /> Recent Investigations</h2>
            <Link to="/investigate/emails" className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">View All <ArrowRight size={12} /></Link>
          </div>
          <div className="divide-y divide-sky-500/10">
            {data && data.recentInvestigations.length === 0 && (
              <p className="text-sm text-slate-500 py-6">No emails analyzed yet. Try loading a demo investigation.</p>
            )}
            {data?.recentInvestigations.slice(0, 3).map((e) => {
              const l = level(e.threatScore);
              return (
                <Link key={e.id} to={`/investigate/emails/${e.id}`} className="flex items-center gap-3 py-2 hover:bg-white/5 rounded-md px-1 -mx-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${l.dot}`} />
                  <Mail size={20} className="text-slate-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-100 truncate">{e.subject}</div>
                    <div className="text-xs text-slate-400 truncate">From: {e.fromAddress}</div>
                  </div>
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border ${l.cls}`}>{l.label}</span>
                  <span className="text-xs text-slate-400 w-14 text-right shrink-0">{timeAgo(e.createdAt)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1.25fr)_minmax(0,0.9fr)] gap-4">
        <div className="panel p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="panel-title"><Globe2 size={18} className="text-sky-400" /> Global Threat Map</h2>
            <span className="text-xs text-green-400 flex items-center gap-1.5 border border-green-500/30 rounded-full px-3 py-1 bg-green-500/10">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-dot" /> Live
            </span>
          </div>
          <div className="flex flex-1 gap-3">
            <div className="relative flex-1 min-h-[160px] rounded-lg overflow-hidden border border-sky-500/25 shadow-[inset_0_0_30px_rgba(37,99,235,0.25)]">
              <div className="absolute inset-0 [&_.leaflet-tile-pane]:[filter:sepia(1)_hue-rotate(185deg)_saturate(3)_brightness(1.5)]">
                <MapContainer center={[22, 20]} zoom={1} minZoom={0} scrollWheelZoom={true} zoomControl={true} attributionControl={false} style={{ height: "100%", width: "100%", background: "#050c1c" }}>
                  <TileLayer className="map-dark" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <FitBounds pts={points} />
                  {points.map((p) => {
                    const color = pointColor(p.maxScore);
                    return (
                      <span key={p.ip}>
                        <CircleMarker center={[p.lat, p.lon]} radius={13} pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.22 }} />
                        <CircleMarker center={[p.lat, p.lon]} radius={5.5} pathOptions={{ color: "#fff", weight: 1.2, fillColor: color, fillOpacity: 1 }}>
                          <MapTooltip direction="top" offset={[0, -6]}>
                            <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                              <b>{[p.city, p.country].filter(Boolean).join(", ") || "Unknown location"}</b>
                              <br />IP: {p.ip}
                              <br />{p.emails} email{p.emails === 1 ? "" : "s"} · top score {p.maxScore}/100
                            </div>
                          </MapTooltip>
                        </CircleMarker>
                      </span>
                    );
                  })}
                </MapContainer>
              </div>
              {data && points.length === 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[500] text-center text-[11px] text-slate-200">
                  <span className="rounded-full bg-[#040a18]/80 border border-sky-500/30 px-3 py-1">No locatable sender IPs yet</span>
                </div>
              )}
            </div>
            {/* legend: same colours and tiers as the dots on the map */}
            <div className="w-[128px] shrink-0 flex flex-col justify-center gap-3.5 text-xs">
              {[
                ["Critical Sources", points.filter((p) => p.maxScore >= 90).length, 95],
                ["High-Risk Sources", points.filter((p) => p.maxScore >= 70 && p.maxScore < 90).length, 80],
                ["Suspicious Sources", points.filter((p) => p.maxScore < 70).length, 50],
              ].map(([n, v, sample]) => (
                <div key={n as string}>
                  <div className="flex items-center gap-2 text-slate-300 whitespace-nowrap">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: pointColor(sample as number), boxShadow: `0 0 7px ${pointColor(sample as number)}` }}
                    />
                    {n}
                  </div>
                  <div className="text-[19px] font-semibold text-white ml-[18px] leading-tight">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="panel-title"><Bell size={18} className="text-amber-400" /> Critical Alerts</h2>
            <Link to="/alerts" className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">View All <ArrowRight size={12} /></Link>
          </div>
          <div className="divide-y divide-sky-500/10">
            {data && data.recentAlerts.length === 0 && <p className="text-sm text-slate-500 py-6">No alerts yet.</p>}
            {data?.recentAlerts.slice(0, 3).map((a) => {
              const sev = a.severity;
              const urgent = sev === "CRITICAL" || sev === "HIGH" || sev === "MEDIUM";
              const ring = sev === "CRITICAL" ? "bg-red-500" : urgent ? "bg-amber-500" : "bg-sky-500";
              return (
                <div key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-[20px] font-bold leading-none ${ring}`}>
                    {urgent ? "!" : "i"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100 truncate">{a.title}</div>
                    {a.description && <div className="text-xs text-slate-400 truncate">{a.description}</div>}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(a.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel p-4 flex flex-col">
          <h2 className="panel-title mb-1"><Activity size={18} className="text-sky-400" /> System Health</h2>
          <div className="flex flex-1 items-center justify-center gap-5">
            <div className="flex flex-col items-center shrink-0">
              <div className="relative w-[112px] h-[112px]">
                <svg viewBox="0 0 120 120" className="w-full h-full">
                  <defs>
                    <linearGradient id="gauge" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#22c55e" />
                      <stop offset="1" stopColor="#4ade80" />
                    </linearGradient>
                  </defs>
                  <g transform="rotate(135 60 60)" fill="none" strokeWidth="9" strokeLinecap="round">
                    <circle cx="60" cy="60" r="48" stroke="#12284a" strokeDasharray="226.2 301.6" />
                    <circle
                      cx="60" cy="60" r="48" stroke="url(#gauge)"
                      strokeDasharray={`${(healthPct / 100) * 226.2} 301.6`}
                      style={{ filter: "drop-shadow(0 0 5px #22c55e)" }}
                    />
                  </g>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pb-1">
                  <Check size={26} strokeWidth={3} className="text-green-400" />
                  <div className="text-[21px] font-bold text-white leading-none mt-0.5">{healthPct}%</div>
                </div>
              </div>
              <div className={`-mt-1 text-[15px] font-semibold ${healthPct === 100 ? "text-green-400" : "text-amber-400"}`}>
                {healthPct === 100 ? "Operational" : "Degraded"}
              </div>
            </div>
            <div className="self-stretch w-px bg-sky-500/20" />
            <div className="space-y-2.5">
              {health.map((h) => {
                const dot = h.ok ? "bg-green-400" : h.optional ? "bg-amber-400" : "bg-red-500";
                const txt = h.ok ? "text-green-400" : h.optional ? "text-amber-400" : "text-red-400";
                return (
                  <div key={h.name} className="flex items-start gap-2 text-xs">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dot}`} style={{ boxShadow: h.ok ? "0 0 6px #4ade80" : undefined }} />
                    <div className="leading-tight">
                      <div className="text-slate-100">{h.name}</div>
                      <div className={txt}>{h.ok ? "Healthy" : h.optional ? "Not configured" : "Unreachable"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
