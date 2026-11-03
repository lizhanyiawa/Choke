"""
Build a usable brand kit from the outlined Choke! logo.

Source: ../page-outlined.svg  (exported from "Choke! [转换].ai" with text outlined)
Output: brand/*.svg, brand/png/*.png, brand/favicon.ico, brand/brand-sheet.html
"""
import math
import os
import re
import struct

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ICON_SRC = os.path.join(HERE, "src", "page-outlined.svg")
WORD_SRC = os.path.join(HERE, "src", "wordmark-choke.svg")
OUT = HERE

CYAN = "#3CBADB"
MAGENTA = "#D9488A"
INK = "#42464F"
LIGHT = "#F4F4F6"

# ---------------------------------------------------------------- path parsing

TOKEN = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)")


def tokenize(d):
    for m in TOKEN.finditer(d):
        yield m.group(1) or float(m.group(2))


def parse_path(d):
    toks = list(tokenize(d))
    i = 0
    cmd = None
    pts = []
    segs = []
    cur = (0.0, 0.0)
    start = cur
    while i < len(toks):
        t = toks[i]
        if isinstance(t, str):
            cmd = t
            i += 1
            if cmd in "Zz":
                segs.append(("Z", ()))
                cur = start
                continue
        if cmd is None:
            raise ValueError("path does not start with a command")
        rel = cmd.islower()
        c = cmd.upper()
        if c == "M":
            x, y = toks[i], toks[i + 1]
            i += 2
            if rel:
                x, y = cur[0] + x, cur[1] + y
            cur = (x, y)
            start = cur
            segs.append(("M", cur))
            cmd = "l" if rel else "L"
        elif c == "L":
            x, y = toks[i], toks[i + 1]
            i += 2
            if rel:
                x, y = cur[0] + x, cur[1] + y
            segs.append(("L", (cur, (x, y))))
            cur = (x, y)
        elif c == "H":
            x = toks[i]
            i += 1
            if rel:
                x = cur[0] + x
            segs.append(("L", (cur, (x, cur[1]))))
            cur = (x, cur[1])
        elif c == "V":
            y = toks[i]
            i += 1
            if rel:
                y = cur[1] + y
            segs.append(("L", (cur, (cur[0], y))))
            cur = (cur[0], y)
        elif c == "C":
            vals = toks[i:i + 6]
            i += 6
            p1 = (vals[0], vals[1])
            p2 = (vals[2], vals[3])
            p3 = (vals[4], vals[5])
            if rel:
                p1 = (cur[0] + p1[0], cur[1] + p1[1])
                p2 = (cur[0] + p2[0], cur[1] + p2[1])
                p3 = (cur[0] + p3[0], cur[1] + p3[1])
            segs.append(("C", (cur, p1, p2, p3)))
            cur = p3
        elif c == "Z":
            segs.append(("Z", ()))
            cur = start
            i += 1
        else:
            raise ValueError(f"unsupported path command {cmd!r}")
        if i < len(toks) and isinstance(toks[i], str) and toks[i] in "Mm" and c != "M":
            pass
    return segs


def apply_matrix(segs, m):
    a, b, c, d, e, f = m

    def pt(p):
        return (a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f)

    out = []
    for op, data in segs:
        if op == "Z":
            out.append(("Z", ()))
        elif op == "M":
            out.append(("M", pt(data)))
        elif op == "L":
            out.append(("L", tuple(pt(p) for p in data)))
        elif op == "C":
            out.append(("C", tuple(pt(p) for p in data)))
    return out


def cubic_extrema(p0, p1, p2, p3):
    # derivative / 3 = a t^2 + b t + c
    a = -p0 + 3 * p1 - 3 * p2 + p3
    b = 2 * p0 - 4 * p1 + 2 * p2
    c = p1 - p0
    ts = []
    if abs(a) < 1e-12:
        if abs(b) > 1e-12:
            ts.append(-c / b)
    else:
        disc = b * b - 4 * a * c
        if disc >= 0:
            sq = math.sqrt(disc)
            ts.extend([(-b + sq) / (2 * a), (-b - sq) / (2 * a)])
    return [t for t in ts if 1e-9 < t < 1 - 1e-9]


def cubic_point(p0, p1, p2, p3, t):
    mt = 1 - t
    return (
        mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0],
        mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1],
    )


def bbox(segs):
    xs, ys = [], []
    for op, data in segs:
        if op == "M":
            xs.append(data[0]); ys.append(data[1])
        elif op == "L":
            for p in data:
                xs.append(p[0]); ys.append(p[1])
        elif op == "C":
            p0, p1, p2, p3 = data
            for p in (p0, p3):
                xs.append(p[0]); ys.append(p[1])
            for t in cubic_extrema(p0[0], p1[0], p2[0], p3[0]):
                q = cubic_point(p0, p1, p2, p3, t); xs.append(q[0]); ys.append(q[1])
            for t in cubic_extrema(p0[1], p1[1], p2[1], p3[1]):
                q = cubic_point(p0, p1, p2, p3, t); xs.append(q[0]); ys.append(q[1])
    return min(xs), min(ys), max(xs), max(ys)


def n(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def to_d(segs):
    parts = []
    for op, data in segs:
        if op == "M":
            parts.append(f"M{n(data[0])} {n(data[1])}")
        elif op == "L":
            parts.append("L" + " ".join(f"{n(p[0])} {n(p[1])}" for p in data[1:]))
        elif op == "C":
            parts.append("C" + " ".join(f"{n(p[0])} {n(p[1])}" for p in data[1:]))
        elif op == "Z":
            parts.append("Z")
    return "".join(parts)


def transform(segs, sx=1, sy=1, dx=0, dy=0):
    return apply_matrix(segs, (sx, 0, 0, sy, dx, dy))


def union(boxes):
    return min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)


# ---------------------------------------------------------------- read source

ICON_SVG = open(ICON_SRC, encoding="utf-8").read()
WORD_SVG = open(WORD_SRC, encoding="utf-8").read()

icon_raw = re.findall(r'<path transform="matrix\(([^)]+)\)" d="([^"]+)" fill="([^"]+)"/>', ICON_SVG)
word_fonts = dict(re.findall(r'<path id="(font_[^"]+)" d="([^"]+)"/>', WORD_SVG))
word_use = re.findall(r'<use data-text="." xlink:href="#(font_[^"]+)" transform="matrix\(([^)]+)\)"/>', WORD_SVG)


def norm_color(fill):
    f = fill.upper()
    return CYAN if f == "#3CBADB" else MAGENTA if f == "#D9488A" else INK


icon_segs = []
for matrix, d, fill in icon_raw:
    m = tuple(float(x) for x in matrix.split(","))
    icon_segs.append((apply_matrix(parse_path(d), m), norm_color(fill)))

word_segs = []
for gid, matrix in word_use:
    m = tuple(float(x) for x in matrix.split(","))
    word_segs.append((apply_matrix(parse_path(word_fonts[gid]), m), INK))

icon_box = union([bbox(s) for s, _ in icon_segs])
word_box = union([bbox(s) for s, _ in word_segs])
print("icon bbox", [round(v, 2) for v in icon_box])
print("word bbox", [round(v, 2) for v in word_box])

# ---------------------------------------------------------------- emit helpers


def emit_svg(paths, box, label, width_attr=True, root_fill=None):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    body = []
    for segs, fill in paths:
        body.append(f'    <path fill="{fill}" d="{to_d(segs)}"/>')
    dims = f' width="{n(w)}" height="{n(h)}"' if width_attr else ""
    root_extra = f' fill="{root_fill}"' if root_fill else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n(w)} {n(h)}"{dims}{root_extra} role="img" aria-label="{label}">\n'
        f"  <title>{label}</title>\n"
        f'  <g transform="translate({n(-x0)} {n(-y0)})">\n'
        + "\n".join(body)
        + "\n  </g>\n</svg>\n"
    )


def write(name, text):
    with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("wrote", name, len(text), "bytes")


def recolor(paths, mapping=None, flat=None):
    out = []
    for segs, fill in paths:
        c = flat or (mapping or {}).get(fill.upper(), fill)
        out.append((segs, c))
    return out


def shift(paths, box):
    dx, dy = -box[0], -box[1]
    return [(transform(segs, dx=dx, dy=dy), fill) for segs, fill in paths]


# ---------------------------------------------------------------- layout

def move(paths, dx, dy):
    return [(transform(segs, dx=dx, dy=dy), fill) for segs, fill in paths]


i_w, i_h = icon_box[2] - icon_box[0], icon_box[3] - icon_box[1]
icon_paths = shift(icon_segs, icon_box)

# wordmark is normalized, then scaled so its cap height is 25% of the icon width
w_raw, h_raw = word_box[2] - word_box[0], word_box[3] - word_box[1]
word_target_h = i_w * 0.25
s_word = word_target_h / h_raw
word_paths = [(transform(segs, sx=s_word, sy=s_word), fill) for segs, fill in shift(word_segs, word_box)]
word_w = w_raw * s_word

# stacked lockup: icon centered, wordmark centered below
gap = i_h * 0.11
lock_w = max(i_w, word_w)
lock_h = i_h + gap + word_target_h
lock_paths = move(icon_paths, (lock_w - i_w) / 2, 0) + move(word_paths, (lock_w - word_w) / 2, i_h + gap)
lock_box = (0, 0, lock_w, lock_h)
write("choke-lockup.svg", emit_svg(lock_paths, lock_box, "Choke"))

# icon only
write("choke-icon.svg", emit_svg(icon_paths, (0, 0, i_w, i_h), "Choke icon"))

# wordmark only
write("choke-wordmark.svg", emit_svg(word_paths, (0, 0, word_w, word_target_h), "Choke wordmark"))

# horizontal lockup: icon height = 1.9 x wordmark, gap = 0.6 x wordmark
h_icon_h = word_target_h * 1.9
s_icon = h_icon_h / i_h
h_icon_w = i_w * s_icon
h_gap = word_target_h * 0.6
h_icon_paths = [(transform(segs, sx=s_icon, sy=s_icon), fill) for segs, fill in icon_paths]
h_word_paths = move(word_paths, h_icon_w + h_gap, (h_icon_h - word_target_h) / 2)
horiz_w = h_icon_w + h_gap + word_w
write("choke-lockup-horizontal.svg", emit_svg(h_icon_paths + h_word_paths, (0, 0, horiz_w, h_icon_h), "Choke"))

# mono (currentColor)
mono = [(segs, "currentColor") for segs, _ in lock_paths]
write("choke-lockup-mono.svg", emit_svg(mono, lock_box, "Choke"))
mono_icon = [(segs, "currentColor") for segs, _ in icon_paths]
write("choke-icon-mono.svg", emit_svg(mono_icon, (0, 0, i_w, i_h), "Choke icon"))

# light-on-dark: ink becomes light, brand colors kept
light = []
for segs, fill in lock_paths:
    light.append((segs, LIGHT if fill.upper() == INK else fill))
write("choke-lockup-light.svg", emit_svg(light, lock_box, "Choke"))

# all-white, for one-color surfaces
white = [(segs, "#FFFFFF") for segs, _ in lock_paths]
write("choke-lockup-white.svg", emit_svg(white, lock_box, "Choke"))

# ---------------------------------------------------------------- raster

import fitz

os.makedirs(os.path.join(OUT, "png"), exist_ok=True)


def render(svg_name, png_name, width):
    doc = fitz.open(os.path.join(OUT, svg_name))
    page = doc[0]
    scale = width / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=True)
    pix.save(os.path.join(OUT, "png", png_name))
    print("rendered", png_name, pix.width, pix.height)


render("choke-icon.svg", "choke-icon-512.png", 512)
render("choke-icon.svg", "choke-icon-1024.png", 1024)
render("choke-lockup.svg", "choke-lockup-1200.png", 1200)
render("choke-lockup-horizontal.svg", "choke-lockup-horizontal-1200.png", 1200)
render("choke-lockup-light.svg", "choke-lockup-light-1200.png", 1200)

# Apple touch icon: opaque white, 10% safe padding (iOS masks the corners itself)
icon_png = Image.open(os.path.join(OUT, "png", "choke-icon-1024.png"))
canvas = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
box = 150
scale = min(box / icon_png.width, box / icon_png.height)
scaled = icon_png.resize((round(icon_png.width * scale), round(icon_png.height * scale)), Image.LANCZOS)
canvas.alpha_composite(scaled, ((180 - scaled.width) // 2, (180 - scaled.height) // 2))
canvas.convert("RGB").save(os.path.join(OUT, "png", "apple-touch-icon-180.png"))
print("rendered apple-touch-icon-180.png (white, padded)")

ico = Image.open(os.path.join(OUT, "png", "choke-icon-512.png"))
ico.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("wrote favicon.ico")

# ---------------------------------------------------------------- brand sheet

logo_w = lock_box[2] - lock_box[0]
logo_h = lock_box[3] - lock_box[1]
clear_pad = logo_h * 0.22 * 170 / logo_w

sheet = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Choke! 品牌资产</title>
<style>
  :root {{ --ink:#42464F; --cyan:#3CBADB; --pink:#D9488A; --line:#E4E4E8; --dim:#6E6E7A; --bg:#F7F7F8; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.7 "Inter","Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif; }}
  .wrap {{ max-width:1160px; margin:0 auto; padding:0 40px; }}
  header {{ padding:72px 0 40px; }}
  .kicker {{ font:11px/1 ui-monospace,Consolas,monospace; letter-spacing:.2em; text-transform:uppercase; color:var(--pink); }}
  h1 {{ font-size:clamp(36px,5vw,60px); letter-spacing:-.04em; line-height:1; margin:16px 0 14px; }}
  .lede {{ margin:0; max-width:640px; color:var(--dim); }}
  section {{ border-top:1px solid var(--line); padding:40px 0; }}
  h2 {{ font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--dim); margin:0 0 24px; font-weight:600; }}
  .hero {{ background:#fff; border:1px solid var(--line); border-radius:10px; display:grid; place-items:center; padding:72px 40px; }}
  .hero img {{ width:220px; height:auto; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; }}
  .tile {{ background:#fff; border:1px solid var(--line); border-radius:8px; padding:28px; display:flex; flex-direction:column; gap:18px; min-height:190px; }}
  .tile .label {{ margin-top:auto; font:11px/1.4 ui-monospace,Consolas,monospace; color:var(--dim); }}
  .tile img {{ max-width:100%; max-height:96px; width:auto; align-self:center; margin:auto 0; }}
  .dark {{ background:#111114; border-color:#232329; }}
  .dark .label {{ color:#8A8A96; }}
  .dark img {{ max-height:120px; }}
  .swatches {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }}
  .sw {{ border-radius:8px; overflow:hidden; border:1px solid var(--line); background:#fff; }}
  .sw .chip {{ height:82px; }}
  .sw .meta {{ padding:12px 14px; font:12px/1.6 ui-monospace,Consolas,monospace; }}
  .sw .meta b {{ display:block; font:600 13px/1.4 "Inter","Segoe UI",sans-serif; font-family:inherit; }}
  .notes {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:28px; }}
  .note h3 {{ margin:0 0 8px; font-size:15px; }}
  .note p {{ margin:0; color:var(--dim); font-size:13.5px; }}
  code {{ font:12px/1.6 ui-monospace,Consolas,monospace; background:#EEEEF1; padding:2px 6px; border-radius:4px; }}
  pre {{ background:#16161A; color:#E8E8EE; padding:18px 20px; border-radius:8px; overflow:auto; font:12px/1.7 ui-monospace,Consolas,monospace; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  th,td {{ text-align:left; padding:10px 8px; border-bottom:1px solid var(--line); }}
  th {{ font:600 11px/1 ui-monospace,Consolas,monospace; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); }}
  td code {{ background:none; padding:0; color:var(--ink); }}
  .clear-space {{ position:relative; background:#fff; border:1px solid var(--line); border-radius:8px; padding:{clear_pad:.0f}px; display:inline-block; }}
  .clear-space::before {{ content:""; position:absolute; inset:{clear_pad:.0f}px; border:1px dashed var(--pink); border-radius:4px; }}
  .clear-space img {{ width:170px; display:block; }}
  footer {{ padding:32px 0 72px; color:var(--dim); font-size:12px; }}
  @media (max-width:700px) {{ .wrap {{ padding:0 20px; }} }}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="kicker">Brand assets / v1</div>
    <h1>Choke! 标识资产</h1>
    <p class="lede">全部为纯路径 SVG，不依赖字体、无背景、已裁到内容边界。直接 <code>&lt;img&gt;</code> 或内联即可用；深色界面用 <code>-light</code> 或 <code>-white</code>。</p>
  </header>

  <section>
    <h2>主标识</h2>
    <div class="hero"><img src="choke-lockup.svg" alt="Choke! 主标识"></div>
  </section>

  <section>
    <h2>组合</h2>
    <div class="grid">
      <div class="tile"><img src="choke-lockup-horizontal.svg" alt="横版"><div class="label">choke-lockup-horizontal.svg</div></div>
      <div class="tile"><img src="choke-icon.svg" alt="图标"><div class="label">choke-icon.svg</div></div>
      <div class="tile"><img src="choke-wordmark.svg" alt="字标"><div class="label">choke-wordmark.svg</div></div>
      <div class="tile"><img src="choke-lockup-mono.svg" alt="单色"><div class="label">choke-lockup-mono.svg · currentColor</div></div>
    </div>
  </section>

  <section>
    <h2>深色界面</h2>
    <div class="grid">
      <div class="tile dark"><img src="choke-lockup-light.svg" alt="深底彩色"><div class="label">choke-lockup-light.svg</div></div>
      <div class="tile dark"><img src="choke-lockup-white.svg" alt="纯白"><div class="label">choke-lockup-white.svg</div></div>
      <div class="tile dark" style="background:#0A0A0C"><img src="choke-lockup.svg" alt="原色在深底"><div class="label">原色直接放深底（墨色会吃掉，需换版）</div></div>
    </div>
  </section>

  <section>
    <h2>颜色</h2>
    <div class="swatches">
      <div class="sw"><div class="chip" style="background:{CYAN}"></div><div class="meta"><b>Cyan</b>{CYAN}</div></div>
      <div class="sw"><div class="chip" style="background:{MAGENTA}"></div><div class="meta"><b>Pink</b>{MAGENTA}</div></div>
      <div class="sw"><div class="chip" style="background:{INK}"></div><div class="meta"><b>Ink</b>{INK}</div></div>
      <div class="sw"><div class="chip" style="background:{LIGHT};border-bottom:1px solid var(--line)"></div><div class="meta"><b>Light</b>{LIGHT}</div></div>
    </div>
  </section>

  <section>
    <h2>留白与最小尺寸</h2>
    <div class="notes">
      <div class="note">
        <h3>安全边距</h3>
        <p>四周至少留出标识总高度的 22%（虚线区域）。不要在边距内放文字、边框或其他元素。</p>
      </div>
      <div class="note">
        <h3>最小尺寸</h3>
        <p>图标 ≥ 24px；堆叠标识 ≥ 160px 宽；横版 ≥ 200px 宽。更小就只用图标。</p>
      </div>
      <div class="note">
        <h3>不要做</h3>
        <p>不要拉伸、描边、加投影、改渐变，或把墨色部分单独换成其他颜色。</p>
      </div>
    </div>
    <div style="margin-top:28px">
      <div class="clear-space"><img src="choke-lockup.svg" alt="留白示意"></div>
    </div>
  </section>

  <section>
    <h2>用法</h2>
    <pre>&lt;!-- 直接引用（推荐给静态页面） --&gt;
&lt;img src="brand/choke-lockup.svg" alt="Choke!" width="220"&gt;

&lt;!-- 需要跟随文字颜色时：内联 + currentColor --&gt;
&lt;svg class="logo"&gt;…choke-lockup-mono.svg 的内容…&lt;/svg&gt;
&lt;style&gt;.logo {{ color: #fff; width: 180px; height: auto; }}&lt;/style&gt;

&lt;!-- 深色底 --&gt;
&lt;img src="brand/choke-lockup-light.svg" alt="Choke!" width="220"&gt;</pre>
  </section>

  <section>
    <h2>文件</h2>
    <table>
      <tr><th>文件</th><th>用途</th></tr>
      <tr><td><code>choke-lockup.svg</code></td><td>默认主标识，浅底</td></tr>
      <tr><td><code>choke-lockup-horizontal.svg</code></td><td>导航栏 / 页头，横向空间</td></tr>
      <tr><td><code>choke-icon.svg</code></td><td>图标、头像、加载态</td></tr>
      <tr><td><code>choke-wordmark.svg</code></td><td>只保留字标</td></tr>
      <tr><td><code>choke-lockup-mono.svg</code></td><td>单色，跟随 <code>currentColor</code></td></tr>
      <tr><td><code>choke-icon-mono.svg</code></td><td>单色图标</td></tr>
      <tr><td><code>choke-lockup-light.svg</code></td><td>深色底，保留青/粉</td></tr>
      <tr><td><code>choke-lockup-white.svg</code></td><td>深色底，纯白单色</td></tr>
      <tr><td><code>png/</code>、<code>favicon.ico</code></td><td>栅格、社交头像、浏览器图标</td></tr>
    </table>
  </section>

  <footer>
    字标使用 Fredoka One（SIL OFL，可商用）轮廓化；图标几何来自原 Vector Magic 输出。
  </footer>
</div>
</body>
</html>
"""
write("brand-sheet.html", sheet)
print("done")
