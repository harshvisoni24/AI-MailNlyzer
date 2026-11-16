from typing import Any, Dict, List, Optional

from app.config.settings import settings

PHISHING_THRESHOLD = 0.70
NUMERIC_NAMES = ["url_count", "url_length_max", "url_length_avg", "url_subdom_max",
                 "url_subdom_avg", "attachment_count", "has_attachments"]

_model = None
_vectorizer = None
_scaler = None
_feature_names = None
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


def _top_contributors(features, n: int = 5) -> Dict[str, List[Dict[str, Any]]]:
    global _feature_names
    try:
        import xgboost as xgb

        if _feature_names is None:
            _feature_names = list(_vectorizer.get_feature_names_out()) + NUMERIC_NAMES
        contribs = _model.get_booster().predict(xgb.DMatrix(features), pred_contribs=True)[0][:-1]
        present = set(features.indices.tolist())
        rows = [(i, float(contribs[i])) for i in present if i < len(_feature_names)]
        up = sorted([r for r in rows if r[1] > 0], key=lambda r: -r[1])[:n]
        down = sorted([r for r in rows if r[1] < 0], key=lambda r: r[1])[:n]

        def fmt(items):
            return [{"feature": _feature_names[i], "impact": round(v, 3)} for i, v in items]

        return {"raisedScore": fmt(up), "loweredScore": fmt(down)}
    except Exception as exc:
        print("SHAP error:", repr(exc))
        return {"raisedScore": [], "loweredScore": []}


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
    top_features = _top_contributors(features)

    return {
        "mlPhishingProbability": round(probability * 100, 2),
        "mlLabel": "PHISHING" if probability >= PHISHING_THRESHOLD else "BENIGN",
        "mlSource": "combined_xgb_v3",
        "mlTopFeatures": top_features,
    }