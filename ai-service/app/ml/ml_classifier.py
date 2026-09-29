from typing import Any, Dict, List, Optional
PHISHING_THRESHOLD = 0.70

from app.config.settings import settings

_model = None
_vectorizer = None
_scaler = None
_load_attempted = False


def _load_artifacts() -> bool:
    global _model, _vectorizer, _scaler, _load_attempted
    if _load_attempted:
        return _model is not None
    _load_attempted = True
    try:
        import os
        import joblib

        artifacts_dir = settings.ml_artifacts_dir
        model_path = os.path.join(artifacts_dir, "xgb_phishing_classifier.joblib")
        vectorizer_path = os.path.join(artifacts_dir, "tfidf_vectorizer.joblib")
        scaler_path = os.path.join(artifacts_dir, "numeric_scaler.joblib")

        if not (os.path.exists(model_path) and os.path.exists(vectorizer_path) and os.path.exists(scaler_path)):
            return False

        _model = joblib.load(model_path)
        _vectorizer = joblib.load(vectorizer_path)
        _scaler = joblib.load(scaler_path)
        return True
    except Exception:
        _model = None
        return False


def _numeric_features_from_payload(payload: Dict[str, Any]) -> List[float]:
    urls = payload.get("urls", []) or []
    url_lengths = [len(u) for u in urls] if urls else [0]
    attachments = payload.get("attachments", []) or []

    return [
        float(len(urls)),
        float(max(url_lengths) if url_lengths else 0),
        float(sum(url_lengths) / len(url_lengths) if url_lengths else 0),
        0.0,
        0.0,
        float(len(attachments)),
        1.0 if attachments else 0.0,
    ]


def score_with_ml(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not _load_artifacts():
        return None

    from scipy.sparse import csr_matrix, hstack

    subject = payload.get("subject", "") or ""
    body = (payload.get("textBody") or "") + " " + (payload.get("htmlBody") or "")
    text = f"{subject} {body}"[:20000]

    tfidf = _vectorizer.transform([text])
    numeric = _scaler.transform([_numeric_features_from_payload(payload)])
    features = hstack([tfidf, csr_matrix(numeric)]).tocsr()

    probability = float(_model.predict_proba(features)[0][1])

    return {
        "mlPhishingProbability": round(probability * 100, 2),
        "mlLabel": "PHISHING" if probability >= PHISHING_THRESHOLD else "BENIGN",
        "mlSource": "meajor_xgb_v1",
    }