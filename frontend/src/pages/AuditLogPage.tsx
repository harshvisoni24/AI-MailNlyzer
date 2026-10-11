import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
  api
  .get("/audit")
  .then((res) => setLogs(res.data.items))
  .catch((err) => console.error("AUDIT ERROR:", err.response?.status, err.response?.data));api.get("/audit").then((res) => setLogs(res.data.items));
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Audit Log</h1>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Target</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-forensic-border">
                <td className="px-4 py-2 text-slate-300">{l.user?.fullName ?? "—"}</td>
                <td className="px-4 py-2 text-slate-300">{l.action}</td>
                <td className="px-4 py-2 text-slate-500">{l.targetType ?? "—"} {l.targetId?.slice(0, 8)}</td>
                <td className="px-4 py-2">
                  <span className={l.status === "SUCCESS" ? "text-green-400" : "text-red-400"}>{l.status}</span>
                </td>
                <td className="px-4 py-2 text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
