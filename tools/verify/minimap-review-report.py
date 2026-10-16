#!/usr/bin/env python3
"""P22 小地图复核包：对 minimap-review-shot.mjs 拍到的页面截图做像素级实证 + 2x2 拼盘。

断言（对真实合成后的页面截图，不是 canvas 缓冲）：
  G 隐藏小地图 vs 打开小地图，右下角小地图区域内纯白箭头像素显著增加（>=15px）
  H 驾驶前后，该区域内纯白像素质心发生位移（>=1.0px，箭头真的在动）
  I 2x2 拼盘生成
用法: python3 minimap-review-report.py [shots_dir]
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "shots", "p22-review")

# canvas#minimap: position fixed right:12 bottom:12, 160x160, 视口 1280x720
REGION = (1280 - 12 - 160, 720 - 12 - 160, 1280 - 12, 720 - 12)  # 1108,548,1268,708

fails = 0


def check(name, ok, detail=""):
    global fails
    print(("PASS " if ok else "FAIL ") + name + ((" | " + detail) if detail else ""))
    if not ok:
        fails += 1


def white_stats(path, region=REGION):
    im = Image.open(path).convert("RGB")
    crop = im.crop(region)
    px = crop.load()
    w, h = crop.size
    sx = sy = n = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r > 240 and g > 240 and b > 240:
                sx += x
                sy += y
                n += 1
    return (sx / n, sy / n, n) if n else (None, None, 0)


f01 = os.path.join(D, "01-before-nominimap.png")
f02 = os.path.join(D, "02-after-t0.png")
f03 = os.path.join(D, "03-after-driven.png")

for f in (f01, f02, f03):
    if not os.path.exists(f):
        print("FAIL 缺少截图 " + f)
        sys.exit(1)

x0, y0, n01 = white_stats(f01)
x1, y1, n02 = white_stats(f02)
x2, y2, n03 = white_stats(f03)

check("G 小地图真实合成进页面截图（隐藏→打开，纯白箭头像素显著增加）",
      n02 - n01 >= 15, f"hidden={n01} shown={n02} delta={n02 - n01}")
move = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5 if (x1 is not None and x2 is not None) else -1
check("H 驾驶后页面截图内白像素质心位移（箭头在动）", move >= 1.0,
      f"{move:.2f}px ({x1:.1f},{y1:.1f}) -> ({x2:.1f},{y2:.1f})" if move >= 0 else "no pixels")

# ---------- 2x2 拼盘 ----------
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
except Exception:
    font = ImageFont.load_default(size=22)

items = [
    ("01-before-nominimap.png", "BEFORE: minimap hidden"),
    ("02-after-t0.png", "AFTER: minimap ON (race start)"),
    ("03-after-driven.png", "AFTER: driven (arrow moved)"),
    ("04-closeup-driven.png", "CLOSEUP: minimap"),
]
CELL_W, CELL_H, BAR = 640, 360, 30
grid = Image.new("RGB", (CELL_W * 2, (CELL_H + BAR) * 2), (12, 12, 16))
dr = ImageDraw.Draw(grid)
missing = []
for i, (fn, label) in enumerate(items):
    p = os.path.join(D, fn)
    if not os.path.exists(p):
        missing.append(fn)
        continue
    im = Image.open(p).convert("RGB")
    im.thumbnail((CELL_W, CELL_H))
    gx, gy = (i % 2) * CELL_W, (i // 2) * (CELL_H + BAR)
    grid.paste(im, (gx + (CELL_W - im.width) // 2, gy + BAR))
    dr.text((gx + 8, gy + 4), label, fill=(255, 235, 120), font=font)
out = os.path.join(D, "00-grid.png")
grid.save(out)
check("I 2x2 拼盘生成", os.path.exists(out) and grid.size == (CELL_W * 2, (CELL_H + BAR) * 2) and not missing,
      f"{out} missing={missing}")

print("ALL PASS" if fails == 0 else f"{fails} FAILURES")
sys.exit(1 if fails else 0)
