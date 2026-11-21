import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChartColumn, CloudUpload, Code, FileText, FileWarning, FolderOpen, LockKeyhole, MailSearch, Shield } from "lucide-react";
import { api } from "../lib/api";
import PageHero, { PageShell } from "../components/PageHero";

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
  const [tab, setTab] = useState<"file" | "paste">("file");
  const pasteRef = useRef<HTMLTextAreaElement>(null);

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

  function choosePaste() {
    setTab("paste");
    pasteRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    pasteRef.current?.focus();
  }

  return (
    <PageShell>
      <PageHero
        icon={<MailSearch size={44} strokeWidth={1.6} />}
        title="Upload Suspicious Email"
        subtitle="Upload an .eml, .msg file or paste raw email content/headers to begin analysis."
        right={
          <div className="hidden lg:flex h-[84px] w-[84px] items-center justify-center text-cyan-300 relative">
            <Shield size={72} strokeWidth={1.3} className="drop-shadow-[0_0_14px_rgba(56,189,248,0.8)]" />
            <LockKeyhole size={26} className="absolute" />
          </div>
        }
      />

      <div className="glow-panel overflow-hidden">
        <div className="flex gap-2 px-4 pt-4">
          <button
            onClick={() => setTab("file")}
            className={`inline-flex items-center gap-2 rounded-t-xl px-5 py-2 text-[13px] font-semibold border border-b-0 transition ${
              tab === "file" ? "bg-sky-500/20 border-sky-500 text-sky-800 dark:text-white dark:border-sky-300/70" : "bg-transparent border-sky-500/30 text-slate-200 hover:text-sky-700"
            }`}
          >
            <CloudUpload size={20} /> Upload File
          </button>
          <button
            onClick={choosePaste}
            className={`inline-flex items-center gap-2 rounded-t-xl px-5 py-2 text-[13px] font-semibold border border-b-0 transition ${
              tab === "paste" ? "bg-sky-500/20 border-sky-500 text-sky-800 dark:text-white dark:border-sky-300/70" : "bg-transparent border-sky-500/30 text-slate-200 hover:text-sky-700"
            }`}
          >
            <Code size={20} /> Paste Raw Email
          </button>
        </div>
        <div className="border-t border-sky-400/40 p-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed py-7 px-6 flex flex-col items-center justify-center text-center transition ${
              dragging ? "border-cyan-300 bg-cyan-400/10" : "border-sky-400/60 bg-white/70 dark:bg-[#06183a]/50"
            }`}
          >
            <CloudUpload className="text-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]" size={50} strokeWidth={1.5} />
            <p className="text-[19px] font-semibold text-white mt-2">Drag &amp; Drop your email file here</p>
            <p className="text-[13.5px] text-slate-200 mt-1">.eml, .msg or .txt files supported</p>
            <div className="flex items-center gap-4 w-full max-w-[420px] my-3 text-xs font-semibold text-slate-200">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-sky-400/60" /> OR <span className="h-px flex-1 bg-gradient-to-l from-transparent to-sky-400/60" />
            </div>
            <label className="btn-secondary !rounded-full !px-8 !py-2.5 !text-[14px] font-semibold !text-sky-700 dark:!text-cyan-200 border-sky-300/70 cursor-pointer">
              <FolderOpen size={20} /> Browse File
              <input type="file" accept=".eml,.msg,.txt" className="hidden" onChange={handleFileInput} />
            </label>
          </div>
        </div>
      </div>

      <div className="glow-panel p-5">
        <h2 className="flex items-center gap-3 text-[15px] font-semibold text-white mb-3">
          <FileText size={26} className="text-sky-300" /> Or Paste Raw Email Content
        </h2>
        <textarea
          ref={pasteRef}
          className="w-full h-[130px] rounded-xl bg-white dark:bg-[#040d22]/80 border border-sky-500/30 px-4 py-3 font-mono text-[12.5px] text-slate-100 placeholder:text-slate-300/70 focus:outline-none focus:border-sky-300"
          placeholder="Paste full raw email source or headers here…"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <button className="btn-primary !rounded-full !px-7 !py-3 mt-4 text-[14px]" disabled={busy || pasted.length < 20} onClick={analyzePasted}>
          <ChartColumn size={19} /> {busy ? "Analyzing…" : "Analyze Email"} {!busy && <ArrowRight size={19} />}
        </button>
      </div>

      {error && (
        <div className="glow-panel p-4 flex items-start gap-2 text-sm text-red-300">
          <FileWarning size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="glow-panel p-5">
        <h2 className="text-[14px] font-semibold text-white mb-1">Demo Mode</h2>
        <p className="text-xs text-slate-300 mb-3">
          All demo emails are <span className="text-cyan-300">SIMULATED DEMO DATA</span> for safe demonstration and never represent real-world intelligence.
        </p>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {DEMO_EMAILS.map((d) => (
            <button key={d.filename} disabled={busy} onClick={() => loadDemo(d.filename)} className="btn-secondary !justify-start text-left text-[12.5px]">
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
