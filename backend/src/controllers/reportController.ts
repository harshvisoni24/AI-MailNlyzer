import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/errorHandler";
import { recordAudit } from "../services/auditService";

const generateSchema = z.object({ caseId: z.string().uuid() });

export async function generateReport(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Authentication required.", 401);
    const { caseId } = generateSchema.parse(req.body);

    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        emails: { include: { headers: true, auth: true, urls: true, attachments: true, iocs: true } },
        evidence: { include: { custodyEvents: true } },
        campaigns: { include: { campaign: true } },
        assignedTo: true,
      },
    });
    if (!caseData) throw new AppError("Case not found.", 404);

    const content = {
      executiveSummary: `Case ${caseData.caseNumber} — ${caseData.title}. Severity: ${caseData.severity}. Status: ${caseData.status}. ${caseData.emails.length} email(s) analyzed, ${caseData.evidence.length} evidence item(s) preserved.`,
      caseInformation: {
        caseNumber: caseData.caseNumber,
        title: caseData.title,
        severity: caseData.severity,
        status: caseData.status,
        assignedAnalyst: caseData.assignedTo?.fullName ?? "Unassigned",
        createdAt: caseData.createdAt,
      },
      emails: caseData.emails.map((e: any) => ({
        id: e.id,
        subject: e.subject,
        from: e.fromAddress,
        classification: e.threatClassification,
        threatScore: e.threatScore,
        scoreFactors: e.scoreFactors,
        aiAssessment: e.aiExplanation,
        authentication: e.auth,
        headerCount: e.headers.length,
        urls: e.urls.map((u: any) => u.rawUrl),
        attachments: e.attachments.map((a: any) => ({ filename: a.filename, sha256: a.sha256 })),
        iocs: e.iocs.map((i: any) => ({ type: i.type, value: i.value })),
        attackStory: e.attackStory,
      })),
      campaignCorrelation: caseData.campaigns.map((c: any) => ({ name: c.campaign.name, confidence: c.campaign.confidenceScore })),
      evidence: caseData.evidence.map((ev: any) => ({
        id: ev.id,
        type: ev.evidenceType,
        sha256: ev.sha256,
        integrityStatus: ev.integrityStatus,
        acquiredAt: ev.acquiredAt,
      })),
      chainOfCustody: caseData.evidence.flatMap((ev: any) => ev.custodyEvents),
      findings: caseData.emails.flatMap((e: any) => (e.aiExplanation as any)?.observedFacts ?? []),
      confidenceAssessment:
        "Findings combine deterministic header/authentication analysis with AI-assisted classification. Confidence varies per indicator; see individual email assessments.",
      recommendedActions: [
        "Preserve original email and headers as evidence.",
        "Review and, where warranted, block malicious domains/URLs at the mail gateway.",
        "Notify affected users if credential harvesting or BEC indicators are present.",
        "Continue investigation of related infrastructure and campaign membership.",
      ],
      privacyHandling:
        "This report may contain personally identifiable information. Handle according to organizational data protection and retention policy.",
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.email,
    };

    const report = await prisma.forensicReport.create({
      data: { caseId, generatedById: req.user.userId, content: content as object },
    });

    await recordAudit({ userId: req.user.userId, action: "REPORT_GENERATED", targetType: "ForensicReport", targetId: report.id, status: "SUCCESS" });

    return res.status(201).json(report);
  } catch (err) {
    return next(err);
  }
}

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const where = req.query.caseId ? { caseId: String(req.query.caseId) } : {};
    const reports = await prisma.forensicReport.findMany({ where, orderBy: { createdAt: "desc" } });
    return res.json(reports);
  } catch (err) {
    return next(err);
  }
}

export async function getReport(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await prisma.forensicReport.findUnique({ where: { id: req.params.id } });
    if (!report) throw new AppError("Report not found.", 404);
    return res.json(report);
  } catch (err) {
    return next(err);
  }
}

export async function getReportPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await prisma.forensicReport.findUnique({ where: { id: req.params.id } });
    if (!report) throw new AppError("Report not found.", 404);
    const content = report.content as any;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="forensic-report-${report.id}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).text("AI-MailNlyzer — Forensic Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).fillColor("gray").text(`Generated: ${content.generatedAt} by ${content.generatedBy}`);
    doc.moveDown();

    doc.fillColor("black").fontSize(14).text("1. Executive Summary");
    doc.fontSize(10).text(content.executiveSummary);
    doc.moveDown();

    doc.fontSize(14).text("2. Case Information");
    doc.fontSize(10).text(JSON.stringify(content.caseInformation, null, 2));
    doc.moveDown();

    doc.fontSize(14).text("3. Email Findings");
    (content.emails ?? []).forEach((e: any, idx: number) => {
      doc.fontSize(11).text(`Email ${idx + 1}: ${e.subject}`);
      doc.fontSize(9).text(`From: ${e.from} | Classification: ${e.classification} | Score: ${e.threatScore}/100`);
      doc.moveDown(0.5);
    });
    doc.moveDown();

    doc.fontSize(14).text("4. Evidence & Chain of Custody");
    doc.fontSize(9).text(JSON.stringify(content.evidence, null, 2));
    doc.moveDown();

    doc.fontSize(14).text("5. Recommended Actions");
    (content.recommendedActions ?? []).forEach((a: string) => doc.fontSize(10).text(`• ${a}`));
    doc.moveDown();

    doc.fontSize(8).fillColor("gray").text(content.privacyHandling);

    doc.end();
  } catch (err) {
    return next(err);
  }
}
