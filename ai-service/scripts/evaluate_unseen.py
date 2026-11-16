import re
from urllib.parse import urlparse

import joblib
import matplotlib
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from sklearn.metrics import confusion_matrix

matplotlib.use("Agg")
import matplotlib.pyplot as plt

PNM = "data/phish_no_more"
HLE = "data/human_llm_emails"
SPLITS = "data/meajor/splits"
OLD_ART = "app/ml/artifacts"
NEW_ART = "app/ml/artifacts_v2"
FILES = ["CEAS_08.csv", "Enron.csv", "Ling.csv", "Nazario.csv", "Nigerian_Fraud.csv", "SpamAssasin.csv"]
MAX_PER_SOURCE = 10000
SEED = 42
NUMERIC_FEATURES = ["url_count", "url_length_max", "url_length_avg", "url_subdom_max",
                    "url_subdom_avg", "attachment_count", "has_attachments"]

URL_RE = re.compile(
    r"(?:https?://|www\.)[^\s<>\"']+"
    r"|(?<![@\w.-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|biz|ru|in|co|io|xyz|top|club|online|site)\b[^\s<>\"']*",
    re.I,
)


def url_features(text):
    urls = [u.rstrip(".,;:!?)") for u in URL_RE.findall((text or "")[:20000])]
    if not urls:
        return dict(url_count=0, url_length_max=0, url_length_avg=0, url_subdom_max=0, url_subdom_avg=0)
    lens = [len(u) for u in urls]
    subs = []
    for u in urls:
        try:
            host = urlparse(u if "//" in u else "http://" + u).hostname or ""
        except ValueError:
            host = ""
        subs.append(max(host.count(".") - 1, 0))
    return dict(url_count=len(urls), url_length_max=max(lens), url_length_avg=float(np.mean(lens)),
                url_subdom_max=max(subs), url_subdom_avg=float(np.mean(subs)))


def key_of(df):
    return (df["subject"].fillna("").astype(str) + " " + df["body"].fillna("").astype(str)).str.strip()


def read_llm(path):
    try:
        df = pd.read_csv(path)
        return pd.DataFrame({"subject": "", "body": df["text"].astype(str)})
    except Exception:
        rows = []
        with open(path, encoding="utf-8", errors="replace") as f:
            next(f)
            for line in f:
                line = line.strip()
                if line:
                    rows.append(line.rsplit(",", 1)[0].strip().strip('"'))
        return pd.DataFrame({"subject": "", "body": rows})


def featurize(df, vec, scaler):
    text = (df["subject"].fillna("") + " " + df["body"].fillna("")).str.slice(0, 20000)
    return hstack([vec.transform(text), csr_matrix(scaler.transform(df[NUMERIC_FEATURES].values))]).tocsr()


def summarize(y, pred):
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    fpr = fp / (fp + tn) if (fp + tn) else float("nan")
    return dict(TP=tp, FP=fp, FN=fn, TN=tn, prec=prec, rec=rec, f1=f1, fpr=fpr)


def line(name, m):
    return (f"{name:<26} TP={m['TP']:<6} FP={m['FP']:<6} FN={m['FN']:<6} TN={m['TN']:<6} "
            f"prec={m['prec']:.3f} rec={m['rec']:.3f} F1={m['f1']:.3f} FPR={m['fpr']:.3f}")


# ---- emails the models already saw (TREC + Human-LLM) -> remove from this test ----
seen = set()
for s in ["train", "val", "test"]:
    seen |= set(key_of(pd.read_parquet(f"{SPLITS}/{s}.parquet", columns=["subject", "body"])))
for f in ["human-generated/legit.csv", "human-generated/phishing.csv"]:
    seen |= set(key_of(pd.read_csv(f"{HLE}/{f}", usecols=["subject", "body"])))
for f in ["llm-generated/legit.csv", "llm-generated/phishing.csv"]:
    seen |= set(key_of(read_llm(f"{HLE}/{f}")))
print(f"Known (already seen) emails: {len(seen):,}")

# ---- load the six files ----
frames = []
for f in FILES:
    df = pd.read_csv(f"{PNM}/{f}", usecols=["subject", "body", "label"])
    df["subject"] = df["subject"].fillna("").astype(str)
    df["body"] = df["body"].fillna("").astype(str)
    df["label"] = pd.to_numeric(df["label"], errors="coerce")
    df = df.dropna(subset=["label"])
    df["label"] = df["label"].astype(int)
    df["key"] = key_of(df)
    df = df[df["key"].str.len() > 0]
    n0 = len(df)
    df = df[~df["key"].isin(seen)].drop_duplicates("key")
    if len(df) > MAX_PER_SOURCE:
        df = df.sample(MAX_PER_SOURCE, random_state=SEED)
    df["source"] = f.replace(".csv", "")
    print(f"{f:<22} rows {n0:>6} -> kept {len(df):>6} (removed {n0 - len(df)} duplicates or capped)")
    frames.append(df)
data = pd.concat(frames, ignore_index=True)
print(f"TOTAL unseen test emails: {len(data):,}")

print("Computing URL features...")
data = pd.concat([data.reset_index(drop=True),
                  pd.DataFrame([url_features(t) for t in data["key"]])], axis=1)
data["attachment_count"] = 0
data["has_attachments"] = 0
y = data["label"].values

# ---- run both models ----
res = {}
for name, art in [("OLD", OLD_ART), ("NEW", NEW_ART)]:
    model = joblib.load(f"{art}/xgb_phishing_classifier.joblib")
    vec = joblib.load(f"{art}/tfidf_vectorizer.joblib")
    scaler = joblib.load(f"{art}/numeric_scaler.joblib")
    res[name] = model.predict_proba(featurize(data, vec, scaler))[:, 1]

print("\n============ UNSEEN-SOURCE TEST (threshold 0.5) ============")
for name in ["OLD", "NEW"]:
    print(line(f"{name} ALL", summarize(y, (res[name] >= 0.5).astype(int))))
print()
for src in data["source"].unique():
    mk = (data["source"] == src).values
    for name in ["OLD", "NEW"]:
        print(line(f"{name} {src}", summarize(y[mk], (res[name][mk] >= 0.5).astype(int))))

print("\n=== NEW model: threshold table on all unseen emails ===")
print("thr   FPR     recall")
for t in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
    m = summarize(y, (res["NEW"] >= t).astype(int))
    print(f"{t:.2f}  {m['fpr']:.3f}   {m['rec']:.3f}")

fig, axes = plt.subplots(1, 2, figsize=(9, 4))
for ax, name in zip(axes, ["OLD", "NEW"]):
    cm = confusion_matrix(y, (res[name] >= 0.5).astype(int), labels=[0, 1])
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks([0, 1]); ax.set_xticklabels(["Benign", "Phishing/Spam"])
    ax.set_yticks([0, 1]); ax.set_yticklabels(["Benign", "Phishing/Spam"])
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual"); ax.set_title(f"{name} model, unseen sources")
    for i in range(2):
        for j in range(2):
            ax.text(j, i, f"{cm[i, j]:,}", ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
plt.tight_layout()
plt.savefig("confusion_matrix_unseen.png", dpi=200)
print("\nSaved confusion_matrix_unseen.png")