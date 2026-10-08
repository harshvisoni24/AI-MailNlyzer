import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/errorHandler";

export async function listAlerts(req: Request, res: Response, next: NextFunction) {
  try {
    const alerts = await prisma.alert.findMany({
      where: { ownerId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json(alerts);
  } catch (err) {
    return next(err);
  }
}

export async function markAlertRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await prisma.alert.updateMany({
      where: { id: req.params.id, ownerId: req.user!.userId },
      data: { isRead: true },
    });
    if (result.count === 0) throw new AppError("Alert not found.", 404);
    const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
    return res.json(alert);
  } catch (err) {
    return next(err);
  }
}
