import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import settings
from app.api import analyze, copilot


def require_api_key(x_api_key: str = Header(default="")):
    expected = os.getenv("AI_SERVICE_API_KEY", "")
    if not expected or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


app = FastAPI(
    title="MAILTRACE AI - AI Service",
    description="AI/ML/RAG service for email threat detection and forensic explanation.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],  # This service is only ever called server-to-server by the Node backend.
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    analyze.router,
    prefix="/api",
    tags=["analysis"],
    dependencies=[Depends(require_api_key)],
)
app.include_router(
    copilot.router,
    prefix="/api",
    tags=["copilot"],
    dependencies=[Depends(require_api_key)],
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "mailtrace-ai-service",
        "geminiConfigured": settings.gemini_enabled,
        "geminiModel": settings.gemini_model if settings.gemini_enabled else None,
    }
