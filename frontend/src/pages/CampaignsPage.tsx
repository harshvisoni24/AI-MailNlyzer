import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [detecting, setDetecting] = useState(false);

  function load() {
    api.get("/campaigns").then((res) => setCampaigns(res.data));
  }
  useEffect(load, []);

  async function runDetection() {
    setDetecting(true);
    try {
      await api.post("/campaigns/detect");
      load();
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Campaign Detection</h1>
        <button className="btn-primary" onClick={runDetection} disabled={detecting}>
          {detecting ? "Correlating…" : "Run Campaign Detection"}
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Emails are correlated by shared infrastructure indicators (URLs, relay IPs). Confidence reflects the number of correlated emails.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        {campaigns.map((c) => (
            <Link key={c.id} to={`/campaigns/${c.id}`} className="panel p-5 min-w-0 overflow-hidden hover:border-forensic-accent">
            <h2 title={c.name} className="text-slate-200 font-medium mb-1 truncate">{c.name}</h2>
            <p title={c.description} className="text-xs text-slate-500 mb-2 break-all line-clamp-2">{c.description}</p>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Confidence: {c.confidenceScore}%</span>
              <span>{c.emailCount} emails</span>
            </div>
          </Link>
        ))}
        {campaigns.length === 0 && <p className="text-slate-500">No campaigns detected yet.</p>}
      </div>
    </div>
  );
}
