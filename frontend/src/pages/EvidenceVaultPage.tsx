import { useEffect, useState } from "react";
import { ChevronRight, Database, FileText, Fingerprint, History, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import PageHero, { PageShell } from "../components/PageHero";

export default function EvidenceVaultPage() {
  const [evidence, setEvidence] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [ledgerStatus, setLedgerStatus] = useState<{ valid: boolean; totalEntries?: number } | null>(null);

  useEffect(() => {
    api.get("/evidence").then((res) => setEvidence(res.data));
  }, []);

  async function openEvidence(id: string) {
    const { data } = await api.get(`/evidence/${id}`);
    setSelected(data);
  }

  async function verifyLedger() {
    const { data } = await api.get("/evidence/verify-ledger");
    setLedgerStatus(data);
  }

  return (
    <PageShell>
      <PageHero
        icon={<Fingerprint size={46} strokeWidth={1.5} />}
        title="Evidence Vault"
        subtitle="Secure storage for all forensic evidence and artifacts"
        right={
          <button className="btn-secondary !rounded-xl !px-5 !py-3 text-[13.5px] border-sky-400/70" onClick={verifyLedger}>
            <ShieldCheck size={18} /> Verify Integrity Ledger
          </button>
        }
      />

      {ledgerStatus && (
        <div className={`glow-panel p-4 text-sm ${ledgerStatus.valid ? "text-green-300" : "text-red-300"}`}>
          {ledgerStatus.valid
            ? `✓ Ledger verified — ${ledgerStatus.totalEntries} entries, chain intact. Development Evidence Integrity Ledger (hash-chain, not a decentralized blockchain).`
            : "✗ Ledger integrity check FAILED — chain linkage broken."}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glow-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="icon-tile h-9 w-9"><Database size={20} /></span>
              <h2 className="text-[17px] font-semibold text-white">Evidence Records</h2>
            </div>
            <span className="pill !px-4 font-semibold">
              Total: {evidence.length} <span className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
            </span>
          </div>
          <ul className="space-y-2.5">
            {evidence.map((ev) => (
              <li key={ev.id}>
                <button
                  onClick={() => openEvidence(ev.id)}
                  className={`w-full flex items-center gap-4 text-left rounded-xl px-4 py-3 border transition bg-[#0a1f4a]/60 hover:bg-[#0d2a63]/70 ${
                    selected?.id === ev.id ? "border-cyan-300/80 shadow-[0_0_16px_-4px_rgba(103,232,249,0.7)]" : "border-sky-500/30"
                  }`}
                >
                  <span className="icon-tile h-9 w-9"><FileText size={18} /></span>
                  <span className="flex-1 min-w-0 truncate text-[13.5px] text-slate-100">
                    {ev.evidenceType} <span className="text-slate-400">–</span>{" "}
                    <span className="font-mono">{ev.sha256.slice(0, 20)}…</span>
                  </span>
                  <span className="text-[12.5px] text-slate-300 hidden sm:block">• {ev.integrityStatus}</span>
                  <ChevronRight size={20} className="text-slate-300" />
                </button>
              </li>
            ))}
            {evidence.length === 0 && <p className="text-sm text-slate-400">No evidence preserved yet.</p>}
          </ul>
        </div>

        <div className="glow-panel violet relative overflow-hidden p-5 min-h-[260px]">
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <span className="icon-tile h-9 w-9 !bg-indigo-500/30 !border-indigo-300/50 !text-indigo-100"><History size={20} /></span>
            <h2 className="text-[17px] font-semibold text-white">Chain of Custody</h2>
          </div>
          {!selected && (
            <>
              <p className="text-[14px] text-slate-200 relative z-10">Select an evidence record to view its timeline.</p>
              <img src="/vault-art.svg" alt="" aria-hidden className="absolute right-3 bottom-2 h-[190px] w-auto opacity-95 pointer-events-none" />
            </>
          )}
          {selected && (
            <div className="space-y-3 relative z-10">
              <div className="text-xs font-mono text-slate-200 break-all">SHA-256: {selected.sha256}</div>
              <ol className="space-y-3 border-l border-indigo-300/40 pl-4">
                {selected.custodyEvents.map((c: any) => (
                  <li key={c.id} className="text-sm">
                    <span className="text-slate-300">{new Date(c.occurredAt).toLocaleTimeString()}</span>{" "}
                    <span className="text-white font-medium">{c.action}</span>
                    {c.detail && <div className="text-slate-300/80 text-xs">{c.detail}</div>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
