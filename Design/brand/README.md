# Choke! 标识资产

`Design/brand/` 是从 `Choke! [转换].ai`（图标几何与 `Choke!.ai` 一致）整理出来的可直接使用版本。

## 做了什么

原来的 `.ai` 有两个问题：`Choke!.ai` 是 Vector Magic / GNU libplot 导出的 AI5，17 条碎片路径、无分组、画布四周大量空白；`Choke! [转换].ai` 又依赖两个嵌入字体（Torus Pro）。直接丢进网页或设计工具都不好用。

现在统一成：

- **纯路径 SVG**，不再依赖任何字体，双击或 `<img>` 都能正确显示
- **字标换成 Fredoka One**（SIL OFL，可商用），保留「Choke!」，只换字体不动文案
- **按内容裁到紧边界**，没有 704×384 的画布留白
- **拆成 8 个变体**：主标识 / 横版 / 图标 / 字标 / 单色 / 深底
- 补了 **PNG、favicon.ico、apple-touch-icon**
- 配了 `brand-sheet.html` 使用说明页（留白、最小尺寸、色值、代码片段）

> 注：`Choke!.ai` 里的字标是旧名 `osu! TCG`。这里保留图标几何，字标按「Choke!」重排；需要旧字标的话告诉我再出。

## 文件

| 文件 | 用途 |
|---|---|
| `choke-lockup.svg` | 默认主标识（竖版），浅底 |
| `choke-lockup-horizontal.svg` | 导航栏 / 页头，横向空间 |
| `choke-icon.svg` | 图标、头像、加载态、favicon |
| `choke-wordmark.svg` | 只保留字标 |
| `choke-lockup-mono.svg` | 单色，跟随 `currentColor` |
| `choke-icon-mono.svg` | 单色图标 |
| `choke-lockup-light.svg` | 深色底，保留青 / 粉，墨色转浅 |
| `choke-lockup-white.svg` | 深色底，纯白单色 |
| `png/choke-icon-512.png`、`-1024` | 透明底栅格图标 |
| `png/choke-lockup-1200.png` | 透明底主标识 |
| `png/choke-lockup-horizontal-1200.png` | 透明底横版 |
| `png/choke-lockup-light-1200.png` | 深底用（浅色墨） |
| `png/apple-touch-icon-180.png` | iOS 主屏图标（白底 + 安全边距） |
| `favicon.ico` | 16 / 32 / 48 / 64 多尺寸 |
| `brand-sheet.html` | 打开即看的使用说明 / 预览页 |
| `src/page-outlined.svg` | 图标原始描边稿（由 `.ai` 导出） |
| `src/wordmark-choke.svg` | 字标描边稿（Fredoka One，「Choke!」） |
| `src/make-wordmark.py` | 换字体 / 改字标时重新生成描边稿 |
| `build.py` | 重新生成全部资产的脚本 |

## 用哪个

- 页头、导航：`choke-lockup-horizontal.svg`
- 启动页、分享卡、关于页：`choke-lockup.svg`
- favicon、头像、加载动画：`choke-icon.svg`
- 深色 UI：`choke-lockup-light.svg`（要保留品牌色）或 `choke-lockup-white.svg`（纯白）
- 需要跟随按钮文字颜色：内联 `choke-lockup-mono.svg`

## 颜色

| Token | Hex |
|---|---|
| Cyan | `#3CBADB` |
| Pink | `#D9488A` |
| Ink | `#42464F` |
| Light | `#F4F4F6` |

字标在原文件里是纯黑，这里统一成 Ink，避免和图标墨色不一致。

## 尺寸与留白

- 图标最小 **24px**；竖版标识最小 **160px 宽**；横版最小 **200px 宽**
- 四周留白 ≥ 标识总高度的 **22%**
- 图标本身是紧边界裁切：当头像用的时候，容器记得自己加 padding（建议 12%），否则圆角或圆形遮罩会切到卡框

## 代码

```html
<!-- 静态引用 -->
<img src="brand/choke-lockup.svg" alt="Choke!" width="220">

<!-- 深色底 -->
<img src="brand/choke-lockup-light.svg" alt="Choke!" width="220">

<!-- 跟随文字颜色（内联 mono 版做遮罩） -->
<span class="logo" aria-label="Choke!"></span>
<style>
  .logo {
    display: inline-block;
    width: 180px;
    aspect-ratio: 1200 / 2183;   /* 横版用 1200 / 373 */
    background: currentColor;
    -webkit-mask: url("brand/choke-lockup-mono.svg") center / contain no-repeat;
            mask: url("brand/choke-lockup-mono.svg") center / contain no-repeat;
  }
</style>
```

如果页面里可以直接内联 SVG，把 `choke-lockup-mono.svg` 的内容嵌进去，父元素设 `color` 即可。

## 重新生成

```powershell
cd Design/brand
python build.py
```

依赖：`PyMuPDF`、`Pillow`（用 `pip install pymupdf pillow`）。

- 图标源：`src/page-outlined.svg`（由 `.ai` 用 `get_svg_image(text_as_path=True)` 导出）
- 字标源：`src/wordmark-choke.svg`，由 `src/make-wordmark.py` 生成
- 想换字标字体或文案：改 `src/make-wordmark.py` 顶部的 `FONT`，或 `python make-wordmark.py "Choke"` 指定文字，再跑 `build.py`
- 只改颜色 / 间距的话，直接改 `build.py` 顶部的常量（字标高度是图标宽度的 25%，见 `word_target_h`）

## 注意

- 字标使用 **Fredoka One（SIL OFL）**，可商用；已经不再依赖原文件里的 Torus Pro demo 字体。
- PNG 默认透明底；`-light` / `-white` 是给深色背景用的，放在白底上会看不见，这是预期行为。
- 所有 SVG 都没有描边、滤镜、外链资源，可以直接进 Web、Figma、Illustrator、Unity（需要先转 PNG）。
