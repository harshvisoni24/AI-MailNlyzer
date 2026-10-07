import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Mail, Lock, User, Eye, EyeOff, Network, Fingerprint, Activity } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

type Mode = "login" | "signup";

const features = [
  { icon: Fingerprint, title: "Detect", text: "AI-powered phishing and spoof detection" },
  { icon: Network, title: "Correlate", text: "Link emails into campaigns and threat graphs" },
  { icon: Activity, title: "Investigate", text: "Cases, evidence vault and forensic reports" },
];

export default function LoginPage() {
  const auth = useAuth() as any;
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setPassword("");
    setConfirm("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      if (password !== confirm) return setError("Passwords do not match.");
      if (!auth.register) return setError("Sign up is not enabled yet.");
    }

    setLoading(true);
    try {
      if (mode === "login") await auth.login(email, password);
      else await auth.register(name, email, password);
      navigate("/");
    } catch (err: any) {
      setError(
        err.response?.data?.error ??
          (mode === "login"
            ? "Invalid email or password."
            : "Could not create account. Try again.")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-black">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-forensic-accent" size={32} />
          <span className="font-mono text-xl font-bold tracking-wide text-slate-100">AI-MailNlyzer</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold text-slate-100 leading-tight">
            Email threat forensics,<br />
            <span className="text-forensic-accent">simplified.</span>
          </h2>
          <p className="text-slate-400 mt-4 max-w-md">
            Analyze suspicious emails, trace their origin and connect attacks across your organization.
          </p>
          <div className="mt-10 space-y-5">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700">
                  <Icon size={18} className="text-forensic-accent" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200">{title}</div>
                  <div className="text-xs text-slate-500">{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-600">© {new Date().getFullYear()} AI-MailNlyzer. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <ShieldCheck className="text-forensic-accent mb-2" size={36} />
            <h1 className="font-mono text-xl font-bold text-slate-100">AI-MailNlyzer</h1>
          </div>

          <h2 className="text-2xl font-bold text-slate-100">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            {mode === "login" ? "Sign in to continue to your dashboard." : "Start investigating email threats today."}
          </p>

          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-lg bg-slate-900 border border-slate-800">
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`py-2 text-sm rounded-md transition ${
                  mode === m ? "bg-slate-800 text-slate-100 font-medium" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {m === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Full name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className="input pl-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" required />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="input pl-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="input pl-9 pr-10"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" aria-label="Toggle password visibility">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Confirm password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className="input pl-9" type={showPw ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" required />
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</div>
            )}

            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? (mode === "login" ? "Signing in…" : "Creating account…") : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-6">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")} className="text-forensic-accent hover:underline">
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}