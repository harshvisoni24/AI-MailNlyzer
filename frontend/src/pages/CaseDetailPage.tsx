import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";

export default function CaseDetailPage() {
  const { id } = useParams();
  const [caseData, setCaseData] = useState<any>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    api.get(`/cases/${id}`).then((res) => setCaseData(res.data));
  }

  useEffect(() => { load(); }, [id]);

  async function addNote() {
    if (!note.trim()) return;
    await api.post(`/cases/${id}/notes`, { content: note });
    setNote("");
    load();
  }

  async function generateReport() {
    const { data } = await api.post("/reports", { caseId: id });
    setMessage(`Report generated. Download PDF from Forensic Reports, or open directly:`);
    window.open(`${api.defaults.baseURL}/reports/${data.id}/pdf`, "_blank");
  }

  if (!caseData) return <div className="p-8 text-slate-500">Loading case…</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-slate-500">{caseData.caseNumber}</span>
          <h1 className="text-xl font-semibold text-slate-100">{caseData.title}</h1>
        </div>
        <button className="btn-primary" onClick={generateReport}>Generate Forensic Report</button>
      </div>

      {message && <div className="panel p-3 text-sm text-forensic-accent">{message}</div>}

      <div className="panel p-5 flex gap-6">
        <div>
          <span className="text-xs text-slate-500 block mb-1">Severity</span>
          <span className="text-sm font-semibold text-slate-100">{caseData.severity}</span>
        </div>
        <div>
          <span className="text-xs text-slate-500 block mb-1">Status</span>
          <span className="text-sm font-semibold text-slate-100">{caseData.status}</span>
        </div>
        <div className="text-xs text-slate-500 self-end">Set by AI analysis</div>
      </div>

      <div className="panel p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Linked Emails ({caseData.emails.length})</h2>
        <ul className="space-y-1 text-sm">
          {caseData.emails.map((e: any) => (
            <li key={e.id} className="flex justify-between border-b border-forensic-border/50 py-1">
              <span className="text-slate-300">{e.subject}</span>
              <span className="text-slate-500">{e.threatClassification} · {e.threatScore}/100</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Evidence ({caseData.evidence.length})</h2>
        <ul className="space-y-2 text-xs font-mono">
          {caseData.evidence.map((ev: any) => (
            <li key={ev.id} className="text-slate-400">
              {ev.evidenceType} · SHA-256: {ev.sha256.slice(0, 24)}… · {ev.integrityStatus}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Investigation Notes</h2>
        <div className="space-y-2 mb-3">
          {caseData.notes.map((n: any) => (
            <div key={n.id} className="text-sm text-slate-300 border-l-2 border-forensic-border pl-3">
              {n.content}
              <div className="text-xs text-slate-600">{n.author?.fullName}</div>
            </div>
          ))}
        </div>
        <textarea className="input h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add investigation note…" />
        <button className="btn-secondary mt-2" onClick={addNote}>Add Note</button>
      </div>
    </div>
  );
}
