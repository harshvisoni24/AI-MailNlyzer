from typing import Any, Dict, List, Optional
from app.config.settings import settings

from fastapi import APIRouter
from pydantic import BaseModel

from app.ml.rule_engine import score_email, blend_ml_score, build_recommended_actions
from app.ml.ml_classifier import score_with_ml
from app.services.gemini_service import generate_explanation_and_story

router = APIRouter()


class AuthPayload(BaseModel):
    spf: Optional[str] = "UNKNOWN"
    dkim: Optional[str] = "UNKNOWN"
    dmarc: Optional[str] = "UNKNOWN"


class LookalikeDomain(BaseModel):
    trustedDomain: str
    similarityPercent: float


class AttachmentPayload(BaseModel):
    filename: str
    mimeType: str
    sizeBytes: int
    sha256: str


class AnalyzeRequest(BaseModel):
    fromAddress: str
    subject: str
    textBody: Optional[str] = ""
    htmlBody: Optional[str] = ""
    auth: AuthPayload = AuthPayload()
    headerAnomalies: List[str] = []
    lookalikeDomain: Optional[LookalikeDomain] = None
    urls: List[str] = []
    relayIps: List[str] = []
    attachments: List[AttachmentPayload] = []


@router.post("/analyze")
def analyze_email(request: AnalyzeRequest) -> Dict[str, Any]:
    payload = request.model_dump()

    rule_result = score_email(payload)

    try:
        ml_result = score_with_ml(payload)
    except Exception as exc:
        print("ML scoring failed:", exc)
        ml_result = None

    blended_result = blend_ml_score(rule_result, ml_result)

    try:
        explanation = generate_explanation_and_story(blended_result, payload)
    except Exception as exc:
        print("Explanation generation failed:", exc)
        auth = payload.get("auth", {})
        explanation = {
            "observedFacts": [
                f"SPF = {auth.get('spf')}",
                f"DKIM = {auth.get('dkim')}",
                f"DMARC = {auth.get('dmarc')}",
            ] + payload.get("headerAnomalies", []),
            "aiInferences": [],
            "unknowns": [],
            "attackStory": None,
            "aiExplanationSource": "RULE_ENGINE_ONLY",
        }

    if blended_result.get("mlPhishingProbability") is not None:
        w = settings.ml_blend_weight
        explanation["observedFacts"].append(
            f"Score = {round((1 - w) * 100)}% rule score ({blended_result['ruleScore']}) "
            f"+ {round(w * 100)}% ML ({blended_result['mlPhishingProbability']}) = {blended_result['threatScore']}"
        )

    recommended_actions = build_recommended_actions(blended_result["classification"], blended_result["threatScore"])

    return {
        "classification": blended_result["classification"],
        "threatScore": blended_result["threatScore"],
        "ruleScore": blended_result["ruleScore"],
        "mlPhishingProbability": blended_result["mlPhishingProbability"],
        "mlSource": blended_result["mlSource"],
        "scoreFactors": blended_result["scoreFactors"],
        "observedFacts": explanation["observedFacts"],
        "aiInferences": explanation["aiInferences"],
        "unknowns": explanation["unknowns"],
        "attackStory": explanation["attackStory"],
        "becIndicators": blended_result["contentSignals"]["becIndicators"],
        "phishingIndicators": blended_result["contentSignals"]["urgencyIndicators"] + blended_result["contentSignals"]["credentialHarvestingIndicators"],
        "recommendedActions": recommended_actions,
        "aiExplanationSource": explanation["aiExplanationSource"],
    }