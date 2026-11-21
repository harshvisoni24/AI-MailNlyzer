import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Calendar, ChartLine, Eye, Filter, Mail, Search, ShieldAlert, SlidersHorizontal, Star, User } from "lucide-react";
import { api } from "../lib/api";
import { EmailSummary } from "../types";
import { ClassificationBadge, ScoreBadge } from "../components/Badges";
import PageHero, { PageShell } from "../components/PageHero";

const PAGE_SIZE = 10;

export default function EmailsListPage() {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [threatsOnly, setThreatsOnly] = useState(false);
  const [page, setPage] = useState(1);

  // keep the box in sync when the navbar search sends a new ?q=
  useEffect(() => { setQuery(params.get("q") ?? ""); setPage(1); }, [params]);

  const q = query.trim().toLowerCase();
  const visible = emails.filter((e) => {
    if (threatsOnly && ["LEGITIMATE", "LOW_RISK", "UNKNOWN"].includes(e.threatClassification ?? "UNKNOWN")) return false;
    return !q || `${e.subject} ${e.fromAddress}`.toLowerCase().includes(q);
  });
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * PAGE_SIZE;
  const rows = visible.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    api
      .get("/emails?pageSize=100")
      .then((res) => setEmails(res.data.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell>
      <PageHero
        icon={
          <div className="relative">
            <Shield />
            <Mail size={22} className="absolute inset-0 m-auto" />
          </div>
        }
        title="Analyzed Emails"
        subtitle="Detailed analysis of processed email evidence"
        right={
          <Link to="/investigate/upload" className="btn-primary !rounded-xl !px-5 !py-2.5 text-[13px]">
            <ChartLine size={18} /> Analyze Email
          </Link>
        }
      />

      <div className="glow-panel p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="pill !rounded-xl !px-5 !py-2.5 text-sm font-semibold">
            <Filter size={17} className="text-cyan-300" /> Total: {visible.length} Results
          </span>
          <div className="flex items-center gap-3 flex-1 justify-end">
            <div className="relative w-full max-w-[430px]">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                className="w-full rounded-xl h-10 pl-10 pr-4 text-sm bg-[#071a40]/80 border border-sky-500/40 text-slate-100 placeholder:text-slate-300/70 focus:outline-none focus:border-sky-300"
                placeholder="Search in analyzed emails…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              />
            </div>
            <button
              onClick={() => { setThreatsOnly((v) => !v); setPage(1); }}
              title={threatsOnly ? "Showing threats only — click to show all" : "Show threats only"}
              className={`h-10 w-12 rounded-xl border flex items-center justify-center transition ${
                threatsOnly ? "bg-sky-500/30 border-cyan-300 text-white shadow-glow" : "bg-[#071a40]/80 border-sky-500/40 text-cyan-200 hover:border-sky-300"
              }`}
            >
              <SlidersHorizontal size={22} />
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-sky-500/25 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-xs font-medium uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 w-10">#</th>
                <th className="text-left px-3 py-3"><span className="inline-flex items-center gap-2"><Mail size={15} className="text-sky-300" /> Subject</span></th>
                <th className="text-left px-3 py-3"><span className="inline-flex items-center gap-2"><User size={15} className="text-sky-300" /> From</span></th>
                <th className="text-left px-3 py-3"><span className="inline-flex items-center gap-2"><ShieldAlert size={15} className="text-sky-300" /> Classification</span></th>
                <th className="text-left px-3 py-3"><span className="inline-flex items-center gap-2"><Star size={15} className="text-sky-300" /> Score</span></th>
                <th className="text-left px-3 py-3"><span className="inline-flex items-center gap-2"><Calendar size={15} className="text-sky-300" /> Date</span></th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No emails analyzed yet.</td></tr>
              )}
              {rows.map((e, i) => (
                <tr key={e.id} className="border-t border-sky-500/15 hover:bg-sky-400/10">
                  <td className="px-4 py-3 text-slate-200">{start + i + 1}</td>
                  <td className="px-3 py-3 max-w-[360px]">
                    <Link to={`/investigate/emails/${e.id}`} className="block truncate text-slate-100 hover:text-cyan-300" title={e.subject}>{e.subject}</Link>
                  </td>
                  <td className="px-3 py-3 text-slate-200 max-w-[260px] truncate" title={e.fromAddress}>{e.fromAddress}</td>
                  <td className="px-3 py-3"><ClassificationBadge classification={e.threatClassification} /></td>
                  <td className="px-3 py-3"><ScoreBadge score={e.threatScore} /></td>
                  <td className="px-3 py-3 text-slate-200 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/investigate/emails/${e.id}`} className="inline-flex items-center gap-2 rounded-lg border border-sky-400/50 bg-sky-500/10 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500/25">
                      <Eye size={16} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <button disabled={cur === 1} onClick={() => setPage(cur - 1)} className="h-10 w-11 rounded-xl border border-sky-500/40 bg-[#071a40]/80 text-white flex items-center justify-center disabled:opacity-40">
              <ArrowLeft size={18} />
            </button>
            {Array.from({ length: pages }, (_, n) => n + 1)
              .filter((n) => n === 1 || n === pages || Math.abs(n - cur) <= 1)
              .map((n, idx, arr) => (
                <span key={n} className="flex items-center gap-2">
                  {idx > 0 && n - arr[idx - 1] > 1 && <span className="text-slate-400">…</span>}
                  <button
                    onClick={() => setPage(n)}
                    className={`h-10 w-10 rounded-xl border text-[13.5px] font-semibold ${
                      n === cur ? "bg-blue-600 border-sky-300 text-white shadow-glow" : "bg-[#071a40]/80 border-sky-500/40 text-slate-100 hover:border-sky-300"
                    }`}
                  >
                    {n}
                  </button>
                </span>
              ))}
            <button disabled={cur === pages} onClick={() => setPage(cur + 1)} className="h-10 w-11 rounded-xl border border-sky-500/40 bg-[#071a40]/80 text-white flex items-center justify-center disabled:opacity-40">
              <ArrowRight size={18} />
            </button>
          </div>
          <span className="text-xs italic text-slate-400">
            Showing {visible.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, visible.length)} of {visible.length} results
          </span>
        </div>
      </div>
    </PageShell>
  );
}

function Shield() {
  return (
    <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 5v6c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5l-8-3Z" />
    </svg>
  );
}
