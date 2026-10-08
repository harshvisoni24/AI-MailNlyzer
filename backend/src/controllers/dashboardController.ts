import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { checkDatabaseConnection } from "../config/prisma";
import { checkAiServiceHealth } from "../services/aiServiceClient";

export async function getDashboardSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerId = req.user!.userId;

    const [emailsAnalyzed, criticalThreats, threatsDetected, activeCases, activeCampaigns, evidenceItems, byClassification] =
      await Promise.all([
        prisma.email.count({ where: { ownerId } }),
        prisma.email.count({ where: { ownerId, threatScore: { gte: 90 } } }),
        prisma.email.count({ where: { ownerId, threatClassification: { notIn: ["LEGITIMATE", "LOW_RISK"] } } }),
        prisma.case.count({ where: { ownerId, status: { in: ["OPEN", "ACTIVE"] } } }),
        prisma.campaign.count({ where: { ownerId } }),
        prisma.evidence.count({ where: { case: { ownerId } } }),
        prisma.email.groupBy({ by: ["threatClassification"], where: { ownerId }, _count: { _all: true } }),
      ]);

    const recentInvestigations = await prisma.email.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, subject: true, threatClassification: true, threatScore: true, createdAt: true },
    });

    const recentAlerts = await prisma.alert.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 5 });

    const dbOk = await checkDatabaseConnection();
    const aiOk = await checkAiServiceHealth();

    return res.json({
      metrics: { emailsAnalyzed, threatsDetected, criticalThreats, activeCases, activeCampaigns, evidenceItems },
      threatCategories: byClassification.map((b: any) => ({ classification: b.threatClassification, count: b._count._all })),
      recentInvestigations,
      recentAlerts,
      systemHealth: { database: dbOk, aiService: aiOk },
    });
  } catch (err) {
    return next(err);
  }
}
