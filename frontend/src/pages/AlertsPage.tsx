import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Alert } from "../types";

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

  return (
    <div className="p-5 max-w-[1500px] mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Alerts</h1>
      <div className="space-y-2">
        {alerts.map((a) => (
          <div key={a.id} className={`panel p-4 flex items-start justify-between ${a.isRead ? "opacity-60" : ""}`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`badge badge-${a.severity.toLowerCase()}`}>{a.severity}</span>
                <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-sm text-slate-200">{a.title}</div>
              {a.description && <div className="text-xs text-slate-500 mt-1">{a.description}</div>}
            </div>
            {!a.isRead && <button className="btn-secondary text-xs" onClick={() => markRead(a.id)}>Mark read</button>}
          </div>
        ))}
        {alerts.length === 0 && <p className="text-sm text-slate-500">No alerts yet.</p>}
      </div>
    </div>
  );
}
