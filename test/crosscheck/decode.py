"""
交叉验证 2/2：用独立的解码器 zxing-cpp 读回 QRprint 生成的码，逐个对照内容。

export.mjs 导出的是页面真正会打印的模块矩阵；这里把它画成图片（加足静区），
交给 zxing-cpp 解码，核对：能否读出、内容是否与原文一致、码制和纠错等级是否正确。
zxing-cpp 与 QRprint 的编码器没有任何共同代码，所以能发现自测发现不了的问题。

    node test/crosscheck/export.mjs > symbols.json
    python test/crosscheck/decode.py symbols.json
"""

import json
import sys
from pathlib import Path

import zxingcpp
from PIL import Image

FORMATS = {
    "qr": zxingcpp.BarcodeFormat.QRCode,
    "c128": zxingcpp.BarcodeFormat.Code128,
    "dm": zxingcpp.BarcodeFormat.DataMatrix,
}
SCALE = 4  # 每个模块的像素数
QUIET = 4  # 二维码静区（模块）；Code 128 的 10 模块静区已含在 bars 里
# 已知问题：仍按清单失败时 CI 通过；修好了或出现新问题时 CI 失败
KNOWN = json.loads((Path(__file__).with_name("known_failures.json")).read_text(encoding="utf-8"))


def matrix_image(rows, quiet):
    """把 '0'/'1' 字符串行画成灰度图（1 = 黑），四周加静区。"""
    n_rows, n_cols = len(rows), len(rows[0])
    img = Image.new("L", ((n_cols + 2 * quiet) * SCALE, (n_rows + 2 * quiet) * SCALE), 255)
    for r, row in enumerate(rows):
        for c, bit in enumerate(row):
            if bit == "1":
                x, y = (c + quiet) * SCALE, (r + quiet) * SCALE
                img.paste(0, (x, y, x + SCALE, y + SCALE))
    return img


def bars_image(bars, height=40):
    """把一维条空序列画成图片，上下留白。"""
    img = Image.new("L", (len(bars) * SCALE, height + 20), 255)
    for i, bit in enumerate(bars):
        if bit == "1":
            img.paste(0, (i * SCALE, 10, (i + 1) * SCALE, 10 + height))
    return img


def check(symbol):
    """解码一个码，返回失败原因；通过时返回 None。"""
    kind, text = symbol["kind"], symbol["text"]
    data = symbol.get("rows") if kind != "c128" else symbol.get("bars")
    if data is None:
        return "QRprint 拒绝生成（返回 null）"
    image = bars_image(data) if kind == "c128" else matrix_image(data, QUIET if kind == "qr" else 2)
    result = zxingcpp.read_barcode(image, formats=FORMATS[kind])
    if result is None or not result.valid:
        return "zxing-cpp 无法解码"
    if result.format != FORMATS[kind]:
        return f"码制不对：{result.format}"
    if result.text != text:
        return f"内容不一致：解码得到 {result.text!r}"
    if kind == "qr" and result.ec_level != symbol["ec"]:
        return f"纠错等级不对：{result.ec_level}"
    return None


def main():
    with open(sys.argv[1], encoding="utf-8") as handle:
        export = json.load(handle)
    print(f"QR 设置：version={export['qr']['type'] or 'auto'} ec={export['qr']['ec']} "
          f"encoding={export['qr']['encoding']}")
    unexpected, known, fixed = [], [], []
    for symbol in export["symbols"]:
        problem = check(symbol)
        key = f"{symbol['kind']} {symbol['text']}"
        label = f"{symbol['kind']:4} {symbol['text'][:40]!r}"
        if problem and key in KNOWN:
            known.append(key)
            print(f"KNOWN {label}  → {problem}")
        elif problem:
            unexpected.append(key)
            print(f"FAIL  {label}  → {problem}")
        elif key in KNOWN:
            fixed.append(key)
            print(f"FIXED {label}  → 已能正确解码，请从 known_failures.json 删除")
        else:
            print(f"ok    {label}")
    total = len(export["symbols"])
    print(f"\n{total - len(unexpected) - len(known)}/{total} 正确，已知问题 {len(known)} 个，"
          f"新问题 {len(unexpected)} 个，已修复待删除 {len(fixed)} 个")
    for key in known:
        print(f"  已知问题：{key[:50]} — {KNOWN[key]}")
    return 1 if unexpected or fixed else 0


if __name__ == "__main__":
    sys.exit(main())
