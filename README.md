# MailTrace AI

MailTrace AI analyses emails for phishing and related threats. It combines a **rule engine** (email authentication, header anomalies, suspicious phrases, links, attachments) with a **machine-learning classifier** (XGBoost on TF-IDF text features plus numeric features) and turns both into a single risk score, a verdict, and recommended response actions.

> The ML service lives in `ai-service/`. [Add one line here about the rest of the project, e.g. the backend and frontend, if they are in this repo.]

---

## Table of contents

1. [How it works](#how-it-works)
2. [Rule engine](#rule-engine)
3. [ML classifier](#ml-classifier)
4. [Score blending and verdicts](#score-blending-and-verdicts)
5. [Dataset](#dataset)
6. [Model performance](#model-performance)
7. [Error analysis: the `en;en` weak spot](#error-analysis-the-enen-weak-spot)
8. [Threshold analysis](#threshold-analysis)
9. [Known limitations](#known-limitations)
10. [Project structure](#project-structure)
11. [Setup and usage](#setup-and-usage)
12. [Changelog](#changelog)

---

## How it works

```
Email payload
   |
   +--> Rule engine ------------> rule score (0-100) + content signals
   |
   +--> ML classifier ----------> phishing probability (0-100)
                                        |
        final score = 0.65 x rule score + 0.35 x ML score
                                        |
                                        v
              classify() -> verdict + recommended actions
```

The pipeline also includes parsing, IP lookups and threat intelligence, and a retrieval module (`app/rag/retrieval.py`). [Describe these parts briefly if you like.]

---

## Rule engine

File: `app/ml/rule_engine.py`

The rule engine adds up weighted factors into a rule score capped at 100:

| Factor | Points |
|---|---|
| SPF fail | 20 |
| DKIM fail / invalid | 15 |
| DMARC fail | 20 |
| Header anomalies | 8 each, max 24 |
| Lookalike domain | similarity % / 4, max 20 |
| Urgency language | 6 per phrase, max 18 |
| BEC / financial language | 8 per phrase, max 24 |
| Credential-harvesting language | 8 per phrase, max 20 |
| Suspicious URL volume | 3 per URL, max 12 |
| Executive impersonation (with BEC phrases) | 10 |
| Has attachments | 5 |

Phrase lists cover urgency ("verify your account", "final notice"), BEC/finance ("wire transfer", "payroll", "invoice attached"), credential harvesting ("reset your password"), and executive titles ("ceo", "cfo", "director").

---

## ML classifier

File: `app/ml/ml_classifier.py`

- **Model:** XGBoost, tagged `meajor_xgb_v1`
- **Text features:** TF-IDF on subject + body (first 20,000 characters)
- **Numeric features:** URL count, max and average URL length, URL subdomain stats, attachment count, has-attachments flag (scaled)
- **Output:** `mlPhishingProbability` (0-100) and `mlLabel` (`PHISHING` / `BENIGN`)
- **Label threshold:** `PHISHING_THRESHOLD = 0.70` (was 0.50, see [Threshold analysis](#threshold-analysis))

Label `1` means phishing. The dataset groups spam and phishing together in this class.

---

## Score blending and verdicts

File: `app/ml/rule_engine.py` (`blend_ml_score`, `classify`)

```
final score = (1 - w) x rule score + w x ML score,   w = ML_BLEND_WEIGHT (default 0.35)
```

Verdict rules, checked in this order:

| Condition | Verdict |
|---|---|
| BEC phrases and executive title both present, and score >= 45 | `BEC` |
| Credential-harvesting phrases and score >= 50 | `CREDENTIAL_HARVESTING` |
| Lookalike domain and score >= 60 | `IMPERSONATION` |
| Score >= 75 | `PHISHING` |
| Score >= 45 | `SUSPICIOUS` |
| Score >= 20 | `LOW_RISK` |
| SPF and DKIM unknown and score 0 | `UNKNOWN` |
| Otherwise | `LEGITIMATE` |

Because the ML weight is 0.35, the ML score alone can reach at most 35 points, so it cannot move an email to `SUSPICIOUS` (45) or `PHISHING` (75) without help from the rules.

**Important:** the blend uses the raw ML probability. `PHISHING_THRESHOLD` only changes the `mlLabel` shown next to the score. It does not change the final verdict.

---

## Dataset

The classifier is trained on the **MeAJOR** email corpus (TREC 2005, 2006 and 2007 sources).

| Split | Emails |
|---|---|
| Train | 78,701 |
| Validation | [add count] |
| Test | 15,739 (8,654 benign, 7,085 phishing/spam) |

Splits are stored in `ai-service/data/meajor/splits/`. **The data is not included in this repository.** [Add where to download it and how to place the files.]

Notes about the data:

- Text has already been anonymised with placeholders such as `[ORGANIZATION]`, `[PRODUCT]`, `[NAME]`, `[DATE]` and `<|URL|>`.
- Some bodies contain literal `\n` sequences instead of real line breaks. This may split words oddly in the tokenizer (for example `\nthe` becoming `nthe`). It has not been confirmed as a problem and has not been fixed.
- The `language` column contains a malformed value, `en;en` (about 20% of rows). See below.

---

## Model performance

Test set, ML classifier only, decision threshold 0.50 (`python scripts/evaluate_test.py`):

| Metric | Value |
|---|---|
| Accuracy | 0.9818 |
| Precision | 0.9797 |
| Recall | 0.9798 |
| F1 | 0.9797 |
| False-positive rate | 1.66% |
| Confusion matrix | TP 6942, FP 144, FN 143, TN 8510 |

By source:

| Source | Emails | Precision | Recall | F1 | FPR |
|---|---|---|---|---|---|
| trec5 | 7,151 | 0.971 | 0.977 | 0.974 | 2.1% |
| trec6 | 2,174 | 0.933 | 0.974 | 0.953 | 2.3% |
| trec7 | 6,414 | 0.995 | 0.983 | 0.989 | 0.7% |

By language tag:

| Language | Emails | FPR |
|---|---|---|
| `en` | 11,840 | 1.1% |
| `en;en` | 3,131 | **9.4%** |
| de, es, ja, ru, zh | 52-125 each | 0.0% (small groups) |

Speed (ML step only, one email at a time): median about 3 ms per email. This excludes parsing, IP lookups and threat intelligence.

---

## Error analysis: the `en;en` weak spot

The overall numbers hide one weak spot. Legitimate emails whose language tag is `en;en` are wrongly flagged far more often than normal English mail.

**Finding:** 56 of 594 benign `en;en` emails were flagged (9.4%), versus 1.1% for plain `en`.

What was checked:

- **It is not a source problem.** The same sources are fine under plain `en` and much worse under `en;en`:

  | Source | `en` FPR | `en;en` FPR |
  |---|---|---|
  | trec5 | 1.4% | 14.1% |
  | trec6 | 1.5% | 13.0% |
  | trec7 | 0.3% | 3.9% |

- **It is not a lack of training data.** `en;en` is about 20% of both train (15,636 rows, 2,864 benign) and test (3,131 rows, 594 benign).
- **The benign `en;en` emails look different.** They are longer, mention organisations more, and contain links more often, which resembles phishing:

  | Benign emails | `en` | `en;en` |
  |---|---|---|
  | Average body length (chars) | 1,120 | 1,968 |
  | `[ORGANIZATION]` tags per email | 2.7 | 6.0 |
  | Share with a link | 40% | 59% |
  | Average model phishing probability | 0.03 | 0.12 |

- **The wrong predictions are uncertain, not confident.** Median probability on the false positives is about 0.69-0.77, so a stricter threshold helps.
- The flagged examples are a mix of ordinary personal or business mail and marketing-style mail ("Rent movies from [ORGANIZATION]!"). Some of the marketing mail may be label noise.

**Likely cause (not proven):** long, link-heavy, company-heavy legitimate mail (newsletters, promotions) looks like the phishing the model learned from. Why these rows carry the `en;en` tag is still unknown.

---

## Threshold analysis

The threshold was chosen using the validation split and confirmed on the test split. Per-row predictions are saved by the evaluation script so this analysis can be repeated (`python pick_threshold.py`).

Test split, ML classifier only:

| Threshold | Benign flagged (all) | Phishing caught (all) | `en;en` benign flagged |
|---|---|---|---|
| 0.50 | 1.7% | 98.0% | 9.4% |
| 0.60 | 1.3% | 97.1% | 7.4% |
| **0.70 (chosen)** | **0.9%** | **96.0%** | **4.7%** |
| 0.80 | 0.6% | 93.8% | 3.5% |
| 0.90 | 0.3% | 89.1% | 1.2% |

Moving from 0.50 to 0.70 roughly halves false alarms and costs about 2 points of phishing recall. For a security tool, missed phishing is usually worse than a false alarm, so 0.60 is a more conservative option. Change `PHISHING_THRESHOLD` in `app/ml/ml_classifier.py` to adjust it.

---

## Known limitations

- **The `en;en` subset is only reduced, not solved.** Its false-positive rate is 4.7% at threshold 0.70 (9.4% at 0.50), still above the 1.1% of normal English mail.
- **The threshold does not change the live verdict.** `PHISHING_THRESHOLD` only affects `mlLabel`. The final verdict comes from the blended score and the rule engine.
- **The end-to-end system has only had a small check.** All accuracy figures above are for the ML classifier alone on the MeAJOR test split, which has no authentication or header data. The full pipeline (rules + ML + blend) was checked with `test_live.py` on 8 hand-written emails (7 correct). That is too small to give an accuracy figure, and a larger labelled test set is still needed.
- **Some scams are missed.** A scam email with no trigger phrases (for example a "cash prize" message) scored 0 on the rules and about 50% from the ML model, so it was labelled `LEGITIMATE`. The ML model counts for only 35% of the final score, so it cannot raise an email to `SUSPICIOUS` by itself.
- **Rule engine matching (fixed).** Phrases were previously matched as substrings, so `coo` matched inside `cool` and `director` inside `directory`, and a single finance phrase plus a single executive title gave a `BEC` verdict. This caused two false alarms in live testing. Matching is now whole-word and `BEC` needs a score of at least 45.
- **App and evaluation features differ slightly.** The app sets the URL subdomain features to 0 and adds the HTML body to the text, so live results may differ a little from the test figures.
- **Data is older and mixed.** MeAJOR is built from 2005-2007 TREC corpora, and its positive class mixes spam and phishing. Results may not carry over to modern phishing.
- **Literal `\n` sequences** in the text may fragment tokens. Not yet investigated.

---

## Project structure

```
mailtrace-ai/
  ai-service/
    app/
      api/analyze.py           # analysis endpoint
      config/settings.py       # settings (ML_BLEND_WEIGHT, ...)
      ml/
        ml_classifier.py       # ML scoring and label (PHISHING_THRESHOLD)
        rule_engine.py         # rules, blending, verdicts, recommended actions
        artifacts/             # trained model files and metadata.json
      rag/retrieval.py         # retrieval module
    scripts/
      evaluate_test.py         # test metrics, grouped results, speed, saves predictions
    pick_threshold.py          # threshold comparison on validation and test
    data/meajor/splits/        # train / val / test parquet files (not in Git)
  [other folders, e.g. backend / frontend]
```

`evaluate_test.py` also writes `test_with_preds.parquet` and `val_with_preds.parquet` (with `pred` and `prob` columns) into the splits folder.

---

## Setup and usage

```powershell
cd ai-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Evaluate the model and save predictions:

```powershell
python scripts\evaluate_test.py
```

Compare decision thresholds on validation and test:

```powershell
python pick_threshold.py
```

Run the service: `[add your start command, e.g. uvicorn app.main:app --reload]`

Settings: `ML_BLEND_WEIGHT` (environment variable, default `0.35`) controls how much the ML score counts in the final score. Do not commit `.env` files or the data folder.

---

## Changelog

**Latest**

- Rule engine: phrases are now matched as whole words, and a `BEC` verdict needs a score of at least 45. This removed two false alarms found in live testing.
- Added `test_live.py`, which runs sample emails through the full pipeline (rules, ML, blend, verdict). Result: 7 of 8 correct.
- `scripts/evaluate_test.py` now saves per-row predictions and probabilities for the test and validation splits.
- Added `pick_threshold.py` to compare decision thresholds on validation and test data.
- Added `PHISHING_THRESHOLD = 0.70` in `ml_classifier.py`, used for `mlLabel` (previously a hard-coded 0.5).
- Documented the `en;en` weak spot, the threshold trade-off, and known limitations.

**Earlier**

- [Keep your existing history here: ML model training, rule engine, blending, API, and so on.]

---