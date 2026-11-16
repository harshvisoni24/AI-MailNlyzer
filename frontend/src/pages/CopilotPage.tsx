import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { api } from "../lib/api";

const SUGGESTED = [
  "Why was this email classified as phishing?",
  "What are the strongest indicators?",
  "Summarize this investigation.",
  "What should I investigate next?",
  "What containment actions should I consider?",
];

interface Message { role: "user" | "assistant"; text: string; source?: string }

export default function CopilotPage() {
  const [emailId, setEmailId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    if (!question.trim()) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const { data } = await api.post("/copilot/ask", {
        question,
        emailId: emailId || undefined,
        caseId: caseId || undefined,
      });
      setMessages((m) => [...m, { role: "assistant", text: data.answer, source: data.source }]);
    } catch (err: any) {
      setMessages((m) => [...m, { role: "assistant", text: err.response?.data?.error ?? "Copilot request failed." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-5 max-w-[1500px] mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Bot className="text-forensic-accent" size={22} />
        <h1 className="text-2xl font-bold text-white">Forensic Copilot</h1>
      </div>
      <p className="text-sm text-slate-500">
        Answers are grounded in real investigation data. Optionally scope the conversation to a specific email or case ID below.
      </p>

      <div className="flex gap-3">
        <input className="input" placeholder="Email ID (optional)" value={emailId} onChange={(e) => setEmailId(e.target.value)} />
        <input className="input" placeholder="Case ID (optional)" value={caseId} onChange={(e) => setCaseId(e.target.value)} />
      </div>

      <div className="panel p-5 min-h-[300px] space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "text-slate-200" : "text-forensic-accent"}`}>
            <span className="text-xs uppercase tracking-wide text-slate-600 mr-2">{m.role === "user" ? "You" : "Copilot"}</span>
            {m.text}
            {m.source === "RULE_ENGINE_ONLY" && <span className="text-[10px] text-slate-600 ml-2">(rule-engine fallback — Gemini unavailable)</span>}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <button key={s} className="btn-secondary text-xs" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Ask the forensic copilot…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
        />
        <button className="btn-primary" disabled={busy} onClick={() => ask(input)}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
