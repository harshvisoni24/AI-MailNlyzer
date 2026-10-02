import { Request, Response, NextFunction } from "express";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/errorHandler";
import { parseRawEmail, extractReceivedChain } from "../services/emailParserService";
import {
  analyzeAuthentication,
  extractIpsFromReceivedChain,
  detectHeaderAnomalies,
  detectLookalikeDomain,
} from "../services/headerForensicsService";
import { analyzeParsedEmail, checkAiServiceHealth } from "../services/aiServiceClient";
import { recordAudit } from "../services/auditService";

const pasteSchema = z.object({
  rawEmail: z.string().min(20, "Raw email content is too short."),
  caseId: z.string().uuid().optional(),
});

async function ingestAndAnalyze(rawSource: string, storagePath: string | null, caseId: string | undefined, userId?: string) {
  const parsed = await parseRawEmail(rawSource);
  const receivedChain = extractReceivedChain(parsed.headers);
  const auth = analyzeAuthentication(parsed.authRawHeader);
  const anomalies = detectHeaderAnomalies({
    fromAddress: parsed.from,
    replyTo: parsed.replyTo,
    returnPath: parsed.returnPath,
    messageId: parsed.messageId,
  });
  const relayIps = extractIpsFromReceivedChain(receivedChain);
  const fromDomain = parsed.from.split("@")[1]?.toLowerCase() ?? "";
  const lookalike = fromDomain ? detectLookalikeDomain(fromDomain) : null;

  const email = await prisma.email.create({
    data: {
      caseId,
      rawSource: rawSource.slice(0, 200000), // guard against unbounded storage
      storagePath: storagePath ?? undefined,
      fromAddress: parsed.from,
      fromName: parsed.fromName,
      toAddresses: parsed.to,
      ccAddresses: parsed.cc,
      replyTo: parsed.replyTo,
      returnPath: parsed.returnPath,
      subject: parsed.subject,
      messageId: parsed.messageId,
      sentDate: parsed.date,
      receivedChain: receivedChain as unknown as object,
      spfResult: auth.spf,
      dkimResult: auth.dkim,
      dmarcResult: auth.dmarc,
      authRawHeader: parsed.authRawHeader,
      headers: { create: parsed.headers.map((h) => ({ name: h.name, value: h.value.slice(0, 5000) })) },
      auth: {
        create: {
          spf: auth.spf,
          spfDetail: auth.spfDetail,
          dkim: auth.dkim,
          dkimDetail: auth.dkimDetail,
          dmarc: auth.dmarc,
          dmarcDetail: auth.dmarcDetail,
          alignmentIssue: auth.spf === "FAIL" || auth.dkim === "FAIL" || auth.dmarc === "FAIL",
        },
      },
      urls: { create: parsed.urls.map((u) => ({ rawUrl: u })) },
      attachments: {
        create: parsed.attachments.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          sha256: a.sha256,
        })),
      },
      iocs: {
        create: [
          ...relayIps.map((ip) => ({ type: "IP" as const, value: ip })),
          ...parsed.urls.map((u) => ({ type: "URL" as const, value: u })),
        ],
      },
    },
    include: { headers: true, auth: true, urls: true, attachments: true, iocs: true },
  });

  // Call the AI service for classification + explainable scoring. If it's
  // unavailable, we degrade gracefully: header-forensics results still stand.
  const aiHealthy = await checkAiServiceHealth();
  let aiResult;
  let aiError = aiHealthy ? "" : "health check failed (service unreachable)";
  if (aiHealthy) {
    try {
      aiResult = await analyzeParsedEmail({
        fromAddress: parsed.from,
        subject: parsed.subject,
        textBody: parsed.textBody,
        htmlBody: parsed.htmlBody,
        auth,
        headerAnomalies: anomalies,
        lookalikeDomain: lookalike,
        urls: parsed.urls,
        relayIps,
        attachments: parsed.attachments,
      });
    } catch (err) {
      console.error("AI service call failed:", err);
      aiError = err instanceof Error ? err.message : "unknown error";
      aiResult = null;
    }
  }

  const finalClassification = aiResult?.classification ?? "UNKNOWN";
  const finalScore = aiResult?.threatScore ?? computeFallbackScore(auth, anomalies, lookalike);

  const updated = await prisma.email.update({
    where: { id: email.id },
    data: {
      threatClassification: finalClassification as any,
      threatScore: finalScore,
      scoreFactors: {
      ...(aiResult?.scoreFactors ?? { headerAnomalies: anomalies.length, lookalikeDomain: lookalike ? 1 : 0 }),
      ...(aiResult?.mlPhishingProbability !== undefined ? { mlPhishingProbability: aiResult.mlPhishingProbability } : {}),
      } as object,
      aiExplanation: {
        observedFacts: aiResult?.observedFacts ?? [
          `SPF = ${auth.spf}`,
          `DKIM = ${auth.dkim}`,
          `DMARC = ${auth.dmarc}`,
          ...anomalies,
        ],
        aiInferences: aiResult?.aiInferences ?? [{ statement: `AI unavailable: ${aiError}`, confidence: 0 }],
        unknowns: aiResult?.unknowns ?? ["Physical attacker location = UNKNOWN"],
        source: aiResult?.aiExplanationSource ?? "RULE_ENGINE_ONLY",
      } as object,
      attackStory: aiResult?.attackStory ?? null,
    },
    include: { headers: true, auth: true, urls: true, attachments: true, iocs: true },
  });

  // Auto-generate an alert for high-severity findings.
  if (finalScore >= 70) {
    await prisma.alert.create({
      data: {
        severity: finalScore >= 90 ? "CRITICAL" : "HIGH",
        title: `${finalClassification} detected: ${parsed.subject}`,
        description: `Threat score ${finalScore}/100 from ${parsed.from}`,
        sourceEmailId: updated.id,
        relatedCaseId: caseId,
        threatType: finalClassification,
      },
    });
  }

  await recordAudit({ userId, action: "EMAIL_ANALYZED", targetType: "Email", targetId: updated.id, status: "SUCCESS" });

  return updated;
}

function computeFallbackScore(
  auth: ReturnType<typeof analyzeAuthentication>,
  anomalies: string[],
  lookalike: ReturnType<typeof detectLookalikeDomain>
): number {
  let score = 0;
  if (auth.spf === "FAIL") score += 20;
  if (auth.dkim === "FAIL" || auth.dkim === "INVALID") score += 15;
  if (auth.dmarc === "FAIL") score += 20;
  score += Math.min(anomalies.length * 10, 30);
  if (lookalike) score += Math.min(lookalike.similarityPercent / 4, 20);
  return Math.min(Math.round(score), 100);
}

export async function uploadEmail(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new AppError("No file uploaded.", 400);
    const raw = fs.readFileSync(req.file.path, "utf-8");
    const caseId = req.body.caseId as string | undefined;
    const email = await ingestAndAnalyze(raw, req.file.path, caseId, req.user?.userId);
    return res.status(201).json(email);
  } catch (err) {
    return next(err);
  }
}

export async function pasteEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { rawEmail, caseId } = pasteSchema.parse(req.body);
    const email = await ingestAndAnalyze(rawEmail, null, caseId, req.user?.userId);
    return res.status(201).json(email);
  } catch (err) {
    return next(err);
  }
}

export async function listEmails(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 20), 100);
    const [items, total] = await Promise.all([
      prisma.email.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          subject: true,
          fromAddress: true,
          threatClassification: true,
          threatScore: true,
          createdAt: true,
          sentDate: true,
          isDemoData: true,
        },
      }),
      prisma.email.count(),
    ]);
    return res.json({ items, total, page, pageSize });
  } catch (err) {
    return next(err);
  }
}

export async function getEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const email = await prisma.email.findUnique({
      where: { id: req.params.id },
      include: { headers: true, auth: true, urls: { include: { domain: true } }, attachments: true, iocs: true, case: true },
    });
    if (!email) throw new AppError("Email not found.", 404);
    await recordAudit({ userId: req.user?.userId, action: "EMAIL_VIEWED", targetType: "Email", targetId: email.id, status: "SUCCESS" });
    return res.json(email);
  } catch (err) {
    return next(err);
  }
}

export async function getEmailHeaders(req: Request, res: Response, next: NextFunction) {
  try {
    const headers = await prisma.emailHeader.findMany({ where: { emailId: req.params.id } });
    const auth = await prisma.emailAuthentication.findUnique({ where: { emailId: req.params.id } });
    const email = await prisma.email.findUnique({ where: { id: req.params.id } });
    if (!email) throw new AppError("Email not found.", 404);
    return res.json({
      from: email.fromAddress,
      returnPath: email.returnPath,
      replyTo: email.replyTo,
      messageId: email.messageId,
      auth,
      receivedChain: email.receivedChain,
      rawHeaders: headers,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getEmailIocs(req: Request, res: Response, next: NextFunction) {
  try {
    const iocs = await prisma.iOC.findMany({ where: { emailId: req.params.id } });
    return res.json(iocs);
  } catch (err) {
    return next(err);
  }
}

export async function getEmailTrace(req: Request, res: Response, next: NextFunction) {
  try {
    const email = await prisma.email.findUnique({ where: { id: req.params.id } });
    if (!email) throw new AppError("Email not found.", 404);
    const receivedChain = (email.receivedChain as string[]) ?? [];
    const ips = extractIpsFromReceivedChain(receivedChain);
    return res.json({
      hops: receivedChain.map((raw, idx) => ({ order: idx + 1, raw })),
      extractedIps: ips,
      disclaimer:
        "IP geolocation identifies network infrastructure and does not necessarily represent the physical location or identity of the attacker.",
    });
  } catch (err) {
    return next(err);
  }
}
