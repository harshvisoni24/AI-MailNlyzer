import axios from "axios";
import { env } from "../config/env";

const client = axios.create({
  baseURL: env.aiServiceUrl,
  timeout: 20000,
  headers: { "x-api-key": env.aiServiceApiKey },
});

export interface AiAnalysisResult {
  classification: string;
  threatScore: number;
  mlPhishingProbability?: number;
  scoreFactors: Record<string, number>;
  observedFacts: string[];
  aiInferences: { statement: string; confidence: number }[];
  unknowns: string[];
  attackStory: string | null;
  becIndicators?: string[];
  phishingIndicators?: string[];
  recommendedActions: { immediate: string[]; investigation: string[]; threatHunting: string[] };
  aiExplanationSource: "GEMINI" | "RULE_ENGINE_ONLY";
}

export async function analyzeParsedEmail(payload: unknown): Promise<AiAnalysisResult> {
  const { data } = await client.post<AiAnalysisResult>("/api/analyze", payload);
  return data;
}

export async function askCopilot(question: string, investigationContext: unknown) {
  const { data } = await client.post("/api/copilot", { question, context: investigationContext });
  return data as { answer: string; groundedIn: string[]; source: "GEMINI" | "RULE_ENGINE_ONLY" };
}

export async function checkAiServiceHealth(): Promise<boolean> {
  try {
    const { data } = await client.get("/health", { timeout: 3000 });
    return data?.status === "ok";
  } catch (err) {
    console.error("AI service health check failed:", err instanceof Error ? err.message : "unknown error");
    return false;
  }
}
