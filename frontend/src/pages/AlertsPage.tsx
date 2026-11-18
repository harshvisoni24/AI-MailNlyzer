import { useEffect, useState } from "react";
import { Bell, Check, ChevronRight, Clock, Info, TriangleAlert } from "lucide-react";
import { api } from "../lib/api";
import { Alert } from "../types";
import PageHero, { PageShell } from "../components/PageHero";

const STYLE: Record<string, { bar: string; pill: string; glow: string }> = {
  CRITICAL: { bar: "bg-red-500", pill: "bg-red-500/20 text-red-300 border-red-500/50", glow: "border-red-400/70 shadow-[0_0_24px_-8px_rgba(248,113,113,0.7)]" },
  HIGH: { bar: "bg-amber-400", pill: "bg-amber-500/20 text-amber-300 border-amber-400/50", glow: "border-sky-400/50" },
  MEDIUM: { bar: "bg-yellow-400", pill: "bg-yellow-500/15 text-yellow-300 border-yellow-400/40", glow: "border-sky-400/50" },
  LOW: { bar: "bg-sky-400", pill: "bg-sky-500/20 text-sky-300 border-sky-400/50", glow: "border-sky-400/50" },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  function load() {
    api.get("/alerts").then((res) => setAlerts(res.data));
  }
  useEffect(load, []);

  async function markRead(id: string) {
    await api.patch(`/alerts/${id}/read`);
    load();
  }

  async function markAllRead() {
    await Promise.all(alerts.filter((a) => !a.isRead).map((a) => api.patch(`/alerts/${a.id}/read`)));
    load();
  }

  const unread = alerts.filter((a) => !a.isRead).length;

  return (
    <PageShell>
      <PageHero
        icon={<Bell size={56} strokeWidth={1.6} />}
        title="Alerts"
        subtitle="Real-time security alerts and notifications"
        right={
          <button className="btn-secondary !rounded-xl !px-5 !py-3 text-[15px] border-sky-400/70" onClick={markAllRead} disabled={unread === 0}>
            <Check size={18} /> Mark All as Read
          </button>
        }
      />

      <div className="space-y-3">
        {alerts.map((a) => {
          const st = STYLE[a.severity] ?? STYLE.LOW;
          const Icon = a.severity === "LOW" ? Info : TriangleAlert;
          return (
            <div
              key={a.id}
              className={`glow-panel !border relative overflow-hidden flex items-center gap-5 pl-6 pr-4 py-4 ${st.glow} ${a.isRead ? "opacity-55" : ""}`}
            >
              <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${st.bar}`} />
              <span className={`inline-flex items-center justify-center gap-2 w-[150px] shrink-0 rounded-full border px-4 py-2 text-sm font-bold tracking-wide ${st.pill}`}>
                <Icon size={18} /> {a.severity}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold text-white truncate">{a.title}</div>
                {a.description && <div className="text-[14px] text-slate-300/90 truncate">{a.description}</div>}
              </div>
              <div className="hidden md:flex items-center gap-2 text-[14px] text-slate-300 shrink-0">
                <Clock size={17} className="text-slate-400" /> {new Date(a.createdAt).toLocaleString()}
              </div>
              <button
                onClick={() => !a.isRead && markRead(a.id)}
                disabled={a.isRead}
                title={a.isRead ? "Already read" : "Mark as read"}
                className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-white bg-blue-600/40 border border-sky-400/50 hover:bg-blue-500/60 transition disabled:hover:bg-blue-600/40"
              >
                {a.isRead ? <Check size={20} /> : <ChevronRight size={22} />}
              </button>
            </div>
          );
        })}
        {alerts.length === 0 && <p className="text-sm text-slate-400 px-1">No alerts yet.</p>}
      </div>
    </PageShell>
  );
}
