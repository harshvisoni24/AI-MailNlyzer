import pandas as pd

val = pd.read_parquet("data/meajor/splits/val_with_preds.parquet")
test = pd.read_parquet("data/meajor/splits/test_with_preds.parquet")

def rates(d, t):
    ham, bad = d[d["label"] == 0], d[d["label"] == 1]
    return (ham["prob"] >= t).mean(), (bad["prob"] >= t).mean()

for name, d in [("VALIDATION", val), ("TEST", test)]:
    print("\n" + name)
    print("thr   all_FPR all_recall | en_FPR en_recall | en;en_FPR en;en_recall")
    for t in [0.5, 0.6, 0.7, 0.8, 0.9]:
        a = rates(d, t)
        e = rates(d[d["language"] == "en"], t)
        g = rates(d[d["language"] == "en;en"], t)
        print(f"{t:.2f}  {a[0]:.3f}   {a[1]:.3f}      | {e[0]:.3f}  {e[1]:.3f}     | {g[0]:.3f}       {g[1]:.3f}")