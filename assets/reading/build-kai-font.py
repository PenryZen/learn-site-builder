#!/usr/bin/env python3
"""生成 kai-font.css：把系统楷体子集化后以 base64 内嵌。

为什么要内嵌：Safari 上 CSS 写 "Kaiti SC" / "STKaiti" 匹配不到系统楷体
（它属于 macOS 的按需字体资产），会一路静默回退到宋体；Chromium 同样解析不到。
内嵌 woff2 后 Safari / Chrome / iPad 显示完全一致。

依赖：pip install fonttools brotli

用法：
    python3 build-kai-font.py                    # 扫当前目录
    python3 build-kai-font.py --root ../my-site  # 指定项目根
    python3 build-kai-font.py --family KaiSub    # 自定族名（默认 KaiSubset）

数据里新增了生僻字后重跑一次即可。子集只收全站实际用到的字符 + 常用标点符号。
"""
import argparse
import base64
import glob
import io
import os
import subprocess
import sys

from fontTools.ttLib import TTCollection
from fontTools import subset

FACE_REGULAR = 0   # Kaiti SC Regular
FACE_BOLD = 3      # Kaiti SC Bold

# 数据里出现但源码扫不到、又会在正文里用到的符号（标点/数学/希腊/上下标）
EXTRA = ("　、。〈〉《》「」『』【】〔〕…—－·×÷±≈≠≤≥∞∑∏∫√∂∇→←↑↓↔⇒⇔∈∉⊂⊃∪∩∀∃¬∧∨⊕⊗"
         "°′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉"
         "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ")

SKIP_DIR = {"node_modules", ".git", "vendor", "dist", ".workbuddy"}
SCAN_EXT = (".html", ".htm", ".js", ".css", ".json", ".md")


def find_kaiti():
    """找出系统楷体 TTC：mdfind 优先，退到 AssetsV2 全盘 glob。"""
    try:
        out = subprocess.run(["mdfind", "-name", "Kaiti.ttc"],
                             capture_output=True, text=True, timeout=8).stdout
        for line in out.splitlines():
            if line.endswith("Kaiti.ttc") and os.path.exists(line):
                return line
    except Exception:
        pass
    for p in glob.glob("/System/Library/AssetsV2/com_apple_MobileAsset_Font*/*/AssetData/Kaiti.ttc"):
        return p
    return None


def collect_chars(root, out_name):
    chars = set()
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR and not d.startswith(".")]
        for fn in filenames:
            if not fn.endswith(SCAN_EXT) or fn == out_name:
                continue
            p = os.path.join(dirpath, fn)
            try:
                chars |= set(open(p, encoding="utf-8", errors="replace").read())
            except OSError:
                pass
    chars |= set(EXTRA)
    return "".join(sorted(c for c in chars if c >= " "))   # 去掉控制字符


def subset_face(ttc, index, text):
    font = ttc.fonts[index]
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = []
    opts.hinting = False
    opts.desubroutinize = False
    opts.drop_tables += ["DSIG"]
    sub = subset.Subsetter(options=opts)
    sub.populate(text=text)
    src = subset.load_font(buf, opts)
    sub.subset(src)
    out = io.BytesIO()
    src.flavor = "woff2"
    src.save(out)
    return out.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="项目根目录（默认当前目录）")
    ap.add_argument("--out", default="kai-font.css", help="输出文件名")
    ap.add_argument("--family", default="KaiSubset", help="字体族名，CSS 里引用它")
    ap.add_argument("--ttc", default=None, help="手动指定 Kaiti.ttc 路径")
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    ttc_path = args.ttc or find_kaiti()
    if not ttc_path or not os.path.exists(ttc_path):
        sys.exit("找不到系统楷体 Kaiti.ttc；用 --ttc 手动指定，"
                 "或在「字体册」里先下载楷体")

    text = collect_chars(root, args.out)
    ttc = TTCollection(ttc_path, lazy=True)
    if len(ttc.fonts) <= FACE_BOLD:
        sys.exit("该 TTC 只有 %d 个 face，不足 Regular/Bold 两档" % len(ttc.fonts))
    w400 = subset_face(ttc, FACE_REGULAR, text)
    w700 = subset_face(ttc, FACE_BOLD, text)

    css = """/* 精读正文用的楷体，子集内嵌（%d 个字符）。
   本文件由 build-kai-font.py 生成，勿手改。 */
@font-face{
  font-family:"%s";
  font-style:normal;
  font-weight:400;
  font-display:swap;
  src:url(data:font/woff2;base64,%s) format("woff2");
}
@font-face{
  font-family:"%s";
  font-style:normal;
  font-weight:700;
  font-display:swap;
  src:url(data:font/woff2;base64,%s) format("woff2");
}
""" % (len(text), args.family, base64.b64encode(w400).decode(),
       args.family, base64.b64encode(w700).decode())

    out = os.path.join(root, args.out)
    with open(out, "w", encoding="utf-8") as f:
        f.write(css)
    print("字体源：%s" % ttc_path)
    print("字符数 %d | 400 %d KB | 700 %d KB | %s %.2f MB"
          % (len(text), len(w400) // 1024, len(w700) // 1024,
             args.out, os.path.getsize(out) / 1048576))


if __name__ == "__main__":
    main()
