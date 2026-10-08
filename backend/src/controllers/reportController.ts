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

    const caseData = await prisma.case.findFirst({
      where: { id: caseId, ownerId: req.user.userId },
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
    const where = {
      case: { ownerId: req.user!.userId },
      ...(req.query.caseId ? { caseId: String(req.query.caseId) } : {}),
    };
    const reports = await prisma.forensicReport.findMany({ where, orderBy: { createdAt: "desc" } });
    return res.json(reports);
  } catch (err) {
    return next(err);
  }
}

export async function getReport(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await prisma.forensicReport.findFirst({ where: { id: req.params.id, case: { ownerId: req.user!.userId } } });
    if (!report) throw new AppError("Report not found.", 404);
    return res.json(report);
  } catch (err) {
    return next(err);
  }
}

const PAGE_L = 50;
const PAGE_W = 495;
const NAVY = "#1f2a44";
const GREY = "#555555";
const LINE = "#c8ccd4";
const HEAD_BG = "#eef1f6";

function fmtDate(d: any) {
  return d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "-";
}

function needSpace(doc: any, h: number) {
  if (doc.y + h > doc.page.height - 70) doc.addPage();
}

function sectionHeading(doc: any, text: string) {
  needSpace(doc, 60);
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(NAVY).text(text, PAGE_L, doc.y, { width: PAGE_W });
  const y = doc.y + 2;
  doc.moveTo(PAGE_L, y).lineTo(PAGE_L + PAGE_W, y).strokeColor(NAVY).lineWidth(1).stroke();
  doc.y = y + 8;
  doc.font("Helvetica").fontSize(10).fillColor("black");
}

function paragraph(doc: any, text: string) {
  doc.font("Helvetica").fontSize(10).fillColor("black").text(text, PAGE_L, doc.y, { width: PAGE_W, align: "justify" });
  doc.moveDown(0.5);
}

function drawTable(doc: any, headers: string[], widths: number[], rows: string[][]) {
  const pad = 5;
  const drawRow = (cells: string[], bold: boolean, fill?: string) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    const h = Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: widths[i] - pad * 2 }))) + pad * 2;
    needSpace(doc, h);
    const y = doc.y;
    let x = PAGE_L;
    cells.forEach((c, i) => {
      doc.lineWidth(0.5);
      if (fill) doc.rect(x, y, widths[i], h).fillAndStroke(fill, LINE);
      else doc.rect(x, y, widths[i], h).strokeColor(LINE).stroke();
      doc.fillColor("black").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
        .text(c, x + pad, y + pad, { width: widths[i] - pad * 2 });
      x += widths[i];
    });
    doc.y = y + h;
  };
  drawRow(headers, true, HEAD_BG);
  rows.forEach((r) => drawRow(r, false));
  doc.moveDown(0.5);
}

export async function getReportPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await prisma.forensicReport.findFirst({ where: { id: req.params.id, case: { ownerId: req.user!.userId } } });
    if (!report) throw new AppError("Report not found.", 404);
    const content = report.content as any;
    const ci = content.caseInformation ?? {};

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="forensic-report-${report.id}.pdf"`);

    const doc: any = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
      info: { Title: `Forensic Report ${ci.caseNumber ?? ""}`, Author: "AI-MailNlyzer" },
    });
    doc.pipe(res);

    // ---------- Cover page ----------
    doc.rect(0, 0, 595.28, 120).fill(NAVY);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(22).text("AI-MailNlyzer", PAGE_L, 42, { width: PAGE_W });
    doc.font("Helvetica").fontSize(11).text("Email Threat Detection & Forensics Platform", PAGE_L, 74, { width: PAGE_W });

    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(24)
      .text("FORENSIC INVESTIGATION REPORT", PAGE_L, 200, { width: PAGE_W, align: "center" });
    doc.moveDown(0.8);
    doc.font("Helvetica").fontSize(13).fillColor(GREY)
      .text(String(ci.title ?? ""), PAGE_L, doc.y, { width: PAGE_W, align: "center" });
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#b91c1c")
      .text("CONFIDENTIAL", PAGE_L, doc.y, { width: PAGE_W, align: "center" });

    doc.y = 360;
    drawTable(doc, ["Field", "Details"], [150, 345], [
      ["Case Number", String(ci.caseNumber ?? "-")],
      ["Severity", String(ci.severity ?? "-")],
      ["Status", String(ci.status ?? "-")],
      ["Assigned Analyst", String(ci.assignedAnalyst ?? "-")],
      ["Report ID", report.id],
      ["Generated On", fmtDate(content.generatedAt)],
      ["Generated By", String(content.generatedBy ?? "-")],
    ]);

    // ---------- Body ----------
    doc.addPage();

    sectionHeading(doc, "1. Executive Summary");
    paragraph(doc, String(content.executiveSummary ?? "-"));

    sectionHeading(doc, "2. Case Information");
    drawTable(doc, ["Field", "Details"], [150, 345], [
      ["Case Number", String(ci.caseNumber ?? "-")],
      ["Title", String(ci.title ?? "-")],
      ["Severity", String(ci.severity ?? "-")],
      ["Status", String(ci.status ?? "-")],
      ["Assigned Analyst", String(ci.assignedAnalyst ?? "-")],
      ["Case Opened", fmtDate(ci.createdAt)],
    ]);

    sectionHeading(doc, "3. Email Findings");
    const emails = content.emails ?? [];
    if (emails.length === 0) {
      paragraph(doc, "No emails are attached to this case.");
    } else {
      drawTable(
        doc,
        ["#", "Subject", "From", "Classification", "Score"],
        [25, 150, 150, 95, 75],
        emails.map((e: any, i: number) => [
          String(i + 1),
          String(e.subject ?? "-"),
          String(e.from ?? "-"),
          String(e.classification ?? "-"),
          `${e.threatScore ?? 0}/100`,
        ])
      );
    }

    sectionHeading(doc, "4. Key Findings");
    const findings = (content.findings ?? []).slice(0, 15);
    if (findings.length === 0) {
      paragraph(doc, "No key findings were recorded.");
    } else {
      findings.forEach((f: any, i: number) => {
        const t = typeof f === "string" ? f : JSON.stringify(f);
        doc.font("Helvetica").fontSize(10).fillColor("black").text(`${i + 1}. ${t}`, PAGE_L, doc.y, { width: PAGE_W });
        doc.moveDown(0.3);
      });
    }

    sectionHeading(doc, "5. Evidence Register");
    const evidence = content.evidence ?? [];
    if (evidence.length === 0) {
      paragraph(doc, "No evidence items were preserved for this case.");
    } else {
      drawTable(
        doc,
        ["Type", "SHA-256", "Integrity", "Acquired"],
        [60, 235, 80, 120],
        evidence.map((ev: any) => {
          const h = String(ev.sha256 ?? "-");
          return [String(ev.type ?? "-"), h.slice(0, 32) + "\n" + h.slice(32), String(ev.integrityStatus ?? "-"), fmtDate(ev.acquiredAt)];
        })
      );
    }

    sectionHeading(doc, "6. Confidence Assessment");
    paragraph(doc, String(content.confidenceAssessment ?? "-"));

    sectionHeading(doc, "7. Recommended Actions");
    (content.recommendedActions ?? []).forEach((a: string, i: number) => {
      doc.font("Helvetica").fontSize(10).fillColor("black").text(`${i + 1}. ${a}`, PAGE_L, doc.y, { width: PAGE_W });
      doc.moveDown(0.3);
    });

    sectionHeading(doc, "8. Sign-off");
    drawTable(doc, ["Role", "Name", "Signature", "Date"], [110, 150, 135, 100], [
      ["Prepared by", String(content.generatedBy ?? "-"), "\n\n", fmtDate(content.generatedAt).slice(0, 10)],
      ["Reviewed by", "\n\n", "\n\n", "\n\n"],
    ]);

    doc.moveDown(0.5);
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(GREY)
      .text(String(content.privacyHandling ?? ""), PAGE_L, doc.y, { width: PAGE_W });

    // ---------- Footer with page numbers (skip cover) ----------
    const range = doc.bufferedPageRange();
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.moveTo(PAGE_L, 790).lineTo(PAGE_L + PAGE_W, 790).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(8).fillColor(GREY);
      doc.text("AI-MailNlyzer - Confidential Forensic Report", PAGE_L, 798, { width: PAGE_W / 2, align: "left", lineBreak: false });
      doc.text(`Page ${i} of ${range.count - 1}`, PAGE_L + PAGE_W / 2, 798, { width: PAGE_W / 2, align: "right", lineBreak: false });
    }

    doc.end();
  } catch (err) {
    return next(err);
  }
}