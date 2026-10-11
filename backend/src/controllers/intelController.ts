import { promises as dns } from "dns";
import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/errorHandler";

// Accepts "sih.gov.in", "https://sih.gov.in/signin" etc. and returns just the host name.
function toHostname(input: string): string {
  const v = input.trim();
  try {
    return new URL(v.includes("://") ? v : `https://${v}`).hostname.toLowerCase();
  } catch {
    return v.toLowerCase();
  }
}

// Finds the IPv4 address(es) a domain points to. Asks Google/Cloudflare DNS first
// (some networks' own DNS returns nothing), then falls back to the system DNS.
async function resolveIpv4(host: string): Promise<string[]> {
  const attempts: (string[] | null)[] = [["8.8.8.8", "1.1.1.1"], null];
  for (const servers of attempts) {
    try {
      const resolver = new dns.Resolver();
      if (servers) resolver.setServers(servers);
      const ips = await resolver.resolve4(host);
      if (ips.length) return ips;
    } catch {
      /* try the next DNS server list */
    }
  }
  return [];
}

// AbuseIPDB check for one IP. Returns null if the lookup fails.
async function checkAbuseIp(ip: string) {
  try {
    const r = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      { headers: { Key: process.env.ABUSEIPDB_API_KEY as string, Accept: "application/json" } }
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const score = j?.data?.abuseConfidenceScore ?? 0;
    return {
      ip,
      country: j?.data?.countryCode,
      isp: j?.data?.isp,
      usageType: j?.data?.usageType,
      score,
      verdict: score >= 50 ? "Malicious" : score > 0 ? "Suspicious" : "Clean",
    };
  } catch {
    return null;
  }
}

export async function listDomains(_req: Request, res: Response, next: NextFunction) {
  try {
    const domains = await prisma.domain.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return res.json(domains);
  } catch (err) {
    return next(err);
  }
}

export async function getDomain(req: Request, res: Response, next: NextFunction) {
  try {
    const domain = await prisma.domain.findUnique({
      where: { id: req.params.id },
      include: { threatIntel: true, urls: true },
    });
    if (!domain) throw new AppError("Domain not found.", 404);
    return res.json(domain);
  } catch (err) {
    return next(err);
  }
}

export async function listIps(_req: Request, res: Response, next: NextFunction) {
  try {
    const ips = await prisma.iP.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return res.json(ips);
  } catch (err) {
    return next(err);
  }
}

export async function getIp(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = await prisma.iP.findUnique({ where: { id: req.params.id }, include: { threatIntel: true } });
    if (!ip) throw new AppError("IP not found.", 404);
    return res.json(ip);
  } catch (err) {
    return next(err);
  }
}

export async function listUrls(_req: Request, res: Response, next: NextFunction) {
  try {
    const urls = await prisma.url.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { domain: true } });
    return res.json(urls);
  } catch (err) {
    return next(err);
  }
}

/**
 * Threat intel lookup that fans out to configured providers if API keys are
 * present, otherwise returns a clearly-labeled simulated result so the demo
 * still functions without external accounts.
 */
export async function lookupThreatIntel(req: Request, res: Response, next: NextFunction) {
  try {
    const { type, value: rawValue } = req.query as { type?: string; value?: string };
    if (!type || !rawValue) throw new AppError("type and value query parameters are required.", 400);
    const value = type === "domain" ? toHostname(rawValue) : rawValue.trim();

    const hasVirusTotal = Boolean(process.env.VIRUSTOTAL_API_KEY);
    const hasAbuseIpDb = Boolean(process.env.ABUSEIPDB_API_KEY);

    if (!hasVirusTotal && !hasAbuseIpDb) {
      return res.json({
        source: "DEMO THREAT INTELLIGENCE",
        status: "SIMULATED",
        type,
        value,
        verdict: "Unable to determine — no live threat intelligence provider configured.",
        note: "Configure VIRUSTOTAL_API_KEY / ABUSEIPDB_API_KEY in ai-service or backend .env to enable live lookups.",
      });
    }

    // Provider adapters would be called here (not implemented without a live
    // key in this environment). Architecture is integration-ready.
        let result: any;

    if (type === "ip" && hasAbuseIpDb) {
      const r = await fetch(
        `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(value)}&maxAgeInDays=90`,
        { headers: { Key: process.env.ABUSEIPDB_API_KEY as string, Accept: "application/json" } }
      );
      const j: any = await r.json();
      const score = j?.data?.abuseConfidenceScore ?? 0;
      if (!r.ok) throw new AppError("AbuseIPDB lookup failed (" + r.status + "). Check the API key.", 502);
      result = {
        source: "ABUSEIPDB",
        country: j?.data?.countryCode,
        isp: j?.data?.isp,
        usageType: j?.data?.usageType,
        status: "LIVE",
        type,
        value,
        verdict: score >= 50 ? "Malicious" : score > 0 ? "Suspicious" : "Clean",
        score,
      };
    } else if (hasVirusTotal) {
      const path = type === "ip" ? "ip_addresses" : "domains";
      const r = await fetch(
        `https://www.virustotal.com/api/v3/${path}/${encodeURIComponent(value)}`,
        { headers: { "x-apikey": process.env.VIRUSTOTAL_API_KEY as string } }
      );
      const j: any = await r.json();
      if (!r.ok) throw new AppError("VirusTotal lookup failed (" + r.status + "). Check the API key.", 502);
      const stats = j?.data?.attributes?.last_analysis_stats ?? {};
      const bad = (stats.malicious ?? 0) + (stats.suspicious ?? 0);
      let resolvedIps: any[] = [];
      if (type === "domain") {
        const found = (await resolveIpv4(value)).slice(0, 3);
        resolvedIps = await Promise.all(
          found.map(async (ip) => (hasAbuseIpDb ? await checkAbuseIp(ip) : null) ?? { ip })
        );
      }
      result = {
        source: "VIRUSTOTAL",
        status: "LIVE",
        type,
        value,
        verdict: bad >= 5 ? "Malicious" : bad >= 3 ? "Suspicious" : "Clean",
        score: bad,
        resolvedIps,
      };
    } else {
      result = { source: "NONE", status: "UNSUPPORTED", type, value, note: "No key for this type." };
    }
    if (result.status === "LIVE") {
      const score = Math.min(100, Number(result.score ?? 0));
      if (type === "ip") {
        await prisma.iP.upsert({
          where: { address: value },
          update: { reputationScore: score, lastEnrichedAt: new Date(), country: result.country, isp: result.isp },
          create: { address: value, reputationScore: score, lastEnrichedAt: new Date(), country: result.country, isp: result.isp },
        });
      } else {
        await prisma.domain.upsert({
          where: { name: value },
          update: { reputationScore: score, lastEnrichedAt: new Date() },
          create: { name: value, reputationScore: score, lastEnrichedAt: new Date() },
        });
        for (const r of result.resolvedIps ?? []) {
          if (r.country === undefined && r.isp === undefined) continue;
          const ipScore = Math.min(100, Number(r.score ?? 0));
          await prisma.iP.upsert({
            where: { address: r.ip },
            update: { reputationScore: ipScore, lastEnrichedAt: new Date(), country: r.country, isp: r.isp },
            create: { address: r.ip, reputationScore: ipScore, lastEnrichedAt: new Date(), country: r.country, isp: r.isp },
          });
        }
      }
    }
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

/** Cheap DNS-only lookup: which IP(s) does this website currently point to? */
export async function resolveHost(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = String(req.query.host ?? "").trim();
    if (!raw) throw new AppError("host query parameter is required.", 400);
    const host = toHostname(raw);
    const found = (await resolveIpv4(host)).slice(0, 3);
    const hasAbuseIpDb = Boolean(process.env.ABUSEIPDB_API_KEY);
    const ips = await Promise.all(
      found.map(async (ip) => (hasAbuseIpDb ? await checkAbuseIp(ip) : null) ?? { ip })
    );
    return res.json({ host, ips });
  } catch (err) {
    return next(err);
  }
}

export async function globalSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ emails: [], domains: [], ips: [], cases: [], iocs: [] });

    const [emails, domains, ips, cases, iocs] = await Promise.all([
      prisma.email.findMany({
        where: { ownerId: req.user!.userId, OR: [{ subject: { contains: q, mode: "insensitive" } }, { fromAddress: { contains: q, mode: "insensitive" } }] },
        take: 10,
        select: { id: true, subject: true, fromAddress: true, threatClassification: true },
      }),
      prisma.domain.findMany({ where: { name: { contains: q, mode: "insensitive" } }, take: 10 }),
      prisma.iP.findMany({ where: { address: { contains: q } }, take: 10 }),
      prisma.case.findMany({ where: { ownerId: req.user!.userId, OR: [{ title: { contains: q, mode: "insensitive" } }, { caseNumber: { contains: q, mode: "insensitive" } }] }, take: 10 }),
      prisma.iOC.findMany({ where: { value: { contains: q, mode: "insensitive" }, email: { ownerId: req.user!.userId } }, take: 10 }),
    ]);

    return res.json({ emails, domains, ips, cases, iocs });
  } catch (err) {
    return next(err);
  }
}
