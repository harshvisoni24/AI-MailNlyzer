import json
from app.services.gemini_service import safe_evidence

payload = {
    "subject": "Hi jane.doe@corp.com, call 555-123-4567",
    "urls": ["http://evil.example/login?email=jane.doe@corp.com&token=abc123"],
    "headerAnomalies": ["Reply-To differs: bob@evil.example"],
    "lookalikeDomain": None,
}
rule = {"ruleScore": 40, "relayIps": ["203.0.113.45"], "classification": "SUSPICIOUS"}
print(json.dumps(safe_evidence(rule, payload), indent=2))