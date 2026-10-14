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
const PAGE_H = 841.89;
const NAVY = "#0b1f3a";
const BLUE = "#1f4e79";
const GREY = "#5a6573";
const LINE = "#c9d2dd";
const LIGHT = "#eef2f7";
const INK = "#1b2430";
const SOFT = "#9db4ce";
const RED = "#b3261e";
const AMBER = "#c77700";
const GREEN = "#1e7b4a";

function fmtDate(d: any) {
  return d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "-";
}

function toneColor(v: any): string | undefined {
  const t = String(v ?? "").toUpperCase();
  if (["CRITICAL", "HIGH", "MALICIOUS", "PHISHING", "FAIL", "FAILED"].includes(t)) return RED;
  if (["MEDIUM", "SUSPICIOUS", "SOFTFAIL", "NEUTRAL"].includes(t)) return AMBER;
  if (["LOW", "LEGITIMATE", "PASS", "VERIFIED", "SAFE"].includes(t)) return GREEN;
  return undefined;
}

function needSpace(doc: any, h: number) {
  if (doc.y + h > doc.page.height - 70) doc.addPage();
}

function sectionHeading(doc: any, text: string) {
  needSpace(doc, 70);
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(NAVY).text(text, PAGE_L, doc.y, { width: PAGE_W });
  const y = doc.y + 3;
  doc.moveTo(PAGE_L, y).lineTo(PAGE_L + PAGE_W, y).strokeColor(BLUE).lineWidth(1).stroke();
  doc.y = y + 10;
  doc.font("Helvetica").fontSize(10).fillColor(INK);
}

function subHeading(doc: any, text: string) {
  needSpace(doc, 40);
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(BLUE).text(text, PAGE_L, doc.y, { width: PAGE_W });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10).fillColor(INK);
}

function paragraph(doc: any, text: string) {
  doc.font("Helvetica").fontSize(10).fillColor(INK).text(text, PAGE_L, doc.y, { width: PAGE_W, lineGap: 2 });
  doc.moveDown(0.6);
}

function listItems(doc: any, items: string[], numbered: boolean) {
  items.forEach((t, i) => {
    doc.font("Helvetica").fontSize(10).fillColor(INK)
      .text(`${numbered ? i + 1 + "." : "-"} ${t}`, PAGE_L, doc.y, { width: PAGE_W, lineGap: 2 });
    doc.moveDown(0.3);
  });
  doc.moveDown(0.3);
}

function statStrip(doc: any, items: { label: string; value: string; color?: string }[]) {
  needSpace(doc, 60);
  const y = doc.y;
  const h = 46;
  const w = PAGE_W / items.length;
  doc.rect(PAGE_L, y, PAGE_W, h).fillAndStroke(LIGHT, LINE);
  items.forEach((it, i) => {
    const x = PAGE_L + i * w;
    if (i > 0) doc.moveTo(x, y).lineTo(x, y + h).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.fillColor(GREY).font("Helvetica-Bold").fontSize(7)
      .text(it.label, x + 10, y + 9, { width: w - 14, lineBreak: false });
    doc.fillColor(it.color ?? NAVY).font("Helvetica-Bold").fontSize(14)
      .text(it.value, x + 10, y + 21, { width: w - 14, lineBreak: false });
  });
  doc.y = y + h + 12;
}

function drawTable(
  doc: any,
  headers: string[],
  widths: number[],
  rows: string[][],
  opts: { kv?: boolean; tone?: number[]; mono?: number[] } = {}
) {
  const pad = 6;
  const limit = doc.page.height - 70;

  const style = (mode: "head" | "body", i: number, text: string) => {
    if (mode === "head") return { font: "Helvetica-Bold", size: 9, color: "#ffffff" };
    if (opts.mono?.includes(i)) return { font: "Courier", size: 8, color: INK };
    const tone = opts.tone?.includes(i) ? toneColor(text) : undefined;
    if (tone) return { font: "Helvetica-Bold", size: 9, color: tone };
    if (opts.kv && i === 0) return { font: "Helvetica-Bold", size: 9, color: NAVY };
    return { font: "Helvetica", size: 9, color: INK };
  };

  const drawRow = (cells: string[], mode: "head" | "body") => {
    const heights = cells.map((c, i) => {
      const s = style(mode, i, c);
      doc.font(s.font).fontSize(s.size);
      return doc.heightOfString(c, { width: widths[i] - pad * 2 });
    });
    const h = Math.max(...heights) + pad * 2;
    if (doc.y + h > limit) {
      doc.addPage();
      if (mode === "body") drawRow(headers, "head");
    }
    const y = doc.y;
    let x = PAGE_L;
    cells.forEach((c, i) => {
      const s = style(mode, i, c);
      doc.lineWidth(0.5);
      if (mode === "head") doc.rect(x, y, widths[i], h).fillAndStroke(NAVY, NAVY);
      else if (opts.kv && i === 0) doc.rect(x, y, widths[i], h).fillAndStroke(LIGHT, LINE);
      else doc.rect(x, y, widths[i], h).fillAndStroke("#ffffff", LINE);
      doc.fillColor(s.color).font(s.font).fontSize(s.size)
        .text(c, x + pad, y + pad, { width: widths[i] - pad * 2 });
      x += widths[i];
    });
    doc.y = y + h;
  };

  if (!opts.kv) drawRow(headers, "head");
  rows.forEach((r) => drawRow(r, "body"));
  doc.moveDown(0.8);
}

export async function getReportPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await prisma.forensicReport.findFirst({ where: { id: req.params.id, case: { ownerId: req.user!.userId } } });
    if (!report) throw new AppError("Report not found.", 404);
    const content = report.content as any;
    const ci = content.caseInformation ?? {};
    const emails: any[] = content.emails ?? [];
    const evidence: any[] = content.evidence ?? [];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="forensic-report-${report.id}.pdf"`);

    const doc: any = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
      info: { Title: `Forensic Report ${ci.caseNumber ?? ""}`, Author: "AI-MailNlyzer", Subject: String(ci.title ?? "") },
    });
    doc.pipe(res);

    // ---------- Cover page ----------
    doc.rect(0, 0, 595.28, PAGE_H).fill(NAVY);
    doc.rect(0, 430, 595.28, 3).fill(BLUE);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13)
      .text("AI-MAILNLYZER", PAGE_L, 60, { width: PAGE_W, lineBreak: false });
    doc.fillColor(SOFT).font("Helvetica").fontSize(10)
      .text("Email Threat Detection & Forensics Platform", PAGE_L, 78, { width: PAGE_W, lineBreak: false });
    doc.fillColor(SOFT).font("Helvetica-Bold").fontSize(10)
      .text("DIGITAL FORENSIC INVESTIGATION REPORT", PAGE_L, 230, { width: PAGE_W, lineBreak: false });
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(28)
      .text("Email Forensic Analysis", PAGE_L, 250, { width: PAGE_W, lineBreak: false });
    doc.fillColor("#ffffff").font("Helvetica").fontSize(14)
      .text(String(ci.title ?? ""), PAGE_L, 296, { width: PAGE_W });

    const coverRows: [string, string][] = [
      ["CASE NUMBER", String(ci.caseNumber ?? "-")],
      ["REPORT ID", report.id],
      ["SEVERITY  /  STATUS", `${ci.severity ?? "-"}   |   ${ci.status ?? "-"}`],
      ["DATE GENERATED", fmtDate(content.generatedAt)],
      ["PREPARED BY", String(content.generatedBy ?? "-")],
    ];
    let cy = 465;
    coverRows.forEach(([label, value]) => {
      doc.fillColor(SOFT).font("Helvetica").fontSize(8).text(label, PAGE_L, cy, { width: PAGE_W, lineBreak: false });
      doc.fillColor("#ffffff").font("Helvetica").fontSize(11).text(value, PAGE_L, cy + 12, { width: PAGE_W, lineBreak: false });
      cy += 36;
    });

    doc.rect(PAGE_L, 750, 92, 20).fill(RED);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9)
      .text("CONFIDENTIAL", PAGE_L, 756, { width: 92, align: "center", lineBreak: false });
    doc.fillColor(SOFT).font("Helvetica").fontSize(8)
      .text("Contains potentially sensitive information. Authorized recipients only.", PAGE_L + 102, 756, { width: 380, lineBreak: false });

    // ---------- Document control + contents ----------
    doc.addPage();
    sectionHeading(doc, "Document Control");
    drawTable(doc, ["Field", "Details"], [140, 355], [
      ["Report Title", "Forensic Investigation Report - Email Analysis"],
      ["Report ID", report.id],
      ["Case Number", String(ci.caseNumber ?? "-")],
      ["Version", "1.0"],
      ["Classification", "CONFIDENTIAL"],
      ["Generated On", fmtDate(content.generatedAt)],
      ["Generated By", String(content.generatedBy ?? "-")],
    ], { kv: true });

    subHeading(doc, "Contents");
    drawTable(doc, ["No.", "Section"], [40, 455], [
      ["1", "Executive Summary"],
      ["2", "Case Information"],
      ["3", "Scope and Methodology"],
      ["4", "Email Findings"],
      ["5", "Key Findings and Indicators"],
      ["6", "Evidence Register and Chain of Custody"],
      ["7", "Confidence and Limitations"],
      ["8", "Conclusion and Recommendations"],
      ["9", "Sign-off"],
    ]);

    // ---------- 1. Executive summary ----------
    doc.addPage();
    sectionHeading(doc, "1. Executive Summary");
    paragraph(doc, String(content.executiveSummary ?? "-"));

    const maxScore = Math.max(0, ...emails.map((e: any) => Number(e.threatScore) || 0));
    statStrip(doc, [
      { label: "SEVERITY", value: String(ci.severity ?? "-"), color: toneColor(ci.severity) },
      { label: "STATUS", value: String(ci.status ?? "-"), color: BLUE },
      { label: "EMAILS ANALYZED", value: String(emails.length) },
      { label: "EVIDENCE ITEMS", value: String(evidence.length) },
      { label: "MAX THREAT SCORE", value: `${maxScore} / 100`, color: maxScore >= 70 ? RED : maxScore >= 40 ? AMBER : GREEN },
    ]);

    if (emails.length > 0) {
      subHeading(doc, "Summary of Findings");
      const points = emails.slice(0, 5).map(
        (e: any) =>
          `"${e.subject ?? "-"}" from ${e.from ?? "-"} was classified ${String(e.classification ?? "-")} with a threat score of ${e.threatScore ?? 0}/100.`
      );
      if (emails.length > 5) points.push(`...and ${emails.length - 5} more email(s). See Section 4.`);
      listItems(doc, points, false);
    }

    // ---------- 2. Case information ----------
    sectionHeading(doc, "2. Case Information");
    drawTable(doc, ["Field", "Details"], [140, 355], [
      ["Case Number", String(ci.caseNumber ?? "-")],
      ["Title", String(ci.title ?? "-")],
      ["Severity", String(ci.severity ?? "-")],
      ["Status", String(ci.status ?? "-")],
      ["Assigned Analyst", String(ci.assignedAnalyst ?? "-")],
      ["Case Opened", fmtDate(ci.createdAt)],
      ["Report Generated", fmtDate(content.generatedAt)],
    ], { kv: true });

    // ---------- 3. Scope and methodology ----------
    sectionHeading(doc, "3. Scope and Methodology");
    paragraph(doc, `Scope: ${emails.length} email message(s) and associated headers submitted to the AI-MailNlyzer platform under case ${ci.caseNumber ?? "-"}.`);
    drawTable(doc, ["Stage", "Description"], [110, 385], [
      ["1. Acquisition", "Email acquired and stored as evidence; a SHA-256 digest was computed at acquisition."],
      ["2. Header analysis", "Deterministic inspection of message headers and sender authentication results (SPF, DKIM, DMARC)."],
      ["3. AI classification", "AI-assisted classification producing a verdict and a 0-100 threat score."],
      ["4. Integrity check", "Evidence integrity verified against the recorded SHA-256 digest."],
    ]);

    // ---------- 4. Email findings ----------
    sectionHeading(doc, "4. Email Findings");
    if (emails.length === 0) {
      paragraph(doc, "No emails are attached to this case.");
    } else {
      drawTable(
        doc,
        ["#", "Subject", "From", "Verdict", "Score"],
        [22, 130, 185, 95, 63],
        emails.map((e: any, i: number) => [
          String(i + 1),
          String(e.subject ?? "-"),
          String(e.from ?? "-"),
          String(e.classification ?? "-"),
          `${e.threatScore ?? 0}/100`,
        ]),
        { tone: [3] }
      );
    }

    // ---------- 5. Key findings and indicators ----------
    sectionHeading(doc, "5. Key Findings and Indicators");
    const findingsAll: string[] = (content.findings ?? []).map((f: any) => (typeof f === "string" ? f : JSON.stringify(f)));
    const authRe = /^\s*(SPF|DKIM|DMARC)\s*[=:]\s*(\w+)/i;
    const purpose: Record<string, string> = {
      SPF: "Confirms the sending server is authorized by the sender domain.",
      DKIM: "Confirms the message was signed by the domain and not altered in transit.",
      DMARC: "Confirms SPF/DKIM alignment with the visible From domain per domain policy.",
    };
    const authRows: string[][] = [];
    const otherFindings: string[] = [];
    findingsAll.forEach((f) => {
      const m = authRe.exec(f);
      if (m) authRows.push([m[1].toUpperCase(), m[2].toUpperCase(), purpose[m[1].toUpperCase()]]);
      else otherFindings.push(f);
    });

    if (authRows.length > 0) {
      subHeading(doc, "Authentication Results");
      drawTable(doc, ["Mechanism", "Result", "Purpose"], [80, 70, 345], authRows.slice(0, 12), { tone: [1] });
    }
    if (otherFindings.length > 0) {
      subHeading(doc, "Other Observations");
      listItems(doc, otherFindings.slice(0, 15), true);
    }
    if (authRows.length === 0 && otherFindings.length === 0) {
      paragraph(doc, "No key findings were recorded.");
    }

    const iocRows: string[][] = emails
      .flatMap((e: any) => (e.iocs ?? []).map((i: any) => [String(i.type ?? "-"), String(i.value ?? "-")]))
      .slice(0, 25);
    if (iocRows.length > 0) {
      subHeading(doc, "Indicators of Compromise");
      drawTable(doc, ["Type", "Value"], [110, 385], iocRows);
    }

    // ---------- 6. Evidence register and chain of custody ----------
    sectionHeading(doc, "6. Evidence Register and Chain of Custody");
    const evId = (i: number) => `EV-${String(i + 1).padStart(3, "0")}`;
    if (evidence.length === 0) {
      paragraph(doc, "No evidence items were preserved for this case.");
    } else {
      drawTable(
        doc,
        ["ID", "Type", "SHA-256", "Integrity", "Acquired"],
        [48, 48, 185, 74, 140],
        evidence.map((ev: any, i: number) => {
          const h = String(ev.sha256 ?? "-");
          return [evId(i), String(ev.type ?? "-"), h.slice(0, 32) + "\n" + h.slice(32), String(ev.integrityStatus ?? "-"), fmtDate(ev.acquiredAt)];
        }),
        { tone: [3], mono: [2] }
      );
      const hashes = evidence.map((ev: any) => ev.sha256);
      if (hashes.some((h: any, i: number) => hashes.indexOf(h) !== i)) {
        paragraph(doc, "Note: some evidence items share an identical SHA-256 digest, indicating the same content was acquired more than once. No content difference was detected between those acquisitions.");
      }

      subHeading(doc, "Chain of Custody");
      const custody: string[][] = evidence.map((ev: any, i: number) => [
        fmtDate(ev.acquiredAt),
        `Evidence acquired and hashed (${ev.type ?? "-"})`,
        evId(i),
      ]);
      custody.push([fmtDate(content.generatedAt), "Forensic report generated", "-"]);
      drawTable(doc, ["Date / Time", "Event", "Reference"], [135, 270, 90], custody);
    }

    // ---------- 7. Confidence and limitations ----------
    sectionHeading(doc, "7. Confidence and Limitations");
    paragraph(doc, String(content.confidenceAssessment ?? "-"));
    paragraph(doc, "AI-assisted verdicts are probabilistic and should be corroborated by an analyst before action is taken. This report covers only the emails and evidence listed above; findings may change if further material is added to the case.");

    // ---------- 8. Conclusion and recommendations ----------
    sectionHeading(doc, "8. Conclusion and Recommendations");
    paragraph(doc, `Case ${ci.caseNumber ?? "-"} is rated ${ci.severity ?? "-"} severity and is currently ${ci.status ?? "-"}. Recommended actions:`);
    drawTable(
      doc,
      ["#", "Recommended Action"],
      [30, 465],
      (content.recommendedActions ?? []).map((a: string, i: number) => [String(i + 1), String(a)])
    );

    // ---------- 9. Sign-off ----------
    needSpace(doc, 230);
    sectionHeading(doc, "9. Sign-off");
    drawTable(doc, ["Role", "Name", "Signature", "Date"], [90, 170, 145, 90], [
      ["Prepared by", String(content.generatedBy ?? "-"), "\n\n", fmtDate(content.generatedAt).slice(0, 10)],
      ["Reviewed by", "\n\n", "\n\n", "\n\n"],
      ["Approved by", "\n\n", "\n\n", "\n\n"],
    ]);
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(GREY)
      .text(String(content.privacyHandling ?? ""), PAGE_L, doc.y, { width: PAGE_W });

    // ---------- Header + footer on every page except the cover ----------
    const range = doc.bufferedPageRange();
    const total = range.count - 1;
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.rect(0, 0, 595.28, 26).fill(NAVY);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5)
        .text("AI-MAILNLYZER  |  FORENSIC INVESTIGATION REPORT", PAGE_L, 9, { width: 245, lineBreak: false });
      doc.text(`CONFIDENTIAL  -  ${ci.caseNumber ?? ""}`, PAGE_L + 245, 9, { width: 250, align: "right", lineBreak: false });

      doc.moveTo(PAGE_L, 790).lineTo(PAGE_L + PAGE_W, 790).strokeColor(LINE).lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor(GREY);
      doc.text(`Report ID: ${report.id}`, PAGE_L, 797, { width: 340, align: "left", lineBreak: false });
      doc.text(`Page ${i} of ${total}`, PAGE_L + 340, 797, { width: PAGE_W - 340, align: "right", lineBreak: false });
      doc.text("Handle in accordance with organizational data protection and retention policy.", PAGE_L, 810, { width: PAGE_W, align: "center", lineBreak: false });
    }

    doc.end();
  } catch (err) {
    return next(err);
  }
}