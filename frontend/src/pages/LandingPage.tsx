import { Link } from "react-router-dom";
import { ShieldAlert, Shield, MapPin, Network, Globe2, Archive, FileText, Landmark, ArrowRight } from "lucide-react";

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
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 h-[68px] border-b border-sky-500/30 bg-[#040d1f]/90 shadow-[0_1px_20px_-6px_rgba(56,189,248,0.4)]">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Shield className="text-sky-400" size={34} strokeWidth={1.6} />
            <ShieldAlert className="absolute inset-0 m-auto text-sky-300" size={15} />
          </div>
          <div className="leading-tight text-left">
            <div className="font-bold text-slate-50 text-[17px] tracking-wide">AI-MailNlyzer</div>
            <div className="text-[10px] text-slate-400">Forensic Intelligence Platform</div>
          </div>
        </div>
        <Link to="/login" className="btn-secondary">Sign in</Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(56,189,248,0.55) 1px, transparent 1.2px)",
            backgroundSize: "10px 10px",
            maskImage: "radial-gradient(ellipse at 50% 20%, black 0%, transparent 65%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 20%, black 0%, transparent 65%)",
          }}
        />
        <div className="relative w-28 h-28 flex items-center justify-center mb-6">
          <div className="absolute inset-0 rounded-full bg-sky-500/25 blur-2xl" />
          <Shield size={104} className="text-sky-400 relative drop-shadow-[0_0_16px_rgba(56,189,248,0.8)]" strokeWidth={1.4} />
          <ShieldAlert size={36} className="absolute text-sky-200" />
        </div>
        <p className="relative font-mono text-xs text-slate-400 tracking-widest uppercase mb-3">AICTE · Cyber Security Cell</p>
        <h1 className="relative text-4xl md:text-6xl font-bold text-white mb-3">
          AI-<span className="text-sky-400">MailNlyzer</span>
        </h1>
        <p className="relative text-lg text-slate-300 max-w-xl mb-2">From Suspicious Email to Actionable Intelligence.</p>
        <p className="relative text-sm text-sky-400 tracking-widest uppercase mb-10">Detect · Trace · Correlate · Investigate</p>

        <div className="relative flex flex-wrap justify-center gap-4 mb-16">
          <Link to="/login" className="btn-primary">Analyze Email <ArrowRight size={16} /></Link>
          <Link to="/login" className="btn-secondary">View Demo Investigation</Link>
        </div>

        <div className="relative grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
          {FEATURES.map((f) => (
            <div key={f.label} className="panel p-5 text-left hover:shadow-glow hover:border-sky-400/50 transition">
              <f.icon className="text-sky-400 mb-2" size={22} strokeWidth={1.6} />
              <div className="text-sm font-semibold text-slate-100">{f.label}</div>
              <div className="text-xs text-slate-400 mt-1">{f.desc}</div>
            </div>
          ))}
        </div>

        <p className="relative text-xs text-slate-500 mt-14 max-w-lg">
          AI-MailNlyzer does not merely detect suspicious emails. It transforms emails into explainable, correlated,
          geolocated and evidence-preserving forensic intelligence.
        </p>
      </main>

      <footer className="border-t border-sky-500/20 bg-[#040d1f]/90 px-6 h-[60px] flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-2.5">
          <div className="relative">
          <div className="absolute inset-0 rounded-full bg-sky-400/40 blur-md" />
          <img
            src="/bvm-logo.png"
            alt="BVM logo"
            className="relative h-11 w-11 rounded-full bg-white object-contain p-0.5 ring-2 ring-sky-400/70 shadow-glow"
          />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-wide text-white">
            BVM_<span className="text-sky-400">Team_Suspicious</span>
          </div>
          <div className="text-[10px] text-slate-400">Birla Vishvakarma Mahavidyalaya</div>
        </div>
        </div>
        <span className="hidden md:inline">Powered by AI • Built for a Safer Digital India</span>
      </footer>
    </div>
  );
}
