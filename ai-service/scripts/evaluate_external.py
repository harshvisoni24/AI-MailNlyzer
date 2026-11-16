import re
from urllib.parse import urlparse

import joblib
import matplotlib
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix

from evaluate_test import featurize, metrics

matplotlib.use("Agg")
import matplotlib.pyplot as plt

ARCH = "data/human_llm_emails"
ART = "app/ml/artifacts"
SPLITS = "data/meajor/splits"

URL_RE = re.compile(
    r"(?:https?://|www\.)[^\s<>\"']+"
    r"|(?<![@\w.-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|biz|ru|in|co|io|xyz|top|club|online|site)\b[^\s<>\"']*",
    re.I,
)


def url_features(text):
    urls = [u.rstrip(".,;:!?)") for u in URL_RE.findall(text or "")]
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


def read_human(path):
    df = pd.read_csv(path)
    return pd.DataFrame({"subject": df["subject"].fillna("").astype(str),
                         "body": df["body"].fillna("").astype(str)})


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


groups = [
    ("human_legit", read_human(f"{ARCH}/human-generated/legit.csv"), 0),
    ("human_phish", read_human(f"{ARCH}/human-generated/phishing.csv"), 1),
    ("llm_legit", read_llm(f"{ARCH}/llm-generated/legit.csv"), 0),
    ("llm_phish", read_llm(f"{ARCH}/llm-generated/phishing.csv"), 1),
]
frames = []
for name, df, label in groups:
    df = df.copy()
    df["group"] = name
    df["label"] = label
    frames.append(df)
data = pd.concat(frames, ignore_index=True)


def make_key(d):
    return (d["subject"].fillna("") + " " + d["body"].fillna("")).str.strip()


seen = set()
for s in ["train", "val", "test"]:
    seen |= set(make_key(pd.read_parquet(f"{SPLITS}/{s}.parquet", columns=["subject", "body"])))
data["key"] = make_key(data)
before = len(data)
data = data[~data["key"].isin(seen)].drop_duplicates("key").reset_index(drop=True)
print(f"Rows loaded: {before}, after removing training duplicates: {len(data)}")
print(data["group"].value_counts().to_string())

feats = pd.DataFrame([url_features(t) for t in data["key"]])
data = pd.concat([data, feats], axis=1)
data["attachment_count"] = 0
data["has_attachments"] = 0

model = joblib.load(f"{ART}/xgb_phishing_classifier.joblib")
vectorizer = joblib.load(f"{ART}/tfidf_vectorizer.joblib")
scaler = joblib.load(f"{ART}/numeric_scaler.joblib")

X = featurize(data, vectorizer, scaler)
y = data["label"].values
pred = model.predict(X)


def report(title, mask):
    m = metrics(y[mask], pred[mask])
    print(f"\n=== {title} (n={int(mask.sum())}) ===")
    print(f"TP={m['TP']} FP={m['FP']} FN={m['FN']} TN={m['TN']}")
    print(f"Precision={m['precision']:.4f}  Recall={m['recall']:.4f}  F1={m['f1']:.4f}  FPR={m['fpr']:.4f}")


is_llm = data["group"].str.startswith("llm").values
report("ALL external emails", np.ones(len(data), dtype=bool))
report("Human-written only", ~is_llm)
report("LLM-written only", is_llm)

print("\n=== Correct rate per group ===")
for g in data["group"].unique():
    mk = (data["group"] == g).values
    print(f"{g:<14} n={int(mk.sum()):>5}  correct={(pred[mk] == y[mk]).mean():.3f}")

fig, axes = plt.subplots(1, 3, figsize=(12, 4))
for ax, (title, mk) in zip(axes, [("All", np.ones(len(data), dtype=bool)),
                                  ("Human-written", ~is_llm), ("LLM-written", is_llm)]):
    cm = confusion_matrix(y[mk], pred[mk], labels=[0, 1])
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks([0, 1]); ax.set_xticklabels(["Benign", "Phishing"])
    ax.set_yticks([0, 1]); ax.set_yticklabels(["Benign", "Phishing"])
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual"); ax.set_title(title)
    for i in range(2):
        for j in range(2):
            ax.text(j, i, f"{cm[i, j]:,}", ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
plt.tight_layout()
plt.savefig("confusion_matrix_external.png", dpi=200)
print("\nSaved confusion_matrix_external.png")