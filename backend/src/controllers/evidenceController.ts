import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/errorHandler";
import { sha256, computeLedgerEntryHash } from "../utils/hash";
import { recordAudit } from "../services/auditService";

const createEvidenceSchema = z.object({
  caseId: z.string().uuid(),
  emailId: z.string().uuid().optional(),
  evidenceType: z.string().default("EMAIL"),
  source: z.string().optional(),
  content: z.string().min(1), // raw content to hash (e.g. raw email, note text)
});

export async function createEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Authentication required.", 401);
    const data = createEvidenceSchema.parse(req.body);

    // The case (and email, if given) must belong to the logged-in user.
    const ownedCase = await prisma.case.findFirst({ where: { id: data.caseId, ownerId: req.user.userId }, select: { id: true } });
    if (!ownedCase) throw new AppError("Case not found.", 404);
    if (data.emailId) {
      const ownedEmail = await prisma.email.findFirst({ where: { id: data.emailId, ownerId: req.user.userId }, select: { id: true } });
      if (!ownedEmail) throw new AppError("Email not found.", 404);
    }

    const evidenceHash = sha256(data.content);

    const evidence = await prisma.evidence.create({
      data: {
        caseId: data.caseId,
        emailId: data.emailId,
        evidenceType: data.evidenceType,
        source: data.source,
        sha256: evidenceHash,
        acquiredById: req.user.userId,
        integrityStatus: "VERIFIED",
      },
    });

    await prisma.chainOfCustodyEvent.create({
      data: { evidenceId: evidence.id, actorId: req.user.userId, action: "ACQUIRED", detail: `SHA-256: ${evidenceHash}` },
    });
    await prisma.chainOfCustodyEvent.create({
      data: { evidenceId: evidence.id, actorId: req.user.userId, action: "HASHED", detail: evidenceHash },
    });

    // Append to the tamper-evident hash-chain ledger.
    const lastEntry = await prisma.evidenceLedgerEntry.findFirst({ orderBy: { timestamp: "desc" } });
    const timestamp = new Date().toISOString();
    const entryHash = computeLedgerEntryHash({
      previousHash: lastEntry?.entryHash ?? null,
      evidenceHash,
      action: "ACQUIRED",
      timestamp,
    });
    await prisma.evidenceLedgerEntry.create({
      data: {
        evidenceId: evidence.id,
        action: "ACQUIRED",
        analystId: req.user.userId,
        entryHash,
        previousHash: lastEntry?.entryHash ?? null,
        timestamp: new Date(timestamp),
      },
    });

    await recordAudit({ userId: req.user.userId, action: "EVIDENCE_CREATED", targetType: "Evidence", targetId: evidence.id, status: "SUCCESS" });

    return res.status(201).json(evidence);
  } catch (err) {
    return next(err);
  }
}

export async function listEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const where = {
      case: { ownerId: req.user!.userId },
      ...(req.query.caseId ? { caseId: String(req.query.caseId) } : {}),
    };
    const evidence = await prisma.evidence.findMany({
      where,
      include: { custodyEvents: true, acquiredBy: { select: { fullName: true } } },
      orderBy: { acquiredAt: "desc" },
    });
    return res.json(evidence);
  } catch (err) {
    return next(err);
  }
}

export async function getEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const evidence = await prisma.evidence.findFirst({
      where: { id: req.params.id, case: { ownerId: req.user!.userId } },
      include: { custodyEvents: { orderBy: { occurredAt: "asc" } }, ledgerEntries: { orderBy: { timestamp: "asc" } }, acquiredBy: true },
    });
    if (!evidence) throw new AppError("Evidence not found.", 404);
    await recordAudit({ userId: req.user?.userId, action: "EVIDENCE_ACCESSED", targetType: "Evidence", targetId: evidence.id, status: "SUCCESS" });
    return res.json(evidence);
  } catch (err) {
    return next(err);
  }
}

/**
 * Verifies the hash chain of the ledger by checking that each entry points to
 * the hash of the entry before it. The chain is shared by all users (each new
 * entry links to the previous one), so the whole chain is checked, but the
 * response only reveals details about the logged-in user's own entries.
 */
export async function verifyLedgerIntegrity(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const entries = await prisma.evidenceLedgerEntry.findMany({
      orderBy: { timestamp: "asc" },
      include: { evidence: { select: { case: { select: { ownerId: true } } } } },
    });
    let previousHash: string | null = null;
    for (const entry of entries) {
      if (entry.previousHash !== previousHash) {
        const isMine = entry.evidence.case.ownerId === userId;
        return res.json({ valid: false, brokenAt: isMine ? entry.id : undefined });
      }
      previousHash = entry.entryHash;
    }
    const mine = entries.filter((e: any) => e.evidence.case.ownerId === userId).length;
    return res.json({ valid: true, totalEntries: mine });
  } catch (err) {
    return next(err);
  }
}
