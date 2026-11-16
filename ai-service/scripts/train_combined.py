import json
import os
import re
from urllib.parse import urlparse

import joblib
import matplotlib
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import confusion_matrix
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

matplotlib.use("Agg")
import matplotlib.pyplot as plt

ARCH = "data/human_llm_emails"
SPLITS = "data/meajor/splits"
OLD_ART = "app/ml/artifacts"
NEW_ART = "app/ml/artifacts_v2"
EXT_WEIGHT = 4.0  # how much more each external email counts in training
SEED = 42

NUMERIC_FEATURES = ["url_count", "url_length_max", "url_length_avg", "url_subdom_max",
                    "url_subdom_avg", "attachment_count", "has_attachments"]
COLS = ["subject", "body"] + NUMERIC_FEATURES + ["label"]

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


def text_col(df):
    return (df["subject"].fillna("") + " " + df["body"].fillna("")).str.slice(0, 20000)


def featurize(df, vec, scaler, fit=False):
    if fit:
        tfidf = vec.fit_transform(text_col(df))
        num = scaler.fit_transform(df[NUMERIC_FEATURES].values)
    else:
        tfidf = vec.transform(text_col(df))
        num = scaler.transform(df[NUMERIC_FEATURES].values)
    return hstack([tfidf, csr_matrix(num)]).tocsr()


def probs(model, vec, scaler, df):
    return model.predict_proba(featurize(df, vec, scaler))[:, 1]


def summarize(y, p, thr=0.5):
    pred = (p >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    fpr = fp / (fp + tn) if (fp + tn) else float("nan")
    return dict(TP=tp, FP=fp, FN=fn, TN=tn, prec=prec, rec=rec, f1=f1, fpr=fpr)


def line(name, m):
    return (f"{name:<28} TP={m['TP']:<5} FP={m['FP']:<5} FN={m['FN']:<5} TN={m['TN']:<5} "
            f"prec={m['prec']:.3f} rec={m['rec']:.3f} F1={m['f1']:.3f} FPR={m['fpr']:.3f}")


# ---------- load TREC (your existing splits) ----------
trec_train = pd.read_parquet(f"{SPLITS}/train.parquet")
trec_val = pd.read_parquet(f"{SPLITS}/val.parquet")
trec_test = pd.read_parquet(f"{SPLITS}/test.parquet").reset_index(drop=True)

# ---------- load external data ----------
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
ext = pd.concat(frames, ignore_index=True)

ext["key"] = (ext["subject"] + " " + ext["body"]).str.strip()
seen = set()
for d in (trec_train, trec_val, trec_test):
    seen |= set((d["subject"].fillna("") + " " + d["body"].fillna("")).str.strip())
ext = ext[~ext["key"].isin(seen)].drop_duplicates("key").reset_index(drop=True)
ext = pd.concat([ext, pd.DataFrame([url_features(t) for t in ext["key"]])], axis=1)
ext["attachment_count"] = 0
ext["has_attachments"] = 0

# ---------- split external data per group: 60% train / 10% val / 30% test ----------
rng = np.random.RandomState(SEED)
ext["split"] = "train"
for g, idx in ext.groupby("group").groups.items():
    idx = rng.permutation(np.array(list(idx)))
    n = len(idx)
    n_test, n_val = int(n * 0.30), int(n * 0.10)
    ext.loc[idx[:n_test], "split"] = "test"
    ext.loc[idx[n_test:n_test + n_val], "split"] = "val"
ext_train = ext[ext["split"] == "train"].reset_index(drop=True)
ext_val = ext[ext["split"] == "val"].reset_index(drop=True)
ext_test = ext[ext["split"] == "test"].reset_index(drop=True)
print(f"External rows: train {len(ext_train)}, val {len(ext_val)}, test {len(ext_test)}")

# ---------- combined training data ----------
train_df = pd.concat([trec_train[COLS], ext_train[COLS]], ignore_index=True)
val_df = pd.concat([trec_val[COLS], ext_val[COLS]], ignore_index=True)
w_train = np.concatenate([np.ones(len(trec_train)), np.full(len(ext_train), EXT_WEIGHT)])
w_val = np.concatenate([np.ones(len(trec_val)), np.full(len(ext_val), EXT_WEIGHT)])

vec = TfidfVectorizer(max_features=50000, ngram_range=(1, 2), min_df=3, sublinear_tf=True)
scaler = StandardScaler()
print("Vectorizing...")
X_train = featurize(train_df, vec, scaler, fit=True)
X_val = featurize(val_df, vec, scaler)

print("Training XGBoost (this takes a few minutes)...")
model = XGBClassifier(n_estimators=400, max_depth=6, learning_rate=0.08, subsample=0.9,
                      colsample_bytree=0.9, eval_metric="logloss", n_jobs=-1)
model.fit(X_train, train_df["label"].values, sample_weight=w_train,
          eval_set=[(X_val, val_df["label"].values)], sample_weight_eval_set=[w_val], verbose=False)

# ---------- compare OLD vs NEW on held-out sets ----------
old_model = joblib.load(f"{OLD_ART}/xgb_phishing_classifier.joblib")
old_vec = joblib.load(f"{OLD_ART}/tfidf_vectorizer.joblib")
old_scaler = joblib.load(f"{OLD_ART}/numeric_scaler.joblib")

y_trec = trec_test["label"].astype(int).values
y_ext = ext_test["label"].astype(int).values
is_llm = ext_test["group"].str.startswith("llm").values
p_old_trec = probs(old_model, old_vec, old_scaler, trec_test)
p_new_trec = probs(model, vec, scaler, trec_test)
p_old_ext = probs(old_model, old_vec, old_scaler, ext_test)
p_new_ext = probs(model, vec, scaler, ext_test)

print("\n================ OLD vs NEW (threshold 0.5) ================")
print(line("OLD  TREC test", summarize(y_trec, p_old_trec)))
print(line("NEW  TREC test", summarize(y_trec, p_new_trec)))
all_ext = np.ones(len(ext_test), dtype=bool)
for title, mk in [("external ALL", all_ext), ("external human", ~is_llm), ("external LLM", is_llm)]:
    print(line("OLD  " + title, summarize(y_ext[mk], p_old_ext[mk])))
    print(line("NEW  " + title, summarize(y_ext[mk], p_new_ext[mk])))

print("\n=== NEW model, correct rate per external group ===")
for g in sorted(ext_test["group"].unique()):
    mk = (ext_test["group"] == g).values
    pred = (p_new_ext[mk] >= 0.5).astype(int)
    print(f"{g:<14} n={int(mk.sum()):>5}  correct={(pred == y_ext[mk]).mean():.3f}")

print("\n=== NEW model: threshold table (FPR / recall) ===")
print("thr   TREC_FPR TREC_rec | EXT_FPR EXT_rec")
for t in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
    a = summarize(y_trec, p_new_trec, t)
    b = summarize(y_ext, p_new_ext, t)
    print(f"{t:.2f}  {a['fpr']:.3f}    {a['rec']:.3f}    | {b['fpr']:.3f}   {b['rec']:.3f}")

# ---------- picture ----------
fig, axes = plt.subplots(1, 2, figsize=(9, 4))
for ax, (title, y, p) in zip(axes, [("TREC test (new model)", y_trec, p_new_trec),
                                    ("External test (new model)", y_ext, p_new_ext)]):
    cm = confusion_matrix(y, (p >= 0.5).astype(int), labels=[0, 1])
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks([0, 1]); ax.set_xticklabels(["Benign", "Phishing"])
    ax.set_yticks([0, 1]); ax.set_yticklabels(["Benign", "Phishing"])
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual"); ax.set_title(title)
    for i in range(2):
        for j in range(2):
            ax.text(j, i, f"{cm[i, j]:,}", ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
plt.tight_layout()
plt.savefig("confusion_matrix_v2.png", dpi=200)

# ---------- save new model in a SEPARATE folder ----------
os.makedirs(NEW_ART, exist_ok=True)
joblib.dump(model, f"{NEW_ART}/xgb_phishing_classifier.joblib")
joblib.dump(vec, f"{NEW_ART}/tfidf_vectorizer.joblib")
joblib.dump(scaler, f"{NEW_ART}/numeric_scaler.joblib")
with open(f"{NEW_ART}/metadata.json", "w") as f:
    json.dump({"numeric_features": NUMERIC_FEATURES, "ext_weight": EXT_WEIGHT,
               "train_rows": len(train_df), "val_rows": len(val_df),
               "sources": "MeAJOR (TREC) + Human-LLM phishing/legit emails"}, f, indent=2)
print(f"\nSaved new model to {NEW_ART} and confusion_matrix_v2.png")