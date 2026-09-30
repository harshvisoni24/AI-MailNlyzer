"""
Gemini is used strictly for explanation, summarization, and reasoning OVER
evidence already produced by the deterministic rule engine — never as the
source of technical verdicts. If GEMINI_API_KEY is not configured, every
function here degrades to a template-based explanation so the platform
remains usable end-to-end without a live key.
"""
import json
from typing import Any, Dict, List, Optional

from app.config.settings import settings
import re
from urllib.parse import urlsplit

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")


def _mask_text(value) -> str:
    text = _EMAIL_RE.sub("[EMAIL]", str(value or ""))
    return _PHONE_RE.sub("[NUMBER]", text)[:200]


def _safe_url(url) -> str:
    try:
        p = urlsplit(str(url))
        return f"{p.scheme}://{p.hostname}{p.path}"[:200]  # drops ?query, #fragment, user:pass@
    except Exception:
        return "[URL]"


def _mask_ip(ip) -> str:
    parts = str(ip).split(".")
    return ".".join(parts[:2] + ["x", "x"]) if len(parts) == 4 else "[IP]"


def safe_evidence(rule_result, payload):
    rr = dict(rule_result)
    rr["relayIps"] = [_mask_ip(i) for i in rr.get("relayIps") or []]
    return {
        "ruleResult": rr,
        "headerAnomalies": [_mask_text(a) for a in payload.get("headerAnomalies") or []],
        "lookalikeDomain": payload.get("lookalikeDomain"),
        "urls": [_safe_url(u) for u in (payload.get("urls") or [])[:20]],
        "subject": _mask_text(payload.get("subject")),
    }

_gemini_model = None


def _get_model():
    global _gemini_model
    if _gemini_model is not None:
        return _gemini_model
    if not settings.gemini_enabled:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        _gemini_model = genai.GenerativeModel(settings.gemini_model)
        return _gemini_model
    except Exception:
        return None


def generate_explanation_and_story(rule_result: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    observed_facts = build_observed_facts(rule_result, payload)
    model = _get_model()

    if model is None:
        return {
            "observedFacts": observed_facts,
            "aiInferences": template_inferences(rule_result),
            "unknowns": ["Physical attacker location = UNKNOWN", "Attacker identity = UNKNOWN"],
            "attackStory": template_attack_story(rule_result, payload),
            "aiExplanationSource": "RULE_ENGINE_ONLY",
        }

    prompt = f"""You are a forensic email-security analyst assistant. You are given
DETERMINISTIC, ALREADY-COMPUTED evidence about a suspicious email. Do not invent
any new technical facts (IPs, domains, headers) beyond what is provided.

Evidence (JSON):
{json.dumps(safe_evidence(rule_result, payload), default=str)}

Respond ONLY as compact JSON with this exact shape:
{{
  "aiInferences": [{{"statement": "...", "confidence": 0-100}}, ...],
  "attackStory": "2-4 sentence plain-language narrative grounded only in the evidence above"
}}"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(text)
        return {
            "observedFacts": observed_facts,
            "aiInferences": parsed.get("aiInferences", template_inferences(rule_result)),
            "unknowns": ["Physical attacker location = UNKNOWN", "Attacker identity = UNKNOWN"],
            "attackStory": parsed.get("attackStory", template_attack_story(rule_result, payload)),
            "aiExplanationSource": "GEMINI",
        }
    except Exception:
        # Gemini unavailable / malformed response -> graceful fallback, never crash.
        return {
            "observedFacts": observed_facts,
            "aiInferences": template_inferences(rule_result),
            "unknowns": ["Physical attacker location = UNKNOWN", "Attacker identity = UNKNOWN"],
            "attackStory": template_attack_story(rule_result, payload),
            "aiExplanationSource": "RULE_ENGINE_ONLY",
        }


def build_observed_facts(rule_result: Dict[str, Any], payload: Dict[str, Any]) -> List[str]:
    auth = payload.get("auth", {})
    facts = [
        f"SPF = {auth.get('spf', 'UNKNOWN')}",
        f"DKIM = {auth.get('dkim', 'UNKNOWN')}",
        f"DMARC = {auth.get('dmarc', 'UNKNOWN')}",
    ]
    facts.extend(payload.get("headerAnomalies", []))
    if payload.get("lookalikeDomain"):
        ld = payload["lookalikeDomain"]
        facts.append(f"Sender domain is {ld['similarityPercent']}% similar to trusted domain {ld['trustedDomain']}.")
    if rule_result["contentSignals"]["urgencyIndicators"]:
        facts.append("Urgency language detected in message body.")
    if rule_result["contentSignals"]["becIndicators"]:
        facts.append("Financial/payment-related language detected.")
    if rule_result["contentSignals"]["credentialHarvestingIndicators"]:
        facts.append("Credential-harvesting language detected (e.g. login/verify prompts).")
    return facts


def template_inferences(rule_result: Dict[str, Any]) -> List[Dict[str, Any]]:
    score = rule_result["threatScore"]
    classification = rule_result["classification"]
    confidence = min(50 + score // 2, 97)
    return [{"statement": f"Possible {classification.replace('_', ' ').title()} = {confidence}%", "confidence": confidence}]


def template_attack_story(rule_result: Dict[str, Any], payload: Dict[str, Any]) -> str:
    parts = []
    if payload.get("lookalikeDomain"):
        parts.append("the email appears to impersonate a trusted organization using a lookalike sending domain")
    if payload.get("auth", {}).get("dmarc") == "FAIL":
        parts.append("authentication checks (DMARC) failed, indicating the message did not originate from an authorized server")
    if rule_result["contentSignals"]["urgencyIndicators"]:
        parts.append("the message uses urgency language typical of social-engineering attempts")
    if payload.get("urls"):
        parts.append(f"it contains {len(payload['urls'])} embedded URL(s) that warrant further domain/redirect analysis")
    if not parts:
        return "No strong technical indicators of malicious intent were found in the available evidence."
    return "The investigation indicates that " + "; ".join(parts) + "."


def answer_copilot_question(question: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    model = _get_model()
    context = context or {}

    if model is None:
        return {
            "answer": (
                "AI copilot narrative generation requires a configured GEMINI_API_KEY. "
                "Based on the investigation data available: "
                + json.dumps({k: "present" for k in context.keys()})
                + ". Configure GEMINI_API_KEY in ai-service/.env to enable grounded natural-language answers."
            ),
            "groundedIn": list(context.keys()),
            "source": "RULE_ENGINE_ONLY",
        }

    prompt = f"""You are a forensic email investigation copilot. Answer the analyst's
question using ONLY the investigation data provided below. If the data does not
contain the answer, say so explicitly rather than inventing facts.

Investigation data (JSON):
{json.dumps(context, default=str)[:12000]}

Analyst question: {question}

Respond with a concise, professional answer (max 6 sentences)."""

    try:
        response = model.generate_content(prompt)
        return {"answer": response.text.strip(), "groundedIn": list(context.keys()), "source": "GEMINI"}
    except Exception:
        return {
            "answer": "The AI copilot encountered an error contacting Gemini. Please retry, or review the raw investigation data directly.",
            "groundedIn": list(context.keys()),
            "source": "RULE_ENGINE_ONLY",
        }
