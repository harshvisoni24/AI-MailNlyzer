import json
from app.services.gemini_service import redact_any

ctx = {
    "subject": "Hi jane@corp.com",
    "textBody": "full private email text here",
    "urls": ["http://e.example/login?email=jane@corp.com&token=abc"],
    "score": 55,
    "note": "call 555-123-4567",
}
print(json.dumps(redact_any(ctx), indent=2))