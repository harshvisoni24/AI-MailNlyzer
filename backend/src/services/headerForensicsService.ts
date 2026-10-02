const AUTH_RESULT_MAP: Record<string, "PASS" | "FAIL" | "NEUTRAL" | "NONE" | "INVALID" | "UNKNOWN"> = {
  pass: "PASS",
  fail: "FAIL",
  softfail: "FAIL",
  neutral: "NEUTRAL",
  none: "NONE",
  permerror: "INVALID",
  temperror: "INVALID",
  policy: "INVALID",
};

function extractResult(authHeader: string | undefined, mechanism: "spf" | "dkim" | "dmarc") {
  if (!authHeader) return { result: "UNKNOWN" as const, detail: undefined as string | undefined };
  const regex = new RegExp(`${mechanism}=([a-z]+)([^;]*)`, "i");
  const match = authHeader.match(regex);
  if (!match) return { result: "UNKNOWN" as const, detail: undefined };
  const raw = match[1].toLowerCase();
  return { result: AUTH_RESULT_MAP[raw] ?? "UNKNOWN", detail: match[0].trim() };
}

export function analyzeAuthentication(authRawHeader: string | undefined) {
  const spf = extractResult(authRawHeader, "spf");
  const dkim = extractResult(authRawHeader, "dkim");
  const dmarc = extractResult(authRawHeader, "dmarc");

  return {
    spf: spf.result,
    spfDetail: spf.detail,
    dkim: dkim.result,
    dkimDetail: dkim.detail,
    dmarc: dmarc.result,
    dmarcDetail: dmarc.detail,
  };
}

const IPV4_REGEX = /(?<![\d.])(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?![\d.])/g;
// Require at least 4 hex groups (i.e. 3+ colons) to avoid false-matching
// timestamps like "09:14:15" (3 groups / 2 colons) found in Received headers.
const IPV6_REGEX = /\b([a-f0-9]{1,4}:){3,7}[a-f0-9]{1,4}\b/gi;
function isPublicIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const nums: number[] = [];
  for (const p of parts) {
    // reject leading zeros (like "09"), empty parts and non-digits
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return false;
    const n = Number(p);
    if (n > 255) return false;
    nums.push(n);
  }

  const [a, b] = nums;
  if (a === 0) return false;                           // 0.0.0.0/8
  if (a === 10) return false;                          // private
  if (a === 127) return false;                         // loopback
  if (a === 169 && b === 254) return false;            // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;   // private
  if (a === 192 && b === 168) return false;            // private
  if (a === 100 && b >= 64 && b <= 127) return false;  // carrier-grade NAT
  if (a >= 224) return false;                          // multicast and reserved
  return true;
}

export function extractIpsFromReceivedChain(receivedHeaders: string[]): string[] {
  const found = new Set<string>();
  for (const header of receivedHeaders) {
    if (/^\s*by\s/i.test(header)) continue; // receiving server's own hop (Google's IPv6)
    for (const match of header.matchAll(IPV4_REGEX)) {
      const ip = match[1];
      if (!isPublicIPv4(ip)) continue;
      found.add(ip);
    }
    for (const match of header.matchAll(IPV6_REGEX)) {
      found.add(match[0]);
    }
  }
  return Array.from(found);
}
function sameOrg(a: string, b: string): boolean {
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}
export function detectHeaderAnomalies(params: {
  fromAddress: string;
  replyTo?: string;
  returnPath?: string;
  messageId?: string;
}) {
  const anomalies: string[] = [];
  const fromDomain = params.fromAddress.split("@")[1]?.toLowerCase();

  if (params.replyTo) {
    const replyDomain = params.replyTo.split("@")[1]?.toLowerCase();
      if(replyDomain && fromDomain && !sameOrg(replyDomain, fromDomain)) {
      anomalies.push(`Reply-To domain (${replyDomain}) differs from From domain (${fromDomain}).`);
    }
  }

  if (params.returnPath) {
    const returnPathStr = String(params.returnPath);
    const rpMatch = returnPathStr.match(/<(.+?)>/);
    const rpAddress = rpMatch ? rpMatch[1] : returnPathStr;
    const rpDomain = rpAddress.split("@")[1]?.toLowerCase();
    if (rpDomain && fromDomain && !sameOrg(rpDomain, fromDomain)) {
      anomalies.push(`Return-Path domain (${rpDomain}) differs from From domain (${fromDomain}).`);
    }
  }

  if (params.messageId) {
    const midDomain = params.messageId.replace(/[<>]/g, "").split("@")[1]?.toLowerCase();
      if(midDomain && midDomain.includes(".") && fromDomain && !sameOrg(midDomain, fromDomain)) {
      anomalies.push(`Message-ID domain (${midDomain}) is unrelated to From domain (${fromDomain}); possible forged origin.`);
    }
  } else {
    anomalies.push("Message-ID header is missing, which is unusual for legitimate mail servers.");
  }

  return anomalies;
}

/**
 * Simple Levenshtein-distance based lookalike-domain detector against a
 * small set of commonly-impersonated brand domains. This is intentionally
 * transparent/deterministic (not ML) so results are explainable.
 */
const COMMONLY_IMPERSONATED_DOMAINS = [
  "microsoft.com",
  "google.com",
  "apple.com",
  "paypal.com",
  "amazon.com",
  "bankofamerica.com",
  "aicte-india.org",
  "gov.in",
];

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export function detectLookalikeDomain(domain: string): { trustedDomain: string; similarityPercent: number } | null {
  let best: { trustedDomain: string; similarityPercent: number } | null = null;

  const candidateSegments = domain.toLowerCase().split(/[.\-_]/).filter(Boolean);

  for (const trusted of COMMONLY_IMPERSONATED_DOMAINS) {
    if (domain === trusted) continue; // exact match is not a lookalike
    const trustedCore = trusted.split(".")[0]; // e.g. "microsoft" from "microsoft.com"

    const similarityScores: number[] = [];

    // 1. Whole-domain similarity (catches classic char-substitution lookalikes
    //    like "micr0soft.com").
    const wholeDistance = levenshtein(domain, trusted);
    const wholeMaxLen = Math.max(domain.length, trusted.length);
    similarityScores.push(((wholeMaxLen - wholeDistance) / wholeMaxLen) * 100);

    // 2. Best per-segment similarity against the trusted brand's core name.
    //    Catches "micros0ft-login.com", "paypal-secure.net", etc. where a
    //    brand token is combined with extra words/hyphens/subdomains.
    for (const segment of candidateSegments) {
      if (segment.length < 4) continue; // skip short/noisy segments (tld, "www", etc.)
      const distance = levenshtein(segment, trustedCore);
      const maxLen = Math.max(segment.length, trustedCore.length);
      similarityScores.push(((maxLen - distance) / maxLen) * 100);
    }

    const bestSimilarity = Math.max(...similarityScores);
    if (bestSimilarity > 70 && (!best || bestSimilarity > best.similarityPercent)) {
      best = { trustedDomain: trusted, similarityPercent: Math.round(bestSimilarity * 10) / 10 };
    }
  }
  return best;
}
