#!/usr/bin/env python3
# P23 目视复核包像素实证（配套 characters-review-shot.mjs）。
# 对每张特写数"特征色"像素：车身主色 + 特征部件色（皇冠金/背鞍红/尖刺壳白骨锥/鬃毛红/橙盔）。
# 光照下 MeshStandard 颜色会偏移，容差放宽；本脚本是辅助实证，最终验收以监工目视为准。
import sys
from PIL import Image

ROOT = "/home/hatch/workspace/mario-kart-3d/shots/p23-review"

def near(px, c, tol):
    return all(abs(px[i] - c[i]) <= tol for i in range(3))

def count(path, tests):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    cnt = {k: 0 for k in tests}
    for y in range(0, h, 2):           # 2px 采样（与 P23 PIL 先例一致）
        for x in range(0, w, 2):
            px = im.getpixel((x, y))
            for k, (c, tol, extra) in tests.items():
                if near(px, c, tol) and (extra is None or extra(px)):
                    cnt[k] += 1
    return cnt, (w, h)

SPECS = [
    ("02-closeup-mario.png",  {"red_body":  ((255, 51, 51), 45, None)}),
    ("03-closeup-peach.png",  {"pink_body": ((255, 143, 200), 40, None),
                               "gold_crown": ((255, 215, 0), 50, lambda p: p[0] > p[2])}),
    ("04-closeup-dino.png",   {"green_body": ((51, 187, 68), 38, None),
                               "red_saddle": ((221, 34, 34), 45, None)}),
    ("05-closeup-bowser.png", {"orange_helmet": ((245, 166, 35), 50, None),
                               "red_mane": ((204, 34, 0), 50, None),
                               "bone_spike": ((242, 236, 216), 30, lambda p: p[0] >= p[2] + 10)}),
    ("06-lineup-close.png",   {"pink_body": ((255, 143, 200), 40, None),
                               "green_body": ((51, 187, 68), 38, None),
                               "red_body": ((255, 51, 51), 45, None),
                               "orange_helmet": ((245, 166, 35), 50, None)}),
]

fails = 0
for name, tests in SPECS:
    cnt, size = count(f"{ROOT}/{name}", tests)
    line = " ".join(f"{k}={v}" for k, v in cnt.items())
    print(f"{name} ({size[0]}x{size[1]}): {line}")
    for k, v in cnt.items():
        if v < 6:
            print(f"  WARN {k} 只有 {v} 个采样像素（<6），特征色可能未渲染，请目视复核")
            fails += 1
print("SUMMARY:", "ALL COLORS PRESENT" if fails == 0 else f"{fails} color(s) suspicious")
sys.exit(0 if fails == 0 else 1)
