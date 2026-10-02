# AI-MailNlyzer

> AI-powered email threat detection and forensic analysis platform.
---

## 1. Overview

AI-MailNlyzer analyzes emails to decide whether they are malicious (phishing / spam / malware-carrying) and explains *why*. It combines a machine-learning classifier with forensic extraction of Indicators of Compromise (IOCs), so an analyst gets both a verdict and the evidence behind it, in a few milliseconds per email.

## 2. Problem Statement

Phishing and malicious emails are a primary attack vector. Manual inspection is slow, and simple rule-based filters miss new patterns. The goal is a system that:

- Detects malicious emails with high accuracy and a low false-positive rate.
- Extracts forensic evidence (URLs, attachments, headers, IOCs) from each email.
- Presents a clear, explainable analysis report to the user.

## 3. Key Features

- **ML-based threat classification** of emails (malicious vs. legitimate).
- **Text analysis** of subject/body using TF-IDF features.
- **URL features** (suspicious links, structure of URLs).
- **Attachment features** (risky file types, attachment indicators).
- **IOC extraction and listing** (URLs, domains, IPs, attachment info, etc.).
- **Risk scoring and labels** for each analyzed email.
- **Email analysis page** showing date, IOC list, score, label, and details.
- **Fast inference**: ML step p95 latency of about 3.4 ms.

## 4. System Architecture

```
Email input (.eml / raw email)
        │
        ▼
 Parsing & preprocessing  (headers, body, URLs, attachments)
        │
        ▼
 Feature extraction  (TF-IDF text + URL features + attachment features)
        │
        ▼
 XGBoost classifier  → probability / risk score
        │
        ▼
 Forensic layer  (IOC extraction, scoring, labels)
        │
        ▼
 Analysis report / web UI
```

## 5. Machine Learning Model

| Item | Detail |
|---|---|
| Algorithm | XGBoost classifier |
| Text features | TF-IDF |
| Other features | URL features, attachment features |
| Dataset | MeAJOR corpus |
| Total samples | 104,933 |
| Train / Val / Test | 78,701 / 10,493 / 15,739 |

### Held-out test results

| Metric | Value |
|---|---|
| Precision | 0.9797 |
| Recall | 0.9798 |
| F1-score | 0.9797 |
| False Positive Rate | 1.66% |
| ML step latency (p95) | 3.4 ms |

Results are produced by `evaluate_test.py`.

## 6. Tech Stack

> Fill in the exact versions you use.

- **Language:** Python
- **ML:** XGBoost, scikit-learn (TF-IDF), pandas, NumPy
- **Backend / API:** [FILL: e.g., Flask / FastAPI]
- **Frontend:** [FILL: e.g., HTML/CSS/JS, React]
- **Dataset:** MeAJOR corpus

## 7. Project Structure

> Replace with your real folder layout.

```
AI-MailNlyzer/
├── data/                 # dataset (MeAJOR) and splits
├── models/               # trained XGBoost model + TF-IDF vectorizer
├── src/                  # feature extraction, training, inference code
├── app/                  # web app / API and analysis page
├── evaluate_test.py      # test-set evaluation script
├── requirements.txt
└── README.md
```

## 8. Installation

```bash
# 1. Clone the repository
git clone [FILL: your repo URL]
cd AI-MailNlyzer

# 2. Create a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux / macOS

# 3. Install dependencies
pip install -r requirements.txt
```

## 9. Usage

```bash
# Evaluate the model on the held-out test set
python evaluate_test.py

# Run the prototype (localhost)
[FILL: command to start your app, e.g. python app.py]
```

Then open `http://localhost:[FILL: port]` in your browser, upload or paste an email, and view the analysis page.

## 10. Output of an Analysis

For every email the system reports:

1. **Verdict / label** (e.g., malicious or legitimate)
2. **Risk score**
3. **Email date** and basic metadata
4. **IOC list** (URLs, domains, attachments, etc.)
5. **Reasons / evidence** supporting the verdict

## 11. Performance Summary

- F1-score ≈ **0.98** on 15,739 unseen test emails
- False positive rate **1.66%**
- ML inference p95 **3.4 ms**

## 12. Future Scope

- Header and sender-authentication analysis (SPF / DKIM / DMARC)
- Sandbox analysis of attachments
- Threat-intelligence feed lookups for IOCs
- Mail-server / mailbox integration for real-time scanning
- Explainability (feature importance per email)

