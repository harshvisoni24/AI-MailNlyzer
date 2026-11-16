import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    api.get("/reports").then((res) => setReports(res.data));
  }, []);

  return (
    <div className="p-5 max-w-[1500px] mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Forensic Reports</h1>
      <div className="panel divide-y divide-forensic-border">
        {reports.map((r) => (
          <div key={r.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-200">{r.content?.caseInformation?.title ?? r.id}</div>
              <div className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</div>
            </div>
            <a className="btn-secondary" href={`${api.defaults.baseURL}/reports/${r.id}/pdf`} target="_blank" rel="noreferrer">
              Export PDF
            </a>
          </div>
        ))}
        {reports.length === 0 && <p className="p-4 text-sm text-slate-500">No reports generated yet. Generate one from a case.</p>}
      </div>
    </div>
  );
}
