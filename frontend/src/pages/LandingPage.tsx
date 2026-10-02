import { Link } from "react-router-dom";
import { ShieldAlert, Radar, MapPin, Network, Globe2, Archive, FileText } from "lucide-react";

const FEATURES = [
  { icon: ShieldAlert, label: "AI Detection", desc: "Hybrid rule engine + AI explanation, never AI-only verdicts." },
  { icon: FileText, label: "Header Forensics", desc: "SPF/DKIM/DMARC, relay chain, forged-header detection." },
  { icon: MapPin, label: "Geo Intelligence", desc: "Probable origin infrastructure — not attacker claims." },
  { icon: Network, label: "Threat Graph", desc: "Interactive infrastructure correlation across cases." },
  { icon: Globe2, label: "Campaign Detection", desc: "Correlate emails sharing infrastructure indicators." },
  { icon: Archive, label: "Evidence Integrity", desc: "SHA-256 chain of custody + tamper-evident ledger." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex items-center gap-2 mb-6">
        <ShieldAlert className="text-forensic-accent" size={28} />
        <span className="font-mono text-sm text-slate-400 tracking-widest uppercase">AICTE · Cyber Security Cell</span>
      </div>
      <h1 className="font-mono text-4xl md:text-5xl font-bold text-slate-100 mb-3">AI-MailNlyzer</h1>
      <p className="text-lg text-slate-400 max-w-xl mb-2">From Suspicious Email to Actionable Intelligence.</p>
      <p className="text-sm text-forensic-accent tracking-widest uppercase mb-10">Detect · Trace · Correlate · Investigate</p>

      <div className="flex gap-4 mb-16">
        <Link to="/login" className="btn-primary">Analyze Email</Link>
        <Link to="/login" className="btn-secondary">View Demo Investigation</Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
        {FEATURES.map((f) => (
          <div key={f.label} className="panel p-5 text-left">
            <f.icon className="text-forensic-accent mb-2" size={20} />
            <div className="text-sm font-medium text-slate-200">{f.label}</div>
            <div className="text-xs text-slate-500 mt-1">{f.desc}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-600 mt-16 max-w-lg">
        AI-MailNlyzer does not merely detect suspicious emails. It transforms emails into explainable, correlated,
        geolocated and evidence-preserving forensic intelligence.
      </p>
    </div>
  );
}
