import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, FileSearch, Search, ShieldCheck, Shield } from "lucide-react";
import { api } from "../lib/api";
import { CaseSummary } from "../types";
import PageHero, { PageShell } from "../components/PageHero";

const SEV: Record<string, { bar: string; tile: string; pill: string; dot: string }> = {
  CRITICAL: { bar: "bg-red-500", tile: "text-red-300 border-red-400/50 bg-red-500/15", pill: "bg-red-500/20 text-red-300 border-red-500/50", dot: "bg-red-400" },
  HIGH: { bar: "bg-orange-400", tile: "text-orange-300 border-orange-400/50 bg-orange-500/15", pill: "bg-orange-500/20 text-orange-300 border-orange-400/50", dot: "bg-orange-400" },
  MEDIUM: { bar: "bg-amber-400", tile: "text-amber-300 border-amber-400/50 bg-amber-500/15", pill: "bg-amber-500/20 text-amber-300 border-amber-400/50", dot: "bg-amber-400" },
  LOW: { bar: "bg-indigo-400", tile: "text-indigo-300 border-indigo-400/50 bg-indigo-500/15", pill: "bg-indigo-500/25 text-indigo-200 border-indigo-400/50", dot: "bg-indigo-300" },
};

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins || 1} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function CasesListPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);

  useEffect(() => {
    api.get("/cases").then((res) => setCases(res.data));
  }, []);

  return (
    <PageShell>
      <PageHero
        icon={
          <div className="relative">
            <Shield size={56} strokeWidth={1.4} />
            <Search size={22} className="absolute inset-0 m-auto" />
          </div>
        }
        title="Investigation Cases"
        subtitle="View and manage your investigation cases"
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cases.map((c) => {
          const st = SEV[c.severity] ?? SEV.LOW;
          return (
            <Link
              key={c.id}
              to={`/cases/${c.id}`}
              className="glow-panel relative overflow-hidden flex gap-3 p-3 pl-4 hover:brightness-125 transition"
            >
              <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${st.bar}`} />
              <div className={`h-[48px] w-[48px] shrink-0 rounded-xl border flex items-center justify-center ${st.tile}`}>
                <FileSearch size={24} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="pill !py-1 font-mono text-[11.5px] !bg-blue-600/25">{c.caseNumber}</span>
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${st.pill}`}>
                    <span className={`h-2 w-2 rounded-full ${st.dot}`} /> {c.severity}
                  </span>
                </div>
                <h2 className="text-[13px] font-semibold text-slate-100 leading-snug truncate" title={c.title}>{c.title}</h2>
                <div className="flex items-center justify-between gap-3 text-[11.5px] text-slate-300">
                  <span className="pill !py-1 !px-3 text-xs !bg-blue-600/20">
                    <ShieldCheck size={14} className="text-sky-300" /> {c.status} · {c._count?.emails ?? 0} emails · {c._count?.evidence ?? 0} evidence
                  </span>
                  <span className="inline-flex items-center gap-1.5 shrink-0">
                    <Clock size={15} className="text-slate-400" /> {ago(c.createdAt)}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
        {cases.length === 0 && <p className="text-slate-400">No cases yet. Create one from an analyzed email.</p>}
      </div>
    </PageShell>
  );
}
