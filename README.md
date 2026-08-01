# QRprint

把 Excel 里的一列编号，批量打成带二维码的标签。免安装、免注册，打开网页就能用，表格不会上传到任何地方。

## 👉 [点这里直接用](https://foodsaid.github.io/QRprint/)

打不开、或者公司电脑不让上网？点 **Code → Download ZIP**，双击 `index.html` 即可，功能一模一样。就这一个文件，拷 U 盘、发微信都行。手机浏览器也能用。

## 怎么用

1. 拖一个 Excel 进去（`.xlsx` / `.xls` / `.csv`）
2. 勾选标签上要印的列（编号必印）
3. 点右上角「打印」

右边一直有实时预览，所见即所得。

**打印窗口里记得改 3 个地方**：边距选「无」、关掉「页眉页脚」、勾上「背景图形」（不勾的话裁切虚线印不出来）。用标签打印机再把纸张尺寸选成你的规格、缩放选 100%。

## 表格要长什么样

只要**有一列是编号**就行：

| Item No. | Item Description | Warehouse | In Stock |
|---|---|---|---|
| A-1001 | 白色无纺布 | WH01 | 250 |
| A-1002 | 铝合金支架 | WH02 | 80 |

编号那列叫 `Key`、`物料号`、`料号`、`编号`、`Code`、`条码`…… 几十种写法都认得，认不出就用第一列并提示你。表头不在第一行也没关系，多个 sheet 会一起读。

其余功能都在左边那四步里：按仓库/库存等任意列筛选、粘一串编号只打这些、重复行自动合并（可选把数量加起来）、A4 一页多枚带裁切线、换成 DataMatrix 或一维条形码给老扫描枪用。

## 数据安全

表格只在你自己的浏览器里处理。页面用 CSP 从浏览器层面禁掉了一切网络请求——整个文件里搜不到 `fetch`、`XMLHttpRequest`，也没有 CDN、字体、统计、埋点。**下载下来断网打开，一样能用**，这是最踏实的验证方式。

别人发来的表格也可能是坏的，所以内容一律当纯文本处理，超大表格会先截断以免卡住浏览器。这些都已经做好了，正常用不用管。

<details>
<summary>技术细节（要过 IT / 安全审核时用得上）</summary>

<br>

**各项上限**：文件 60 MB、20 万行、单表 256 列 / 300 万单元格、预览渲染 2000 枚（超出时页数仍按全部统计，点打印会问你是否渲染全部）。

**已做的防护**，每条都用构造的攻击样例实测过，不是只读代码下的结论：

- 全项目**零 `innerHTML` 写入**，表格内容只走 DOM 文本节点；CSP 额外开启 `require-trusted-types-for 'script'`，从平台层面堵死这类写入。含 `<img onerror>` / `<script>` / `<svg onload>` 的表格实测全部按纯文本打印。
- 以表格内容为键的字典一律 `Object.create(null)`。表头与取值均为 `__proto__` / `constructor` 的表格实测 `Object.prototype` 零变化。
- SheetJS 用 0.20.3，已含 [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533)（原型污染）与 [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363)（ReDoS）修复。
- 超大表格展开前先夹到限额内——否则一个只有 2 个真实单元格的几 KB 文件可以声明 2560 万格（要 12.3 秒 / 463 MB），xlsx 最大能声明 170 亿格。
- 单元格与表头都截断到 300 字符。

**三点如实说明**，是浏览器与 GitHub Pages 的固有限制，不是本工具的缺陷，日常使用没有实际影响：

- 页面可以被别的网站嵌进 iframe——`frame-ancestors` 写在 `<meta>` 里不生效，而 Pages 不允许自定义响应头。跨源 iframe 读不到你的数据，最多是点击劫持；真要堵死就部署到能设响应头的地方。
- 单文件方案要求 `script-src` 保留 `'unsafe-inline'`，所以防线完全押在「绝不把不可信内容当 HTML 写入」上，这也是要开 Trusted Types 的原因。
- 压缩炸弹未额外处理：60 MB 上限内仍可构造高膨胀比文件占满内存。属自伤范畴（你自己选择打开的文件），关掉标签页即可。

**内联依赖指纹**（单文件用不了 SRI，便于核对是否被改动，对 `<script>` 与 `</script>` 之间的内容按 UTF-8 计算）：

| 段落 | 字节数 | SHA-256 (base64) |
|---|---|---|
| SheetJS xlsx 0.20.3 | 951,971 | `2HJ+3EsM84THwnYlLN3a28HW12zshXXDxoIjxXShNQg=` |
| qrcode.js (Kazuhiko Arase) | 56,693 | `uAoMx2wD1+RB2HTfVw+PyT2VbBl21HbhUlg40bXNcbg=` |
| 码制模块（本项目） | 13,578 | `1D5m/rJuDAbWH/mzhUxe4jZh9+Jby5BSu+hQJU898q0=` |
| 应用逻辑（本项目） | 45,953 | `Xo99Peu3RKce7ncMmCqd/+y7sVirL+SSpUfkzhhvEaY=` |

> SheetJS 这份取自 npm 的 `@e965/xlsx` 镜像而非官方 <https://cdn.sheetjs.com>；版本号高于两个 CVE 的修复版本，也已用恶意文件实测未复现原型污染。若有供应链合规要求，建议自行从官方源替换同版本文件。

</details>

<details>
<summary>想改代码</summary>

<br>

`index.html` 内部按顺序分五段，都有中文注释：界面样式 → 标签排版引擎（改了会直接影响出纸）→ [SheetJS](https://sheetjs.com)（Apache-2.0）→ [qrcode.js](http://www.d-project.com/)（MIT）→ 本项目实现的 Code 128 / DataMatrix → 应用逻辑。

改版式看 `a4Metrics()` 与 `renderLabels()`，表头别名在 `ALIAS`，各项上限在文件开头的 `MAX*` 常量。

动过码制模块记得跑测试（只要 Node，无依赖）：

```bash
node test/codes.test.mjs
```

609 项断言，直接从 `index.html` 里抠代码来跑，所以仓库不存第二份源码、也不需要构建。覆盖 Code 128 的图案表不变量与编解码往返、DataMatrix 的 RS 校验子归零 / 全尺寸放置双射性 / 位图往返、以及输出 SVG 无外部引用。

Windows 版 Chrome 没有 `BarcodeDetector`，所以**没能用真实解码器做端到端确认**——投产前建议先用你的扫描枪试打一张。

> ⚠️ 重新拼装单文件时的坑：别把依赖源码放进 `String.replace()` 的替换串——qrcode.js 里有 `case '$' :`，会被当成 `$'` 替换模式展开，静默破坏那段脚本。用替换函数并对各段做长度校验。

</details>

---

MIT 许可。内联依赖沿用各自许可。QR Code 是 DENSO WAVE 的注册商标；Data Matrix 与 Code 128 是公开标准。
