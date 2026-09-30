"""End-to-end check of the live pipeline: rules + ML + blend + verdict.

Run from the ai-service folder:  python test_live.py
Edit or add cases in CASES to match the emails you care about.
"""
from app.ml.rule_engine import score_email, blend_ml_score
from app.ml.ml_classifier import score_with_ml

FLAGGED = {"PHISHING", "SUSPICIOUS", "BEC", "CREDENTIAL_HARVESTING", "IMPERSONATION"}

PASS = {"spf": "PASS", "dkim": "PASS", "dmarc": "PASS"}
FAIL = {"spf": "FAIL", "dkim": "FAIL", "dmarc": "FAIL"}


def make(subject, body, auth, urls=None, attachments=None):
    return {
        "subject": subject,
        "textBody": body,
        "htmlBody": "",
        "auth": auth,
        "urls": urls or [],
        "attachments": attachments or [],
        "headerAnomalies": [],
        "lookalikeDomain": None,
        "relayIps": [],
    }


# (name, payload, should_be_flagged)
CASES = [
    ("Normal: invoice/payroll mention",
     make("Q3 payroll summary",
          "Hi team, the invoice attached covers the Q3 payroll run. The director approved it "
          "last week. Let me know if the bank account details on file look right.",
          PASS, attachments=["invoice.pdf"]), False),
    ("Normal: 'cool' and 'directory' words",
     make("Lunch?",
          "That was a cool talk. I put the notes in the shared directory. "
          "Also I paid the bank account fee for the room.",
          PASS), False),
    ("Normal: newsletter with links",
     make("Weekly deals from ShopCo",
          "Free shipping this week only. Save up to 60% on selected items. "
          "See the full range and unsubscribe any time.",
          PASS, urls=["https://shopco.example/deals", "https://shopco.example/unsub",
                      "https://shopco.example/new"]), False),
    ("Normal: personal note",
     make("Weekend plans", "Hey, are you free Saturday? We could go cycling if the weather holds.",
          PASS), False),
    ("Phishing: account verification",
     make("Action required: verify your account",
          "Your account has been suspended due to unusual activity. Act now and click here now "
          "to confirm your identity within 24 hours.",
          FAIL, urls=["http://secure-login.example/verify"]), True),
    ("BEC: CEO wire transfer",
     make("Urgent request",
          "I am the CEO. I need a wire transfer today, please update your banking details and "
          "send the swift code. Keep this between us.",
          FAIL), True),
    ("Credential harvesting",
     make("Password expires",
          "Please reset your password and sign in to continue. Unlock your account here.",
          FAIL, urls=["http://account-check.example/login"]), True),
    ("Scam text with no trigger phrases (tests ML-only catch)",
     make("You have been selected",
          "Congratulations, you were chosen to receive a cash prize. Reply with your details "
          "to claim your reward before the draw closes.",
          PASS), True),
]

print(f"{'Case':<52}{'Verdict':<22}{'Final':>6}{'Rule':>6}{'ML%':>7}  Result")
print("-" * 105)
wrong = 0
for name, payload, should_flag in CASES:
    rule = score_email(payload)
    ml = score_with_ml(payload)
    res = blend_ml_score(rule, ml)
    verdict = res["classification"]
    ml_pct = res.get("mlPhishingProbability")
    flagged = verdict in FLAGGED
    ok = flagged == should_flag
    wrong += 0 if ok else 1
    ml_txt = "n/a" if ml_pct is None else f"{ml_pct:.1f}"
    print(f"{name:<52}{verdict:<22}{res['threatScore']:>6}{res['ruleScore']:>6}{ml_txt:>7}  "
          f"{'OK' if ok else 'WRONG (expected ' + ('flag' if should_flag else 'no flag') + ')'}")

print(f"\n{len(CASES) - wrong} of {len(CASES)} correct.")
if any(score_with_ml(p) is None for _, p, _ in CASES[:1]):
    print("Note: ML model did not load, so results use the rules only.")