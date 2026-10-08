import { useEffect, useState } from "react";
import { api } from "../lib/api";

const MAIL_PROVIDERS = ["sendgrid", "mailgun", "mailchimp", "mandrill", "amazon ses", "postmark", "sparkpost", "sendinblue", "brevo", "mailjet"];
function isMailProvider(isp?: string) {
  return !!isp && MAIL_PROVIDERS.some((p) => isp.toLowerCase().includes(p));
}

export default function ThreatIntelligencePage() {
  const [domains, setDomains] = useState<any[]>([]);
  const [ips, setIps] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);

  useEffect(() => {
    api.get("/threat-intelligence/domains").then((res) => setDomains(res.data));
    api.get("/threat-intelligence/ips").then((res) => setIps(res.data));
  }, []);

  async function lookup() {
    const q = query.trim();
    if (!q) return;
    const type = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(q) ? "ip" : "domain";
    const { data } = await api.get(`/threat-intelligence/lookup?type=${type}&value=${encodeURIComponent(q)}`);
    setLookupResult(data);
    api.get("/threat-intelligence/domains").then((res) => setDomains(res.data));
    api.get("/threat-intelligence/ips").then((res) => setIps(res.data));
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Threat Intelligence</h1>

      <div className="panel p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Lookup IP / Domain</h2>
        <div className="flex gap-2">
          <input className="input" placeholder="e.g. 203.0.113.5 or micros0ft-login.com" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn-primary" onClick={lookup}>Lookup</button>
        </div>
                {lookupResult && (
          <div className="mt-4 space-y-3">
            {lookupResult.type === "ip" && (
              <div className="text-sm bg-forensic-bg border border-forensic-border rounded p-3 space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Verdict</span><span className="text-slate-200">{lookupResult.verdict} (score {lookupResult.score}/100)</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Network owner (ISP)</span><span className="text-slate-200">{lookupResult.isp ?? "Unknown"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Registered country</span><span className="text-slate-200">{lookupResult.country ?? "Unknown"}</span></div>
                {isMailProvider(lookupResult.isp) && (
                  <p className="text-xs text-forensic-accent pt-1">This IP belongs to an email delivery service. The sender can be anyone using that service, from any country.</p>
                )}
                <p className="text-xs text-slate-600 pt-1">Country shows where the network is registered, not where the sender or website is physically located.</p>
              </div>
            )}
            <div className="text-xs font-mono bg-forensic-bg border border-forensic-border rounded p-3">
              <div className="text-slate-500 mb-1">
                Source: <span className="text-forensic-accent">{lookupResult.source}</span> · Status: {lookupResult.status}
              </div>
              <pre className="whitespace-pre-wrap text-slate-400">{JSON.stringify(lookupResult, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="panel p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Known Domains ({domains.length})</h2>
          <ul className="space-y-1 text-xs font-mono text-slate-400">
            {domains.map((d) => <li key={d.id}>{d.name} {d.lookalikeOf && `→ lookalike of ${d.lookalikeOf}`}</li>)}
            {domains.length === 0 && <p className="text-slate-500 font-sans">No domains enriched yet.</p>}
          </ul>
        </div>
        <div className="panel p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Known IPs ({ips.length})</h2>
          <ul className="space-y-1 text-xs font-mono text-slate-400">
            {ips.map((ip) => <li key={ip.id}>{ip.address} {ip.country && `(${ip.country})`}</li>)}
            {ips.length === 0 && <p className="text-slate-500 font-sans">No IPs enriched yet.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
