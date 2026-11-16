import { useEffect, useState } from "react";
import { api } from "../lib/api";

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
    <div className="p-5 max-w-[1500px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Evidence Vault</h1>
        <button className="btn-secondary" onClick={verifyLedger}>Verify Integrity Ledger</button>
      </div>

      {ledgerStatus && (
        <div className={`panel p-4 text-sm ${ledgerStatus.valid ? "text-green-400" : "text-red-400"}`}>
          {ledgerStatus.valid
            ? `✓ Ledger verified — ${ledgerStatus.totalEntries} entries, chain intact. Development Evidence Integrity Ledger (hash-chain, not a decentralized blockchain).`
            : "✗ Ledger integrity check FAILED — chain linkage broken."}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="panel p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Evidence Records</h2>
          <ul className="space-y-2">
            {evidence.map((ev) => (
              <li key={ev.id}>
                <button onClick={() => openEvidence(ev.id)} className="w-full text-left text-xs font-mono text-slate-400 hover:text-forensic-accent border border-forensic-border rounded px-3 py-2 block">
                  {ev.evidenceType} · {ev.sha256.slice(0, 20)}… · {ev.integrityStatus}
                </button>
              </li>
            ))}
            {evidence.length === 0 && <p className="text-sm text-slate-500">No evidence preserved yet.</p>}
          </ul>
        </div>

        <div className="panel p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Chain of Custody</h2>
          {!selected && <p className="text-sm text-slate-500">Select an evidence record to view its timeline.</p>}
          {selected && (
            <div className="space-y-3">
              <div className="text-xs font-mono text-slate-400 break-all">SHA-256: {selected.sha256}</div>
              <ol className="space-y-2 border-l border-forensic-border pl-4">
                {selected.custodyEvents.map((c: any) => (
                  <li key={c.id} className="text-xs">
                    <span className="text-slate-500">{new Date(c.occurredAt).toLocaleTimeString()}</span>{" "}
                    <span className="text-slate-200">{c.action}</span>
                    {c.detail && <div className="text-slate-600">{c.detail}</div>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
