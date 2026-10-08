import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";

export async function listAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 50), 200);

    // Admins see everyone's activity; everyone else sees only their own.
    const isAdmin = (req.user as any)?.role === "ADMIN";
    const where = isAdmin ? {} : { userId: req.user!.userId };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { fullName: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return res.json({ items, total, page, pageSize });
  } catch (err) {
    return next(err);
  }
}
