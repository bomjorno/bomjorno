"""Motion energy per frame -> burst/dissolve drivers (same idea as Difference TOP -> Analyze CHOP -> Lag in the TD network)."""
import sys, json, glob, numpy as np
from PIL import Image
frames = sorted(glob.glob(sys.argv[1] + "/*.jpg"))
fps = float(sys.argv[3]) if len(sys.argv) > 3 else 25.0
prev = None; raw = []
for f in frames:
    g = np.asarray(Image.open(f).convert("L").resize((48, 48)), dtype=np.float32) / 255
    raw.append(0.0 if prev is None else float(np.abs(g - prev).mean()))
    prev = g
raw = np.array(raw)
# cut = big spike; camera move = sustained motion. Burst: instant attack, ~0.5s decay.
burst = np.zeros_like(raw); b = 0.0
for i, m in enumerate(raw):
    b = max(b * 0.90, min(1.0, m * 7.0)); burst[i] = b
json.dump({"fps": fps, "burst": burst.round(4).tolist(), "raw": raw.round(4).tolist()}, open(sys.argv[2], "w"))
print(len(raw), "frames; raw max", raw.max().round(3), "mean", raw.mean().round(3), "cuts>0.15:", int((raw > .15).sum()))
