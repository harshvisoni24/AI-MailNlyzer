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

PNM = "data/phish_no_more"
HLE = "data/human_llm_emails"
SPLITS = "data/meajor/splits"
OLD_ART = "app/ml/artifacts"
V2_ART = "app/ml/artifacts_v2"
NEW_ART = "app/ml/artifacts_v3"
FILES = ["CEAS_08.csv", "Enron.csv", "Ling.csv", "Nazario.csv", "Nigerian_Fraud.csv", "SpamAssasin.csv"]
HOLDOUT = "SpamAssasin"   # this whole source is never used for training
MAX_PER_SOURCE = 8000
HLE_WEIGHT = 4.0
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


def prep(df):
    df = df.reset_index(drop=True)
    feats = pd.DataFrame([url_features(t) for t in df["key"]])
    df = pd.concat([df, feats], axis=1)
    df["attachment_count"] = 0
    df["has_attachments"] = 0
    return df


def split_groups(df, col, frac_test, frac_val, rng):
    df["split"] = "train"
    for g, idx in df.groupby(col).groups.items():
        idx = rng.permutation(np.array(list(idx)))
        n = len(idx)
        nt, nv = int(n * frac_test), int(n * frac_val)
        df.loc[idx[:nt], "split"] = "test"
        df.loc[idx[nt:nt + nv], "split"] = "val"
    return df


def featurize(df, vec, scaler, fit=False):
    text = (df["subject"].fillna("") + " " + df["body"].fillna("")).str.slice(0, 20000)
    if fit:
        tfidf = vec.fit_transform(text)
        num = scaler.fit_transform(df[NUMERIC_FEATURES].values)
    else:
        tfidf = vec.transform(text)
        num = scaler.transform(df[NUMERIC_FEATURES].values)
    return hstack([tfidf, csr_matrix(num)]).tocsr()


def summarize(y, pred):
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    fpr = fp / (fp + tn) if (fp + tn) else float("nan")
    return dict(TP=tp, FP=fp, FN=fn, TN=tn, prec=prec, rec=rec, f1=f1, fpr=fpr)


def line(name, m):
    return (f"{name:<38} TP={m['TP']:<6} FP={m['FP']:<6} FN={m['FN']:<6} TN={m['TN']:<6} "
            f"prec={m['prec']:.3f} rec={m['rec']:.3f} F1={m['f1']:.3f} FPR={m['fpr']:.3f}")


rng = np.random.RandomState(SEED)

# ---------- TREC (existing splits) ----------
trec_train = pd.read_parquet(f"{SPLITS}/train.parquet")
trec_val = pd.read_parquet(f"{SPLITS}/val.parquet")
trec_test = pd.read_parquet(f"{SPLITS}/test.parquet").reset_index(drop=True)
seen = set()
for d in (trec_train, trec_val, trec_test):
    seen |= set(key_of(d))

# ---------- Human-LLM emails ----------
parts = []
for name, df, label in [
    ("human_legit", read_human(f"{HLE}/human-generated/legit.csv"), 0),
    ("human_phish", read_human(f"{HLE}/human-generated/phishing.csv"), 1),
    ("llm_legit", read_llm(f"{HLE}/llm-generated/legit.csv"), 0),
    ("llm_phish", read_llm(f"{HLE}/llm-generated/phishing.csv"), 1),
]:
    df = df.copy()
    df["group"] = name
    df["label"] = label
    parts.append(df)
hle = pd.concat(parts, ignore_index=True)
hle["key"] = key_of(hle)
hle_keys_all = set(hle["key"])
hle = hle[~hle["key"].isin(seen)].drop_duplicates("key")
hle = prep(hle)
hle = split_groups(hle, "group", 0.30, 0.10, rng)
seen |= hle_keys_all

# ---------- Phish No More ----------
parts = []
for f in FILES:
    df = pd.read_csv(f"{PNM}/{f}", usecols=["subject", "body", "label"])
    df["subject"] = df["subject"].fillna("").astype(str)
    df["body"] = df["body"].fillna("").astype(str)
    df["label"] = pd.to_numeric(df["label"], errors="coerce")
    df = df.dropna(subset=["label"])
    df["label"] = df["label"].astype(int)
    df["key"] = key_of(df)
    df = df[df["key"].str.len() > 0]
    df = df[~df["key"].isin(seen)].drop_duplicates("key")
    if len(df) > MAX_PER_SOURCE:
        df = df.sample(MAX_PER_SOURCE, random_state=SEED)
    df["source"] = f.replace(".csv", "")
    print(f"{f:<22} kept {len(df):>6}")
    parts.append(df)
pnm = prep(pd.concat(parts, ignore_index=True))
holdout = pnm[pnm["source"] == HOLDOUT].reset_index(drop=True)
pnm_rest = pnm[pnm["source"] != HOLDOUT].reset_index(drop=True)
pnm_rest = split_groups(pnm_rest, "source", 0.20, 0.10, rng)
print(f"Held-out unseen source {HOLDOUT}: {len(holdout)} emails")

# ---------- combined training data ----------
hle_tr, hle_va, hle_te = [hle[hle["split"] == s].reset_index(drop=True) for s in ("train", "val", "test")]
pn_tr, pn_va, pn_te = [pnm_rest[pnm_rest["split"] == s].reset_index(drop=True) for s in ("train", "val", "test")]
train_df = pd.concat([trec_train[COLS], hle_tr[COLS], pn_tr[COLS]], ignore_index=True)
val_df = pd.concat([trec_val[COLS], hle_va[COLS], pn_va[COLS]], ignore_index=True)
w_train = np.concatenate([np.ones(len(trec_train)), np.full(len(hle_tr), HLE_WEIGHT), np.ones(len(pn_tr))])
w_val = np.concatenate([np.ones(len(trec_val)), np.full(len(hle_va), HLE_WEIGHT), np.ones(len(pn_va))])
print(f"Training rows: {len(train_df):,}   validation rows: {len(val_df):,}")

vec = TfidfVectorizer(max_features=50000, ngram_range=(1, 2), min_df=3, sublinear_tf=True)
scaler = StandardScaler()
print("Vectorizing...")
X_train = featurize(train_df, vec, scaler, fit=True)
X_val = featurize(val_df, vec, scaler)
print("Training XGBoost (about 10 to 25 minutes, close Chrome)...")
model = XGBClassifier(n_estimators=400, max_depth=6, learning_rate=0.08, subsample=0.9,
                      colsample_bytree=0.9, eval_metric="logloss", n_jobs=-1)
model.fit(X_train, train_df["label"].values, sample_weight=w_train,
          eval_set=[(X_val, val_df["label"].values)], sample_weight_eval_set=[w_val], verbose=False)

# ---------- evaluate OLD vs V2 vs V3 ----------
models = {}
for tag, art in [("OLD", OLD_ART), ("V2", V2_ART)]:
    models[tag] = (joblib.load(f"{art}/xgb_phishing_classifier.joblib"),
                   joblib.load(f"{art}/tfidf_vectorizer.joblib"),
                   joblib.load(f"{art}/numeric_scaler.joblib"))
models["V3"] = (model, vec, scaler)

sets = {
    "TREC test": trec_test,
    "HumanLLM test": hle_te,
    "PhishNoMore test (seen sources)": pn_te,
    f"UNSEEN source {HOLDOUT}": holdout,
}
P = {}
print("\n================ OLD vs V2 vs V3 (threshold 0.5) ================")
for sname, df in sets.items():
    y = df["label"].astype(int).values
    for mname, (m, v, s) in models.items():
        P[(sname, mname)] = m.predict_proba(featurize(df, v, s))[:, 1]
        print(line(f"{mname} {sname}", summarize(y, (P[(sname, mname)] >= 0.5).astype(int))))
    print()

print("=== V3 per source (Phish No More test part) ===")
for src in pn_te["source"].unique():
    mk = (pn_te["source"] == src).values
    y = pn_te["label"].astype(int).values[mk]
    p = P[("PhishNoMore test (seen sources)", "V3")][mk]
    print(line(f"V3 {src}", summarize(y, (p >= 0.5).astype(int))))

print("\n=== V3 threshold table (FPR / recall) ===")
names = list(sets.keys())
print("thr   " + " | ".join(f"{n[:22]:<22}" for n in names))
for t in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
    cells = []
    for sname in names:
        y = sets[sname]["label"].astype(int).values
        m = summarize(y, (P[(sname, "V3")] >= t).astype(int))
        cells.append(f"FPR {m['fpr']:.3f} rec {m['rec']:.3f}  ")
    print(f"{t:.2f}  " + " | ".join(cells))

fig, axes = plt.subplots(1, 2, figsize=(9, 4))
for ax, sname in zip(axes, ["TREC test", f"UNSEEN source {HOLDOUT}"]):
    y = sets[sname]["label"].astype(int).values
    cm = confusion_matrix(y, (P[(sname, "V3")] >= 0.5).astype(int), labels=[0, 1])
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks([0, 1]); ax.set_xticklabels(["Benign", "Phishing/Spam"])
    ax.set_yticks([0, 1]); ax.set_yticklabels(["Benign", "Phishing/Spam"])
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual"); ax.set_title(f"V3: {sname}", fontsize=9)
    for i in range(2):
        for j in range(2):
            ax.text(j, i, f"{cm[i, j]:,}", ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
plt.tight_layout()
plt.savefig("confusion_matrix_v3.png", dpi=200)

os.makedirs(NEW_ART, exist_ok=True)
joblib.dump(model, f"{NEW_ART}/xgb_phishing_classifier.joblib")
joblib.dump(vec, f"{NEW_ART}/tfidf_vectorizer.joblib")
joblib.dump(scaler, f"{NEW_ART}/numeric_scaler.joblib")
with open(f"{NEW_ART}/metadata.json", "w") as f:
    json.dump({"numeric_features": NUMERIC_FEATURES, "holdout_source": HOLDOUT,
               "train_rows": len(train_df), "val_rows": len(val_df),
               "sources": "MeAJOR (TREC) + Human-LLM emails + Phish No More (CEAS, Enron, Ling, Nazario, Nigerian Fraud)"},
              f, indent=2)
print(f"\nSaved V3 model to {NEW_ART} and confusion_matrix_v3.png")
