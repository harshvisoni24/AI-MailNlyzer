import { useState } from "react";
import { Bot, FolderOpen, Mail, MessageSquareText, Send, Zap } from "lucide-react";
import { api } from "../lib/api";
import PageHero, { PageShell } from "../components/PageHero";

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
    <PageShell>
      <PageHero
        icon={<Bot size={64} strokeWidth={1.5} />}
        title="Forensic Copilot"
        subtitle="Answers are grounded in real investigation data. Optionally scope the conversation to a specific email or case ID below."
      />

      <div className="grid md:grid-cols-2 gap-5">
        <div className="relative">
          <Mail size={30} className="absolute left-5 top-1/2 -translate-y-1/2 text-cyan-300 pointer-events-none" />
          <input className="input-xl" placeholder="Email ID (optional)" value={emailId} onChange={(e) => setEmailId(e.target.value)} />
        </div>
        <div className="relative">
          <FolderOpen size={30} className="absolute left-5 top-1/2 -translate-y-1/2 text-indigo-300 pointer-events-none" />
          <input className="input-xl" placeholder="Case ID (optional)" value={caseId} onChange={(e) => setCaseId(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <button key={s} disabled={busy} onClick={() => ask(s)} className="pill !py-2 !px-3 !text-[12.5px] hover:border-cyan-300 hover:shadow-glow transition disabled:opacity-60">
            <Zap size={16} className="text-cyan-300" /> {s}
          </button>
        ))}
      </div>

      {messages.length > 0 && (
        <div className="glow-panel p-5 space-y-3 max-h-[320px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`text-[15px] ${m.role === "user" ? "text-slate-100" : "text-cyan-300"}`}>
              <span className="text-xs uppercase tracking-wide text-slate-400 mr-2">{m.role === "user" ? "You" : "Copilot"}</span>
              {m.text}
              {m.source === "RULE_ENGINE_ONLY" && <span className="text-[11px] text-slate-400 ml-2">(rule-engine fallback — Gemini unavailable)</span>}
            </div>
          ))}
          {busy && <div className="text-sm text-slate-400">Copilot is thinking…</div>}
        </div>
      )}

      <div className="glow-panel relative overflow-hidden p-5 min-h-[240px]">
        <MessageSquareText size={34} className="absolute left-6 top-6 text-sky-300" />
        <textarea
          className="relative w-full h-[200px] resize-none bg-transparent pl-[74px] pr-4 pt-1 text-[17px] text-slate-100 placeholder:text-slate-300/70 focus:outline-none"
          placeholder="Ask me a question related to this investigation…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
        />
      </div>

      <div className="flex justify-end">
        <button
          className="btn-primary !rounded-2xl !h-14 !w-[76px] shadow-glow"
          disabled={busy || !input.trim()}
          onClick={() => ask(input)}
          title="Send (Enter)"
        >
          <Send size={26} />
        </button>
      </div>
    </PageShell>
  );
}
