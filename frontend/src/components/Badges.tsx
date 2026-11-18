import { CircleHelp, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";

interface Props {
  score?: number | null;
  classification?: string;
}

function severityFromScore(score: number | null | undefined): "critical" | "high" | "medium" | "low" | "neutral" {
  if (score === null || score === undefined) return "neutral";
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function ScoreBadge({ score }: { score?: number | null }) {
  const level = severityFromScore(score);
  return (
    <span className={`badge badge-${level}`}>
      {score !== null && score !== undefined ? `${score}/100` : "N/A"}
    </span>
  );
}

const CLASSIFICATION_LEVEL: Record<string, "critical" | "high" | "medium" | "low" | "neutral"> = {
  PHISHING: "critical",
  BEC: "critical",
  MALWARE_DELIVERY: "critical",
  FINANCIAL_FRAUD: "critical",
  CREDENTIAL_HARVESTING: "high",
  IMPERSONATION: "high",
  SUSPICIOUS: "medium",
  LOW_RISK: "low",
  LEGITIMATE: "low",
  UNKNOWN: "neutral",
};

export function ClassificationBadge({ classification }: Props) {
  const level = CLASSIFICATION_LEVEL[classification ?? "UNKNOWN"] ?? "neutral";
  const Icon = level === "low" ? ShieldCheck : level === "critical" ? TriangleAlert : level === "neutral" ? CircleHelp : ShieldAlert;
  return (
    <span className={`badge badge-${level}`}>
      <Icon size={13} /> {(classification ?? "UNKNOWN").replace(/_/g, " ")}
    </span>
  );
}

export function AuthResultBadge({ result }: { result: string }) {
  const map: Record<string, string> = {
    PASS: "low",
    FAIL: "critical",
    NEUTRAL: "medium",
    NONE: "neutral",
    INVALID: "high",
    UNKNOWN: "neutral",
  };
  const level = map[result] ?? "neutral";
  const icon = result === "PASS" ? "✓" : result === "FAIL" ? "✗" : "⚠";
  return <span className={`badge badge-${level}`}>{icon} {result}</span>;
}
