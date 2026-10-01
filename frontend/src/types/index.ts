export type RoleName = "ADMIN" | "SECURITY_ANALYST" | "INVESTIGATOR" | "VIEWER";

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  role: RoleName;
}

export type ThreatClassification =
  | "LEGITIMATE"
  | "LOW_RISK"
  | "SUSPICIOUS"
  | "PHISHING"
  | "IMPERSONATION"
  | "BEC"
  | "MALWARE_DELIVERY"
  | "FINANCIAL_FRAUD"
  | "CREDENTIAL_HARVESTING"
  | "UNKNOWN";

export interface EmailSummary {
  id: string;
  subject: string;
  fromAddress: string;
  threatClassification: ThreatClassification;
  threatScore: number | null;
  createdAt: string;
  sentDate?: string | null;
  isDemoData?: boolean;
}

export interface AiExplanation {
  observedFacts: string[];
  aiInferences: { statement: string; confidence: number }[];
  unknowns: string[];
  source: "GEMINI" | "RULE_ENGINE_ONLY";
}

export interface EmailDetail extends EmailSummary {
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  replyTo?: string;
  returnPath?: string;
  messageId?: string;
  receivedChain: string[];
  spfResult: string;
  dkimResult: string;
  dmarcResult: string;
  scoreFactors: Record<string, number>;
  aiExplanation: AiExplanation | null;
  attackStory: string | null;
  headers: { name: string; value: string }[];
  auth: {
    spf: string;
    spfDetail?: string;
    dkim: string;
    dkimDetail?: string;
    dmarc: string;
    dmarcDetail?: string;
    alignmentIssue: boolean;
  } | null;
  urls: { id: string; rawUrl: string; riskScore: number | null }[];
  attachments: { id: string; filename: string; mimeType: string; sizeBytes: number; sha256: string }[];
  iocs: { id: string; type: string; value: string }[];
  caseId?: string | null;
}

export interface CaseSummary {
  id: string;
  caseNumber: string;
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACTIVE" | "ON_HOLD" | "CLOSED";
  createdAt: string;
  assignedTo?: { fullName: string; email: string } | null;
  _count?: { emails: number; evidence: number };
}

export interface Alert {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description?: string;
  threatType?: string;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardSummary {
  metrics: {
    emailsAnalyzed: number;
    threatsDetected: number;
    criticalThreats: number;
    activeCases: number;
    activeCampaigns: number;
    evidenceItems: number;
  };
  threatCategories: { classification: string; count: number }[];
  recentInvestigations: EmailSummary[];
  recentAlerts: Alert[];
  systemHealth: { database: boolean; aiService: boolean };
}
