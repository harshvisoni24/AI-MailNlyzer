from urllib.parse import urlparse
import re
from typing import Any, Dict, List, Optional

from app.config.settings import settings

URGENCY_PHRASES = [
    "urgent", "immediately", "action required", "verify your account",
    "suspended", "final notice", "act now", "24 hours", "confirm your identity",
    "unusual activity", "click here now",
]

BEC_FINANCIAL_PHRASES = [
    "wire transfer", "bank account", "routing number", "change of payment",
    "invoice attached", "update your banking details", "payroll",
    "gift card", "purchase order", "outstanding payment", "swift code",
]

CREDENTIAL_HARVEST_PHRASES = [
    "reset your password", "login to verify", "confirm your password",
    "sign in to continue", "unlock your account", "update your credentials",
]

EXECUTIVE_TITLES = ["ceo", "cfo", "coo", "president", "director", "chairman"]


def _contains_any(text: str, phrases: List[str]) -> List[str]:
    lowered = text.lower()
    return [p for p in phrases if re.search(r"\b" + re.escape(p) + r"\b", lowered)]


def analyze_content(text_body: str, html_body: str, subject: str) -> Dict[str, Any]:
    combined = " ".join(filter(None, [subject, text_body or "", re.sub("<[^>]+>", " ", html_body or "")]))
    urgency_hits = _contains_any(combined, URGENCY_PHRASES)
    bec_hits = _contains_any(combined, BEC_FINANCIAL_PHRASES)
    cred_hits = _contains_any(combined, CREDENTIAL_HARVEST_PHRASES)
    exec_hits = _contains_any(combined, EXECUTIVE_TITLES)
    return {
        "urgencyIndicators": urgency_hits,
        "becIndicators": bec_hits,
        "credentialHarvestingIndicators": cred_hits,
        "executiveImpersonationSignals": exec_hits,
    }
TRUSTED_URL_SUFFIXES = (".gov.in", ".nic.in")


def _untrusted_urls(urls: List[str]) -> List[str]:
      return [u for u in urls if not (urlparse(u).hostname or "").lower().endswith(TRUSTED_URL_SUFFIXES)]

def score_email(payload: Dict[str, Any]) -> Dict[str, Any]:
    auth = payload.get("auth", {})
    header_anomalies: List[str] = payload.get("headerAnomalies", [])
    lookalike = payload.get("lookalikeDomain")
    urls: List[str] = payload.get("urls", [])
    relay_ips: List[str] = payload.get("relayIps", [])
    attachments = payload.get("attachments", [])

    content_signals = analyze_content(payload.get("textBody", "") or "", payload.get("htmlBody", "") or "", payload.get("subject", "") or "")

    factors: Dict[str, int] = {}

    factors["spfFail"] = 20 if auth.get("spf") == "FAIL" else 0
    factors["dkimFail"] = 15 if auth.get("dkim") in ("FAIL", "INVALID") else 0
    factors["dmarcFail"] = 20 if auth.get("dmarc") == "FAIL" else 0
    factors["headerAnomalies"] = min(len(header_anomalies) * 8, 24)
    factors["lookalikeDomain"] = min(int((lookalike or {}).get("similarityPercent", 0) / 4), 20) if lookalike else 0
    factors["urgencyLanguage"] = min(len(content_signals["urgencyIndicators"]) * 6, 18)
    factors["becFinancialLanguage"] = min(len(content_signals["becIndicators"]) * 8, 24)
    factors["credentialHarvestingLanguage"] = min(len(content_signals["credentialHarvestingIndicators"]) * 8, 20)
    factors["suspiciousUrlVolume"] = min(len(urls) * 3, 12)
    factors["executiveImpersonationSignal"] = 10 if content_signals["executiveImpersonationSignals"] and content_signals["becIndicators"] else 0
    factors["hasAttachments"] = 5 if attachments else 0

    raw_total = sum(factors.values())
    rule_score = max(0, min(raw_total, 100))

    classification = classify(rule_score, content_signals, auth, lookalike)

    return {
        "threatScore": rule_score,
        "ruleScore": rule_score,
        "scoreFactors": factors,
        "classification": classification,
        "contentSignals": content_signals,
        "relayIps": relay_ips,
        "auth": auth,
        "lookalike": lookalike,
    }


def blend_ml_score(rule_result: Dict[str, Any], ml_result: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    result = dict(rule_result)
    if ml_result is None:
        result["mlPhishingProbability"] = None
        result["mlSource"] = None
        return result

    rule_score = rule_result["ruleScore"]
    ml_score = ml_result["mlPhishingProbability"]
    weight = max(0.0, min(settings.ml_blend_weight, 1.0))

    blended = round((1 - weight) * rule_score + weight * ml_score)
    blended = max(0, min(blended, 100))

    result["threatScore"] = blended
    result["mlPhishingProbability"] = ml_score
    result["mlSource"] = ml_result["mlSource"]

    if result["classification"] in ("PHISHING", "SUSPICIOUS", "LOW_RISK", "LEGITIMATE", "UNKNOWN"):
        result["classification"] = classify(blended, rule_result["contentSignals"], rule_result.get("auth", {}), rule_result.get("lookalike")) \
            if blended != rule_score else result["classification"]

    return result


def classify(score: int, content_signals: Dict[str, Any], auth: Dict[str, Any], lookalike: Optional[Dict[str, Any]]) -> str:
    if content_signals["becIndicators"] and content_signals["executiveImpersonationSignals"] and score >= 45:
        return "BEC"
    if content_signals["credentialHarvestingIndicators"] and score >= 50:
        return "CREDENTIAL_HARVESTING"
    if lookalike and score >= 60:
        return "IMPERSONATION"
    if score >= 75:
        return "PHISHING"
    if score >= 45:
        return "SUSPICIOUS"
    if score >= 20:
        return "LOW_RISK"
    if auth.get("spf") == "UNKNOWN" and auth.get("dkim") == "UNKNOWN" and score == 0:
        return "UNKNOWN"
    return "LEGITIMATE"


def build_recommended_actions(classification: str, score: int) -> Dict[str, List[str]]:
    immediate = []
    investigation = ["Preserve the original email and headers as evidence.", "Calculate and record the SHA-256 hash."]
    threat_hunting = ["Search for other emails referencing the same sender domain or IPs."]

    if score >= 50:
        immediate.append("Quarantine the email.")
    if classification in ("PHISHING", "IMPERSONATION", "CREDENTIAL_HARVESTING"):
        immediate.append("Block the malicious domain/URL at the mail gateway.")
        threat_hunting.append("Search for other recipients who may have received similar messages.")
    if classification == "BEC":
        immediate.append("Alert the finance team before any payment or account-detail change is processed.")
        threat_hunting.append("Review recent financial correspondence for related payment-diversion attempts.")