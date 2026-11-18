import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { checkDatabaseConnection } from "../config/prisma";
import { checkAiServiceHealth } from "../services/aiServiceClient";
import { extractIpsFromReceivedChain } from "../services/headerForensicsService";

// ---- IP -> approximate location (free ip-api.com batch endpoint, cached in memory) ----
type Geo = { lat: number; lon: number; city?: string; country?: string } | null;
const geoCache = new Map<string, Geo>();

async function lookupGeo(ips: string[]) {
  const todo = ips.filter((ip) => !geoCache.has(ip)).slice(0, 100);
  if (todo.length) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch("http://ip-api.com/batch?fields=status,query,country,city,lat,lon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(todo),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const rows = (await r.json()) as any[];
      for (const row of rows) {
        geoCache.set(
          row.query,
          row.status === "success" ? { lat: row.lat, lon: row.lon, city: row.city, country: row.country } : null
        );
      }
    } catch {
      // offline or rate-limited: leave uncached so the next dashboard load tries again
    }
  }
  return geoCache;
}

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
      select: { createdAt: true, threatScore: true, threatClassification: true },
    });
    // Cases that are active now, or were still open on a given day (for the Active Cases graph)
    const caseRows = await prisma.case.findMany({
      where: { ownerId },
      select: { createdAt: true, closedAt: true, status: true },
    });
    const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(since);
      day.setDate(since.getDate() + i);
      const key = day.toDateString();
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const rows = weekEmails.filter((e: any) => new Date(e.createdAt).toDateString() === key);
      return {
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        total: rows.length,
        malicious: rows.filter((e: any) => (e.threatScore ?? 0) >= 70).length,
        suspicious: rows.filter((e: any) => (e.threatScore ?? 0) >= 40 && (e.threatScore ?? 0) < 70).length,
        // same rules as the big numbers on the metric cards
        threats: rows.filter((e: any) => !["LEGITIMATE", "LOW_RISK"].includes(e.threatClassification)).length,
        critical: rows.filter((e: any) => (e.threatScore ?? 0) >= 90).length,
        activeCases: caseRows.filter(
          (c: any) =>
            new Date(c.createdAt) <= dayEnd &&
            (["OPEN", "ACTIVE"].includes(c.status) || (c.closedAt && new Date(c.closedAt) > dayEnd))
        ).length,
      };
    });
    const unreadAlerts = await prisma.alert.count({ where: { ownerId, isRead: false } });

    // Where suspicious / malicious emails came from: first public IP in each Received chain
    const mapEmails = await prisma.email.findMany({
      where: { ownerId, threatClassification: { notIn: ["LEGITIMATE", "LOW_RISK"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { threatScore: true, receivedChain: true },
    });
    const byIp = new Map<string, { ip: string; emails: number; maxScore: number }>();
    for (const e of mapEmails) {
      const chain = Array.isArray(e.receivedChain) ? (e.receivedChain as unknown[]).map(String) : [];
      const ip = extractIpsFromReceivedChain(chain)[0];
      if (!ip) continue;
      const cur = byIp.get(ip) ?? { ip, emails: 0, maxScore: 0 };
      cur.emails += 1;
      cur.maxScore = Math.max(cur.maxScore, e.threatScore ?? 0);
      byIp.set(ip, cur);
    }
    const geo = await lookupGeo(Array.from(byIp.keys()));
    const threatMap = Array.from(byIp.values()).flatMap((p) => {
      const g = geo.get(p.ip);
      return g ? [{ ...p, ...g }] : [];
    });

    const dbOk = await checkDatabaseConnection();
    const aiOk = await checkAiServiceHealth();

    return res.json({
      metrics: { emailsAnalyzed, threatsDetected, criticalThreats, activeCases, activeCampaigns, evidenceItems },
      threatCategories: byClassification.map((b: any) => ({ classification: b.threatClassification, count: b._count._all })),
      recentInvestigations,
      recentAlerts,
      weeklyTrend,
      threatMap,
      unreadAlerts,
      systemHealth: {
        database: dbOk,
        aiService: aiOk,
        threatIntel: Boolean(process.env.VIRUSTOTAL_API_KEY || process.env.ABUSEIPDB_API_KEY),
      },
    });
  } catch (err) {
    return next(err);
  }
}
