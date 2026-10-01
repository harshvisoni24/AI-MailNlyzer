import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { EmailDetail } from "../types";
import { ClassificationBadge, ScoreBadge, AuthResultBadge } from "../components/Badges";

export default function EmailDetailPage() {
  const { id } = useParams();
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [blastRadius, setBlastRadius] = useState<Record<string, number> | null>(null);
  const [creatingCase, setCreatingCase] = useState(false);
  const [creatingEvidence, setCreatingEvidence] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/emails/${id}`).then((res) => setEmail(res.data));
    api.get(`/campaigns/blast-radius?emailId=${id}`).then((res) => setBlastRadius(res.data)).catch(() => undefined);
  }, [id]);

  async function createCaseAndLink() {
    if (!email) return;
    setCreatingCase(true);
    try {
      const { data: newCase } = await api.post("/cases", { title: `Investigation: ${email.subject}`, severity: (email.threatScore ?? 0) >= 90 ? "CRITICAL" : (email.threatScore ?? 0) >= 70 ? "HIGH" : "MEDIUM" });
      await api.post(`/cases/${newCase.id}/link-email`, { emailId: email.id });
      setMessage(`Case ${newCase.caseNumber} created and linked.`);
    } catch {
      setMessage("Failed to create case.");
    } finally {
      setCreatingCase(false);
    }
  }

  async function preserveEvidence() {
    if (!email) return;
    setCreatingEvidence(true);
    try {
      let caseId = email.caseId;
      if (!caseId) {
        const { data: newCase } = await api.post("/cases", { title: `Investigation: ${email.subject}` });
        await api.post(`/cases/${newCase.id}/link-email`, { emailId: email.id });
        caseId = newCase.id;
      }
      await api.post("/evidence", { caseId, emailId: email.id, evidenceType: "EMAIL", source: "Upload/Paste", content: email.id + email.subject });
      setMessage("Evidence preserved with SHA-256 hash and chain-of-custody entry.");
    } catch {
      setMessage("Failed to preserve evidence.");
    } finally {
      setCreatingEvidence(false);
    }
  }

  if (!email) {
    return <div className="p-8 text-slate-500">Loading investigation…</div>;
  }

  const explanation = email.aiExplanation;
  const isClean = email.threatClassification === "LEGITIMATE";
  const sourceLabel =
  explanation?.source === "GEMINI"
    ? "AI-assisted (Gemini)"
    : explanation?.source === "RULE_ENGINE_ONLY"
    ? "Rule engine only (AI service unavailable)"
    : "Rule engine + ML model";

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{email.subject}</h1>
          <p className="text-sm text-slate-500">From {email.fromAddress} · Sent {new Date(email.sentDate ?? email.createdAt).toLocaleString()}</p>
          <p className="text-xs text-slate-600">Analyzed {new Date(email.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="btn-secondary" onClick={createCaseAndLink} disabled={creatingCase}>Create Case</button>
          <button className="btn-primary" onClick={preserveEvidence} disabled={creatingEvidence}>Preserve Evidence</button>
        </div>
      </div>

      {message && <div className="panel p-3 text-sm text-forensic-accent">{message}</div>}

      {/* THREAT SCORE */}
      <div className="panel p-6 flex items-center gap-8">
        <div>
          <div className="text-4xl font-mono font-bold text-slate-100">{email.threatScore ?? "—"}<span className="text-lg text-slate-500">/100</span></div>
          <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">Threat Score</div>
        </div>
        <div className="flex flex-col gap-2">
          <ClassificationBadge classification={email.threatClassification} />
          <span className="text-xs text-slate-500">
            Source: {sourceLabel}
          </span>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400">
          {Object.entries(email.scoreFactors ?? {}).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-forensic-border/50 py-0.5">
              <span>{k.replace(/([A-Z])/g, " $1")}</span>
              <span className="text-slate-300">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* WHY FLAGGED */}
      {explanation && (
        <div className="panel p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Why was this email flagged?</h2>
          <div className="grid md:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Observed Fact</div>
              <ul className="space-y-1 text-slate-300">
                {explanation.observedFacts.map((f, i) => <li key={i}>✓ {f}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">AI Inference</div>
              <ul className="space-y-1 text-slate-300">
                {explanation.aiInferences.map((f, i) => <li key={i}>{f.statement}</li>)}
              </ul>
            </div>
            {!isClean && (
              <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Unknown</div>
              <ul className="space-y-1 text-slate-500">
                {explanation.unknowns.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
          </div>
        </div>
      )}

      {/* ATTACK STORY */}
      {email.attackStory && (
        <div className="panel p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Attack Story</h2>
          <p className="text-sm text-slate-300 leading-relaxed">{email.attackStory}</p>
        </div>
      )}

      {/* HEADER FORENSICS */}
      <div className="panel p-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-4">Header Forensics</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">From</span><span className="text-slate-200">{email.fromAddress}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Return-Path</span><span className="text-slate-200">{email.returnPath ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Reply-To</span><span className="text-slate-200">{email.replyTo ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Message-ID</span><span className="text-slate-200 break-all text-right max-w-[320px]" title={email.messageId ?? ""}>{email.messageId ?? "—"}</span></div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-400">SPF</span><AuthResultBadge result={email.spfResult} /></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-400">DKIM</span><AuthResultBadge result={email.dkimResult} /></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-400">DMARC</span><AuthResultBadge result={email.dmarcResult} /></div>
          </div>
        </div>
      </div>

      {/* RELAY / RECEIVED CHAIN */}
      <div className="panel p-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-4">SMTP Relay Trace</h2>
        {email.receivedChain?.length ? (
          <ol className="space-y-2">
            {email.receivedChain.map((hop, idx) => (
              <li key={idx} className="text-xs font-mono text-slate-400 bg-forensic-bg border border-forensic-border rounded px-3 py-2 break-all">
                <span className="text-forensic-accent mr-2">#{idx + 1}</span>{hop}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">No Received headers found in this message.</p>
        )}
        {email.iocs.some((i) => i.type === "IP") && (
        <p className="text-xs text-slate-600 mt-3">
          IP geolocation identifies network infrastructure and does not necessarily represent the physical location or identity of the sender.
        </p>
      )}
      </div>

      {/* URLS / IOCS */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="panel p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">URL Intelligence</h2>
          {email.urls.length === 0 ? <p className="text-sm text-slate-500">No URLs found.</p> : (
            <ul className="space-y-1 text-xs font-mono text-slate-400">
              {email.urls.map((u) => <li key={u.id} className="break-all">{u.rawUrl}</li>)}
            </ul>
          )}
        </div>
        <div className="panel p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Indicators of Compromise</h2>
          {email.iocs.length === 0 ? <p className="text-sm text-slate-500">No IOCs extracted.</p> : (
            <ul className="space-y-1 text-xs">
              {email.iocs.map((i) => (
                <li key={i.id} className="flex justify-between border-b border-forensic-border/50 py-1">
                  <span className="text-slate-500">{i.type}</span>
                  <span className="font-mono text-slate-300 break-all text-right max-w-[260px]" title={i.value}>{i.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* BLAST RADIUS */}
      {blastRadius && (
        <div className="panel p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Blast Radius</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            {Object.entries(blastRadius).map(([k, v]) => (
              <div key={k}>
                <div className="text-2xl font-mono font-bold text-slate-100">{v}</div>
                <div className="text-xs text-slate-500">{k.replace(/([A-Z])/g, " $1")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Link to={`/investigate/threat-graph?emailId=${email.id}`} className="btn-secondary">View Threat Graph</Link>
        <Link to="/copilot" className="btn-secondary">Ask Forensic Copilot</Link>
      </div>
    </div>
  );
}
