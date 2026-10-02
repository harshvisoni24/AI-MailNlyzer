import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@mailtrace.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Login failed. Check your credentials and API connectivity.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <ShieldCheck className="text-forensic-accent mb-3" size={36} />
          <h1 className="font-mono text-xl font-bold tracking-wide text-slate-100">AI-MailNlyzer</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Detect. Trace. Correlate. Investigate.</p>
        </div>
        <form onSubmit={handleSubmit} className="panel p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</div>}
          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-[11px] text-slate-600 text-center pt-2">
            Default seeded account: admin@mailtrace.local — see README for the seeded password.
          </p>
        </form>
      </div>
    </div>
  );
}
