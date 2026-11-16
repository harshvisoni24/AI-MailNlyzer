import { useState, DragEvent, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, FileWarning } from "lucide-react";
import { api } from "../lib/api";

const DEMO_EMAILS: { label: string; filename: string }[] = [
  { label: "Demo 1 — Microsoft impersonation phishing", filename: "demo-1-microsoft-phishing.eml" },
  { label: "Demo 2 — Fake invoice / BEC", filename: "demo-2-bec-invoice.eml" },
  { label: "Demo 3 — Credential harvesting", filename: "demo-3-credential-harvest.eml" },
  { label: "Demo 4 — Suspicious attachment", filename: "demo-4-suspicious-attachment.eml" },
  { label: "Demo 5 — Legitimate email", filename: "demo-5-legitimate.eml" },
];

export default function UploadEmailPage() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyzeFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("emailFile", file);
      const { data } = await api.post("/emails/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      navigate(`/investigate/emails/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzePasted() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/emails/paste", { rawEmail: pasted });
      navigate(`/investigate/emails/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadDemo(filename: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/demo-data/${filename}`);
      if (!res.ok) throw new Error("Demo file not found. Ensure demo-data/ is served or copied into frontend/public/demo-data/.");
      const text = await res.text();
      const { data } = await api.post("/emails/paste", { rawEmail: text });
      navigate(`/investigate/emails/${data.id}`);
    } catch (err: any) {
      setError(err.message ?? "Could not load demo investigation.");
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) analyzeFile(file);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) analyzeFile(file);
  }

  return (
    <div className="p-5 max-w-[1500px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Upload Suspicious Email</h1>
        <p className="text-sm text-slate-500">Upload a .eml/.msg file or paste raw email content/headers to begin analysis.</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`panel border-dashed p-12 flex flex-col items-center justify-center text-center transition ${dragging ? "border-forensic-accent bg-forensic-accent/5" : ""}`}
      >
        <UploadCloud className="text-slate-500 mb-3" size={36} />
        <p className="text-slate-300 font-medium">Drop email file here</p>
        <p className="text-xs text-slate-500 mt-1">.EML / .MSG / raw email</p>
        <label className="btn-secondary mt-4 cursor-pointer">
          Browse file
          <input type="file" accept=".eml,.msg,.txt" className="hidden" onChange={handleFileInput} />
        </label>
      </div>

      <div className="panel p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-2">Or paste raw email</h2>
        <textarea
          className="input h-40 font-mono text-xs"
          placeholder="Paste full raw email source or headers here…"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <button className="btn-primary mt-3" disabled={busy || pasted.length < 20} onClick={analyzePasted}>
          {busy ? "Analyzing…" : "Analyze Email"}
        </button>
      </div>

      {error && (
        <div className="panel p-4 flex items-start gap-2 text-sm text-red-400">
          <FileWarning size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="panel p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-1">Demo Mode</h2>
        <p className="text-xs text-slate-500 mb-3">
          All demo emails are <span className="text-forensic-accent">SIMULATED DEMO DATA</span> for safe demonstration and never represent real-world intelligence.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {DEMO_EMAILS.map((d) => (
            <button key={d.filename} disabled={busy} onClick={() => loadDemo(d.filename)} className="btn-secondary text-left text-xs">
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
