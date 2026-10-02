import axios from "axios";
import { env } from "../config/env";

const client = axios.create({
  baseURL: env.aiServiceUrl,
  timeout: 80000,
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function analyzeParsedEmail(payload: unknown): Promise<AiAnalysisResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data } = await client.post<AiAnalysisResult>("/api/analyze", payload);
      return data;
    } catch (err) {
      lastErr = err;
      console.error(`AI analyze attempt ${attempt} failed:`, err instanceof Error ? err.message : "unknown error");
            if (axios.isAxiosError(err) && (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT")) break;
      await sleep(1000 * attempt);
    }
  }
  throw lastErr;
}

export async function askCopilot(question: string, investigationContext: unknown) {
  const { data } = await client.post("/api/copilot", { question, context: investigationContext });
  return data as { answer: string; groundedIn: string[]; source: "GEMINI" | "RULE_ENGINE_ONLY" };
}

export async function checkAiServiceHealth(): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data } = await client.get("/health", { timeout: 3000 });
      if (data?.status === "ok") return true;
    } catch (err) {
      console.error(`AI health check attempt ${attempt} failed:`, err instanceof Error ? err.message : "unknown error");
    }
    await sleep(1000);
  }
  return false;
}