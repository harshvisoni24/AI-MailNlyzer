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
      select: { id: true, subject: true, fromAddress: true, threatClassification: true, threatScore: true, createdAt: true },
    });

    const recentAlerts = await prisma.alert.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 5 });

    // Last 7 days (oldest -> newest) for the Threat Analytics chart
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 6);
    const weekEmails = await prisma.email.findMany({
      where: { ownerId, createdAt: { gte: since } },
      select: { createdAt: true, threatScore: true },
    });
    const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = day.toDateString();
      const rows = weekEmails.filter((e: any) => new Date(e.createdAt).toDateString() === key);
      return {
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        total: rows.length,
        malicious: rows.filter((e: any) => (e.threatScore ?? 0) >= 70).length,
        suspicious: rows.filter((e: any) => (e.threatScore ?? 0) >= 40 && (e.threatScore ?? 0) < 70).length,
      };
    });
    const unreadAlerts = await prisma.alert.count({ where: { ownerId, isRead: false } });

    const dbOk = await checkDatabaseConnection();
    const aiOk = await checkAiServiceHealth();

    return res.json({
      metrics: { emailsAnalyzed, threatsDetected, criticalThreats, activeCases, activeCampaigns, evidenceItems },
      threatCategories: byClassification.map((b: any) => ({ classification: b.threatClassification, count: b._count._all })),
      recentInvestigations,
      recentAlerts,
      weeklyTrend,
      unreadAlerts,
      systemHealth: { database: dbOk, aiService: aiOk },
    });
  } catch (err) {
    return next(err);
  }
}
