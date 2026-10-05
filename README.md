# AI-MailNlyzer

> AI-powered email threat detection and forensic investigation platform.

AI-MailNlyzer analyzes emails to decide whether they are malicious (phishing, spam, malware-carrying) and explains *why*. It combines a machine-learning classifier with header and authentication forensics, IOC extraction, live threat-intelligence lookups, case management, tamper-evident evidence storage and printable forensic reports, so an analyst gets a verdict and the evidence behind it in one place.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Key Features](#2-key-features)
3. [System Architecture](#3-system-architecture)
4. [Machine Learning Model](#4-machine-learning-model)
5. [Tech Stack](#5-tech-stack)
6. [Project Structure](#6-project-structure)
7. [Installation and Setup](#7-installation-and-setup)
8. [Environment Variables](#8-environment-variables)
9. [Running the Project](#9-running-the-project)
10. [Application Pages](#10-application-pages)
11. [Threat Intelligence](#11-threat-intelligence)
12. [Evidence Vault](#12-evidence-vault)
13. [Forensic Report (PDF)](#13-forensic-report-pdf)
14. [Demo Data](#14-demo-data)
15. [Security Notes](#15-security-notes)
16. [Performance Summary](#16-performance-summary)
17. [Future Scope](#17-future-scope)

---

## 1. Problem Statement

Phishing and malicious emails are a primary attack vector. Manual inspection is slow, and simple rule-based filters miss new patterns. The goal is a system that:

- Detects malicious emails with high accuracy and a low false-positive rate.
- Extracts forensic evidence (URLs, attachments, headers, IOCs) from each email.
- Checks suspicious IPs and domains against real threat-intelligence providers.
- Preserves evidence so it can be shown to be unmodified.
- Presents a clear, explainable report to the analyst.

## 2. Key Features

**Detection and analysis**
- ML-based classification of emails (malicious vs. legitimate) using an XGBoost model.
- Rule engine combined with the ML score for a final risk score and label.
- Text (TF-IDF), URL and attachment features.
- Header and email-authentication analysis.
- IOC extraction (URLs, domains, IPs, attachment hashes).
- AI-assisted explanations and an attack story for each email (Gemini).
- AI Copilot page for asking questions about an investigation (RAG with pgvector).

**Investigation workflow**
- Upload `.eml` files and review each analysis on the email detail page.
- Case management: group emails and evidence into cases with severity, status and an assigned analyst.
- Campaign detection: emails sharing infrastructure (URLs, relay IPs) are correlated into campaigns.
- Threat graph view of related indicators.
- Alerts, dashboard and an audit log of user actions.
- Role-based access with JWT login and an admin user-management page.

**Threat intelligence (live)**
- IP lookup through AbuseIPDB: verdict, score, country and ISP.
- Domain lookup through VirusTotal: verdict and score.
- Results are saved, and the Known IPs and Known Domains lists update after each lookup.

**Evidence and reporting**
- Evidence Vault with SHA-256 hashing, chain of custody and a hash-chain integrity ledger.
- Forensic report generated as a formatted PDF (cover page, tables, numbered sections, page numbers and a sign-off block).

## 3. System Architecture

```
                 Browser (React + Vite, port 5173)
                              │
                              ▼
              Backend API (Node / Express, port 5000)
          auth · cases · emails · evidence · reports · intel
                 │                    │                │
                 ▼                    ▼                ▼
        PostgreSQL (Prisma)     AI Service        External providers
        cases, emails, IOCs,    (FastAPI,         AbuseIPDB (IPs)
        IPs, domains,           port 8000)        VirusTotal (domains)
        evidence ledger,        XGBoost + rules
        audit log               Gemini + RAG
```

**Email analysis flow**

```
Email input (.eml)
        │
        ▼
 Parsing and preprocessing  (headers, body, URLs, attachments)
        │
        ▼
 Feature extraction  (TF-IDF text + URL features + attachment features)
        │
        ▼
 XGBoost classifier + rule engine  → probability / risk score
        │
        ▼
 Forensic layer  (header and authentication analysis, IOC extraction, labels)
        │
        ▼
 Stored in PostgreSQL → shown in the web UI → exportable as a PDF report
```

## 4. Machine Learning Model

| Item | Detail |
|---|---|
| Algorithm | XGBoost classifier |
| Text features | TF-IDF |
| Other features | URL features, attachment features |
| Dataset | MeAJOR corpus |
| Total samples | 104,933 |
| Train / Val / Test | 78,701 / 10,493 / 15,739 |

**Held-out test results**

| Metric | Value |
|---|---|
| Precision | 0.9797 |
| Recall | 0.9798 |
| F1-score | 0.9797 |
| False Positive Rate | 1.66% |
| ML step latency (p95) | 3.4 ms |

Results are produced by `ai-service/scripts/evaluate_test.py`. Training scripts are in `ai-service/scripts/`.

## 5. Tech Stack

| Part | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript, Prisma ORM, Zod, PDFKit |
| Database | PostgreSQL (pgvector for RAG) |
| AI service | Python, FastAPI, XGBoost, scikit-learn, pandas, NumPy |
| LLM | Google Gemini (explanations and Copilot) |
| Threat intelligence | AbuseIPDB, VirusTotal |
| Auth | JWT |

## 6. Project Structure

```
ai-mailnlyzer/
├── frontend/                 # React web app
│   └── src/
│       ├── pages/            # Dashboard, Emails, Cases, Campaigns,
│       │                     # Threat Intelligence, Evidence Vault, Reports...
│       ├── components/
│       ├── contexts/         # Auth context
│       └── lib/api.ts        # API client
├── backend/                  # Express API
│   ├── prisma/               # schema.prisma, migrations, seed.ts
│   ├── src/
│   │   ├── controllers/      # one controller per feature
│   │   ├── routes/
│   │   ├── services/         # email parser, header forensics, audit, AI client
│   │   ├── middleware/       # auth, upload, error handler
│   │   └── config/
│   └── storage/uploads/      # uploaded emails (not tracked by git)
├── ai-service/               # FastAPI service
│   ├── app/
│   │   ├── api/              # analyze, copilot
│   │   ├── ml/               # ML classifier and rule engine
│   │   ├── rag/              # retrieval for the Copilot
│   │   └── services/         # Gemini service
│   ├── scripts/              # dataset prep, training, evaluation
│   └── requirements.txt
├── demo-data/                # sample .eml files
├── docs/                     # PGVECTOR.md, REMOTE_POSTGRESQL.md, ML results
├── scripts/setup.sh
└── README.md
```

## 7. Installation and Setup

**Requirements:** Node.js, Python 3, PostgreSQL (with the pgvector extension if you use the Copilot), and Git.

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd ai-mailnlyzer

# 2. Backend
cd backend
npm install
cp .env.example .env          # then fill in the values (see section 8)
npx prisma migrate deploy     # create the database tables
npx prisma db seed            # create the first admin account
cd ..

# 3. Frontend
cd frontend
npm install
cp .env.example .env
cd ..

# 4. AI service
cd ai-service
python -m venv venv
venv\Scripts\activate         # Windows
# source venv/bin/activate    # Linux / macOS
pip install -r requirements.txt
cp .env.example .env
cd ..
```

On Windows, use `copy` instead of `cp`.

Remote database setup and pgvector are explained in `docs/REMOTE_POSTGRESQL.md` and `docs/PGVECTOR.md`.

## 8. Environment Variables

Each service has a `.env.example` file. Copy it to `.env` and fill in real values. **Real `.env` files are ignored by git and must never be committed.**

**`backend/.env`**

| Variable | Purpose |
|---|---|
| `PORT` | Backend port (default 5000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Signing key and lifetime for login tokens |
| `AI_SERVICE_URL` | URL of the AI service (default `http://localhost:8000`) |
| `AI_SERVICE_API_KEY` | Shared secret; must match the AI service |
| `CORS_ORIGIN` | Frontend origin (default `http://localhost:5173`) |
| `MAX_UPLOAD_MB`, `RETENTION_DEFAULT_DAYS` | Upload size limit and retention period |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | First admin account created by the seed |
| `VIRUSTOTAL_API_KEY` | Enables domain lookups |
| `ABUSEIPDB_API_KEY` | Enables IP lookups |

**`ai-service/.env`**

| Variable | Purpose |
|---|---|
| `AI_SERVICE_PORT` | AI service port (default 8000) |
| `AI_SERVICE_API_KEY` | Must match the backend value |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Google Gemini access and model name |
| `DATABASE_URL` | Same PostgreSQL database, used for RAG |

**`frontend/.env`**

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend API URL (default `http://localhost:5000/api`) |

Never put secret keys in the frontend `.env`. It is bundled into the browser code.

## 9. Running the Project

Open three terminals, one for each service.

```bash
# Terminal 1: AI service
cd ai-service
uvicorn app.main:app --reload --port 8000

# Terminal 2: Backend
cd backend
npm run dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

Then open `http://localhost:5173` and sign in with the admin account created by the seed.

After changing a `.env` file, stop the service completely and start it again. A running service does not reload `.env`.

To evaluate the ML model on the held-out test set:

```bash
cd ai-service
python scripts/evaluate_test.py
```

## 10. Application Pages

| Page | What it does |
|---|---|
| Dashboard | Overview of emails, threats and alerts |
| Upload Email | Upload a `.eml` file for analysis |
| Emails and Email Detail | List of analyzed emails, with score, label, headers, authentication, URLs, attachments and IOCs |
| Cases | Group emails and evidence into investigations |
| Campaigns | Emails correlated by shared infrastructure indicators |
| Threat Graph | Visual map of related indicators |
| Threat Intelligence | Look up an IP or domain and see the known lists |
| Evidence Vault | Preserved evidence, chain of custody and integrity check |
| Reports | Generate and download forensic reports |
| Copilot | Ask questions about an investigation |
| Alerts, Audit Log | Notifications and a record of user actions |
| Admin Users, Settings | User management and preferences |

## 11. Threat Intelligence

Open the **Threat Intelligence** page, enter an IP address or a domain, and click **Lookup**.

| Input | Provider | Result shown |
|---|---|---|
| IP address | AbuseIPDB | verdict, abuse score, country, ISP |
| Domain | VirusTotal | verdict, number of engines flagging it |

**Verdict rules**

| Type | Clean | Suspicious | Malicious |
|---|---|---|---|
| IP (abuse score) | 0 | 1 to 49 | 50 or more |
| Domain (engines flagging) | 0 to 2 | 3 to 4 | 5 or more |

The domain thresholds avoid labelling well-known safe sites as malicious because of one or two false positives. They can be changed in `backend/src/controllers/intelController.ts`.

**Behavior**
- Every successful lookup is saved to the database. The **Known IPs** and **Known Domains** lists update right away. IPs also store their country and ISP.
- Without any API key, the page runs in a clearly labelled demo mode and returns a simulated result.
- If a provider rejects the request (for example a wrong key or a daily limit), the page shows an error and nothing is saved.
- Free API keys have daily limits.

## 12. Evidence Vault

The Evidence Vault proves that evidence was not changed after it was saved.

1. When an email is added as evidence, its **SHA-256 hash** is calculated.
2. Each hash becomes an entry in a **hash-chain ledger**. Every entry includes the hash of the entry before it.
3. If an old entry is edited, the chain breaks.
4. **Verify Integrity Ledger** re-checks the whole chain.
5. The **Chain of Custody** panel lists each action on an item with its time.

This is a development integrity ledger (a hash-chain), not a decentralized blockchain.

## 13. Forensic Report (PDF)

From the **Reports** page, generate a report for a case and download it as a PDF. The PDF is built from the saved report data each time, so improvements to the layout also apply to older reports.

The report contains:
- Cover page with case number, severity, status, analyst, report ID and a CONFIDENTIAL label.
- 1. Executive Summary
- 2. Case Information
- 3. Email Findings (table)
- 4. Key Findings
- 5. Evidence Register (table with SHA-256 and integrity status)
- 6. Confidence Assessment
- 7. Recommended Actions
- 8. Sign-off block (prepared by and reviewed by)
- A page number and footer on every page, and a privacy-handling note.

## 14. Demo Data

Sample emails are in `demo-data/`:

| File | Scenario |
|---|---|
| `demo-1-microsoft-phishing.eml` | Microsoft-themed phishing |
| `demo-2-bec-invoice.eml` | Business email compromise (invoice) |
| `demo-3-credential-harvest.eml` | Credential harvesting |
| `demo-4-suspicious-attachment.eml` | Suspicious attachment |
| `demo-5-legitimate.eml` | Legitimate email |

Upload them on the **Upload Email** page to try the system.

## 15. Security Notes

- Real `.env` files are listed in `.gitignore` and are not uploaded. Only `.env.example` files with placeholders are tracked.
- If an API key is ever committed by mistake, delete it at the provider and create a new one. Removing it from the file is not enough, because it stays in the git history.
- Generate a long random `JWT_SECRET` for any real deployment, and change the seed admin password.
- Reports may contain personal data. Handle them according to your data protection and retention policy.

## 16. Performance Summary

- F1-score of about **0.98** on 15,739 unseen test emails
- False positive rate of **1.66%**
- ML inference p95 of **3.4 ms**

## 17. Future Scope

- Sandbox analysis of attachments
- More threat-intelligence data for domains (registrar, creation date) and a verdict column in the Known lists
- Filtering of well-known safe domains from campaign detection
- Mail-server and mailbox integration for real-time scanning
- Explainability (feature importance per email)
