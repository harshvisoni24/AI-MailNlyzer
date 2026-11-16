import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { EmailSummary } from "../types";
import { ClassificationBadge, ScoreBadge } from "../components/Badges";

export default function EmailsListPage() {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const visible = q
    ? emails.filter((e) => `${e.subject} ${e.fromAddress}`.toLowerCase().includes(q))
    : emails;

  useEffect(() => {
    api
      .get("/emails?pageSize=50")
      .then((res) => setEmails(res.data.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-5 max-w-[1500px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Analyzed Emails</h1>
        <Link to="/investigate/upload" className="btn-primary">Analyze Email</Link>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Subject</th>
              <th className="text-left px-4 py-3">From</th>
              <th className="text-left px-4 py-3">Classification</th>
              <th className="text-left px-4 py-3">Score</th>
              <th className="text-left px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {!loading && visible.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No emails analyzed yet.</td></tr>
            )}
            {visible.map((e) => (
              <tr key={e.id} className="border-t border-forensic-border hover:bg-white/5">
                <td className="px-4 py-3">
                  <Link to={`/investigate/emails/${e.id}`} className="text-slate-200 hover:text-forensic-accent">{e.subject}</Link>
                </td>
                <td className="px-4 py-3 text-slate-400">{e.fromAddress}</td>
                <td className="px-4 py-3"><ClassificationBadge classification={e.threatClassification} /></td>
                <td className="px-4 py-3"><ScoreBadge score={e.threatScore} /></td>
                <td className="px-4 py-3 text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
