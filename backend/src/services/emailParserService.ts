import { simpleParser, ParsedMail } from "mailparser";
import { sha256 } from "../utils/hash";

export interface ParsedEmailData {
  from: string;
  fromName?: string;
  to: string[];
  cc: string[];
  subject: string;
  messageId?: string;
  date?: Date;
  replyTo?: string;
  returnPath?: string;
  headers: { name: string; value: string }[];
  authRawHeader?: string;
  urls: string[];
  attachments: { filename: string; mimeType: string; sizeBytes: number; sha256: string }[];
  textBody?: string;
  htmlBody?: string;
}

const URL_REGEX = /\bhttps?:\/\/[^\s"'<>()[\]]+/gi;

/** Coerces a mailparser header value (string | string[] | AddressObject | Date | ...) into a plain string. */
function headerValueToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => headerValueToString(v)).join("; ");
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    // AddressObject-like structures expose a `.text` field with the original header text.
    const maybeText = (value as { text?: string }).text;
    if (typeof maybeText === "string") return maybeText;
    return JSON.stringify(value);
  }
  return String(value ?? "");
}
/** Fallback: timestamp of the oldest Received hop (text after the last ";"). */
function dateFromReceivedChain(headers: { name: string; value: string }[]): Date | undefined {
  const hops = headers.filter((h) => h.name.toLowerCase() === "received");
  const oldest = hops[hops.length - 1]?.value;
  const stamp = oldest?.split(";").pop()?.trim();
  if (!stamp) return undefined;
  const d = new Date(stamp);
  return isNaN(d.getTime()) ? undefined : d;
}
export async function parseRawEmail(raw: string | Buffer): Promise<ParsedEmailData> {
  const parsed: ParsedMail = await simpleParser(raw);

  // mailparser collapses repeated headers (e.g. multiple "Received" hops)
  // into a single Map entry whose value is an ARRAY of the raw header
  // strings. We must expand those back into one entry per hop, or relay
  // tracing / received-chain parsing silently sees only one (garbled) hop.
  const headers: { name: string; value: string }[] = [];
  parsed.headers.forEach((value, name) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.push({ name, value: headerValueToString(item) });
      }
    } else {
      headers.push({ name, value: headerValueToString(value) });
    }
  });

  const authRawHeader = headers.find((h) => h.name.toLowerCase() === "authentication-results")?.value;

  const bodyText = [parsed.text ?? "", parsed.html ? String(parsed.html) : ""].join("\n");
  const rawUrls = bodyText.match(URL_REGEX) ?? [];
  const urls = Array.from(new Set(rawUrls.map((u) => u.trim().replace(/[.,;:!?]+$/, ""))));

  const attachments = (parsed.attachments ?? []).map((a) => ({
    filename: a.filename ?? "unnamed",
    mimeType: a.contentType,
    sizeBytes: a.size,
    sha256: sha256(a.content),
  }));

  return {
    from: parsed.from?.value?.[0]?.address ?? "unknown@unknown",
    fromName: parsed.from?.value?.[0]?.name,
    to: (parsed.to && "value" in parsed.to ? parsed.to.value : []).map((t) => t.address ?? "").filter(Boolean),
    cc: (parsed.cc && "value" in parsed.cc ? parsed.cc.value : []).map((t) => t.address ?? "").filter(Boolean),
    subject: parsed.subject ?? "(no subject)",
    messageId: parsed.messageId,
    date: parsed.date ?? dateFromReceivedChain(headers),
    replyTo: parsed.replyTo?.value?.[0]?.address,
    returnPath: headers.find((h) => h.name.toLowerCase() === "return-path")?.value,
    headers,
    authRawHeader,
    urls,
    attachments,
    textBody: parsed.text,
    htmlBody: parsed.html ? String(parsed.html) : undefined,
  };
}

/**
 * Reconstructs the SMTP relay path from `Received` headers, in
 * chronological order (the last `Received` header added is the first hop).
 */
export function extractReceivedChain(headers: { name: string; value: string }[]): string[] {
  return headers
    .filter((h) => h.name.toLowerCase() === "received")
    .map((h) => h.value)
    .reverse();
}
