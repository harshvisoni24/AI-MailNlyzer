import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/errorHandler";

const createCaseSchema = z.object({
  title: z.string().min(3),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  assignedToId: z.string().uuid().optional(),
});

async function nextCaseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.case.count({ where: { caseNumber: { startsWith: `CASE-${year}-` } } });
  return `CASE-${year}-${String(count + 1).padStart(5, "0")}`;
}

// Throws 404 unless the case exists AND belongs to the logged-in user.
async function assertCaseOwner(caseId: string, userId: string) {
  const found = await prisma.case.findFirst({ where: { id: caseId, ownerId: userId }, select: { id: true } });
  if (!found) throw new AppError("Case not found.", 404);
}

export async function createCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createCaseSchema.parse(req.body);
    const caseNumber = await nextCaseNumber();
    const created = await prisma.case.create({ data: { ...data, caseNumber, ownerId: req.user!.userId } });
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
}

export async function listCases(req: Request, res: Response, next: NextFunction) {
  try {
    const cases = await prisma.case.findMany({
      where: { ownerId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: {
        assignedTo: { select: { fullName: true, email: true } },
        _count: { select: { emails: true, evidence: true } },
      },
    });
    return res.json(cases);
  } catch (err) {
    return next(err);
  }
}

export async function getCase(req: Request, res: Response, next: NextFunction) {
  try {
    const found = await prisma.case.findFirst({
      where: { id: req.params.id, ownerId: req.user!.userId },
      include: {
        assignedTo: true,
        emails: true,
        evidence: { include: { custodyEvents: true } },
        notes: { include: { author: { select: { fullName: true } } } },
        campaigns: { include: { campaign: true } },
      },
    });
    if (!found) throw new AppError("Case not found.", 404);
    return res.json(found);
  } catch (err) {
    return next(err);
  }
}

const updateCaseSchema = z.object({
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "ACTIVE", "ON_HOLD", "CLOSED"]).optional(),
  assignedToId: z.string().uuid().optional(),
  title: z.string().min(3).optional(),
});

export async function updateCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateCaseSchema.parse(req.body);
    await assertCaseOwner(req.params.id, req.user!.userId);
    const updated = await prisma.case.update({
      where: { id: req.params.id },
      data: { ...data, closedAt: data.status === "CLOSED" ? new Date() : undefined },
    });
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
}

const addNoteSchema = z.object({ content: z.string().min(1) });

export async function addCaseNote(req: Request, res: Response, next: NextFunction) {
  try {
    const { content } = addNoteSchema.parse(req.body);
    if (!req.user) throw new AppError("Authentication required.", 401);
    await assertCaseOwner(req.params.id, req.user.userId);
    const note = await prisma.investigationNote.create({
      data: { caseId: req.params.id, authorId: req.user.userId, content },
    });
    return res.status(201).json(note);
  } catch (err) {
    return next(err);
  }
}

export async function getCaseTimeline(req: Request, res: Response, next: NextFunction) {
  try {
    await assertCaseOwner(req.params.id, req.user!.userId);
    const evidence = await prisma.evidence.findMany({
      where: { caseId: req.params.id },
      include: { custodyEvents: { orderBy: { occurredAt: "asc" } } },
    });
    const events = evidence.flatMap((e: any) =>
      e.custodyEvents.map((c: any) => ({ evidenceId: e.id, action: c.action, detail: c.detail, occurredAt: c.occurredAt }))
    );
    events.sort((a: any, b: any) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return res.json(events);
  } catch (err) {
    return next(err);
  }
}

export async function linkEmailToCase(req: Request, res: Response, next: NextFunction) {
  try {
    const { emailId } = z.object({ emailId: z.string().uuid() }).parse(req.body);
    const userId = req.user!.userId;
    await assertCaseOwner(req.params.id, userId);
    const email = await prisma.email.findFirst({ where: { id: emailId, ownerId: userId }, select: { id: true } });
    if (!email) throw new AppError("Email not found.", 404);
    const updated = await prisma.email.update({ where: { id: emailId }, data: { caseId: req.params.id } });
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
}
