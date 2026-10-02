"""
Evaluate the saved AI-MailNlyzer XGBoost classifier on the held-out test split.

Run from inside the ai-service folder (with the venv activated):

    python scripts/evaluate_test.py

It only READS your data and saved model files. It does not retrain anything
and does not overwrite anything.
"""
import argparse
import json
import os
import time

import joblib
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from sklearn.metrics import classification_report, confusion_matrix, f1_score, precision_score, recall_score

NUMERIC_FEATURES = [
    "url_count",
    "url_length_max",
    "url_length_avg",
    "url_subdom_max",
    "url_subdom_avg",
    "attachment_count",
    "has_attachments",
]


def build_text_column(df):
    # Same as train_ml_classifier.py
    return (df["subject"].fillna("") + " " + df["body"].fillna("")).str.slice(0, 20000)


def featurize(df, vectorizer, scaler):
    tfidf = vectorizer.transform(build_text_column(df))
    numeric = scaler.transform(df[NUMERIC_FEATURES].values)
    return hstack([tfidf, csr_matrix(numeric)]).tocsr()


def metrics(y_true, y_pred):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    fpr = fp / (fp + tn) if (fp + tn) else float("nan")
    return {
        "TP": int(tp), "FP": int(fp), "FN": int(fn), "TN": int(tn),
        "precision": precision_score(y_true, y_pred, zero_division=0),
        "recall": recall_score(y_true, y_pred, zero_division=0),
        "f1": f1_score(y_true, y_pred, zero_division=0),
        "fpr": fpr,
    }


def group_table(test_df, y_pred, col, min_n):
    if col not in test_df.columns:
        return
    print(f"\n=== Test results grouped by '{col}' (groups with at least {min_n} emails) ===")
    print(f"{'group':<20}{'n':>8}{'phish':>8}{'prec':>8}{'recall':>8}{'F1':>8}{'FPR':>8}")
    for name, idx in test_df.groupby(col).groups.items():
        if len(idx) < min_n:
            continue
        pos = test_df.index.get_indexer(idx)
        m = metrics(test_df["label"].values[pos], y_pred[pos])
        print(f"{str(name):<20}{len(idx):>8}{int(test_df['label'].values[pos].sum()):>8}"
              f"{m['precision']:>8.3f}{m['recall']:>8.3f}{m['f1']:>8.3f}{m['fpr']:>8.3f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--splits-dir", default="data/meajor/splits")
    ap.add_argument("--artifacts-dir", default="app/ml/artifacts")
    ap.add_argument("--timing-samples", type=int, default=200)
    args = ap.parse_args()

    model = joblib.load(os.path.join(args.artifacts_dir, "xgb_phishing_classifier.joblib"))
    vectorizer = joblib.load(os.path.join(args.artifacts_dir, "tfidf_vectorizer.joblib"))
    scaler = joblib.load(os.path.join(args.artifacts_dir, "numeric_scaler.joblib"))

    # ---- Dataset counts (for slide 4 "Data" line) ----
    print("=== DATASET COUNTS ===")
    total = 0
    for name in ["train", "val", "test"]:
        labels = pd.read_parquet(os.path.join(args.splits_dir, f"{name}.parquet"), columns=["label"])["label"]
        n, ph = len(labels), int((labels == 1).sum())
        total += n
        print(f"{name:<6} rows = {n:,}  (phishing {ph:,} / legitimate {n - ph:,})")
    print(f"TOTAL rows after cleaning = {total:,}")

    meta_path = os.path.join(args.artifacts_dir, "metadata.json")
    if os.path.exists(meta_path):
        print("metadata.json:", json.dumps(json.load(open(meta_path)), indent=None))

    # ---- Test-set metrics (for slide 4 results table) ----
    test_df = pd.read_parquet(os.path.join(args.splits_dir, "test.parquet")).reset_index(drop=True)
    X_test = featurize(test_df, vectorizer, scaler)
    y_test = test_df["label"].astype(int).values
    y_pred = model.predict(X_test)
    assert len(y_pred) == len(test_df)
    out = test_df.copy()
    out["pred"] = y_pred
    out["prob"] = model.predict_proba(X_test)[:, 1]
    out.to_parquet(os.path.join(args.splits_dir, "test_with_preds.parquet"))
    val_df = pd.read_parquet(os.path.join(args.splits_dir, "val.parquet")).reset_index(drop=True)
    Xv = featurize(val_df, vectorizer, scaler)
    val_out = val_df.copy()
    val_out["prob"] = model.predict_proba(Xv)[:, 1]
    val_out.to_parquet(os.path.join(args.splits_dir, "val_with_preds.parquet"))

    m = metrics(y_test, y_pred)
    print("\n=== TEST SET RESULTS (label 1 = phishing) ===")
    print(classification_report(y_test, y_pred, target_names=["benign", "phishing"], digits=4))
    print(f"TP={m['TP']}  FP={m['FP']}  FN={m['FN']}  TN={m['TN']}")
    print(f"Precision = {m['precision']:.4f}")
    print(f"Recall    = {m['recall']:.4f}")
    print(f"F1        = {m['f1']:.4f}")
    print(f"False-positive rate = {m['fpr']:.4f}  ({m['fpr'] * 100:.2f}%)")

    # ---- Breakdown by source and language ----
    group_table(test_df, y_pred, "source", min_n=50)
    group_table(test_df, y_pred, "language", min_n=50)

    # ---- Speed of the ML step alone (one email at a time) ----
    n = min(args.timing_samples, len(test_df))
    sample = test_df.sample(n=n, random_state=0)
    times = []
    for _, row in sample.iterrows():
        one = pd.DataFrame([row])
        t = time.perf_counter()
        Xi = featurize(one, vectorizer, scaler)
        model.predict_proba(Xi)
        times.append(time.perf_counter() - t)
    times = np.array(times)
    print(f"\n=== SPEED (ML classifier only, {n} emails, one at a time) ===")
    print(f"median = {np.median(times) * 1000:.1f} ms   p95 = {np.percentile(times, 95) * 1000:.1f} ms")
    print(f"throughput = {60 / times.mean():.0f} emails/min")
    print("Note: this is the ML step only, not the full pipeline (parsing, IP lookups, threat intel).")


if __name__ == "__main__":
    main()
