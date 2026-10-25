/* =====================================================================
   交叉验证 1/2：导出 QRprint 实际生成的码图模块矩阵
   ---------------------------------------------------------------------
   与 codes.test.mjs 一样，直接从 ../../index.html 里取出 qrcode.js 和码制模块
   运行，不复制源码；二维码的版本、纠错等级和字符编码也从页面的应用逻辑里读，
   保证导出的就是页面上真正会打印出来的码。

   运行：  node test/crosscheck/export.mjs > symbols.json
   然后：  python test/crosscheck/decode.py symbols.json   （用 zxing-cpp 独立解码对照）
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf8');

function scriptAfter(marker) {
  const at = HTML.indexOf(marker);
  if (at < 0) throw new Error('index.html 里找不到标记：' + marker);
  const open = HTML.indexOf('<script>\n', at);
  const close = HTML.indexOf('\n</script>', open);
  return HTML.slice(open + '<script>\n'.length, close);
}

// qrcode.js（内联依赖 2/2）与本项目的码制模块，都不碰 DOM；
// 页面里 qrcode 是全局变量，这里把它传给码制模块，效果相同
const qrcode = new Function(scriptAfter('<!-- ===== 内联依赖 2/2') + '\nreturn qrcode;')();
const C = new Function('qrcode', scriptAfter('<!-- ===== 码制模块') + '\nreturn QRPCodes;')(qrcode);

// 页面应用逻辑里的二维码设置：版本、纠错等级，以及（若有）字符编码
const app = scriptAfter('<!-- ===== 应用逻辑');
const qrConf = app.match(/var QR_EC = "([LMQH])", QR_TYPE = (\d+);/);
if (!qrConf) throw new Error('应用逻辑里找不到 QR_EC / QR_TYPE');
const QR_EC = qrConf[1], QR_TYPE = Number(qrConf[2]);
// 字符编码：页面可能写 qrcode.stringToBytesFuncs['X'] 或 QRPCodes.xxx，照样套用
const enc = app.match(/qrcode\.stringToBytes\s*=\s*(qrcode\.stringToBytesFuncs\[['"][^'"]+['"]\]|QRPCodes\.\w+)\s*;/);
if (enc) qrcode.stringToBytes = new Function('qrcode', 'QRPCodes', 'return ' + enc[1] + ';')(qrcode, C);
const QR_ENCODING = enc ? enc[1] : 'default';

// 典型 Key：物料号、订单号、带符号的编号，以及中文、Latin-1 和长内容
const TEXTS = {
  qr: ['A-1001', 'MAT-100001', 'ZC-2001', '0303000237-00', 'https://example.com/item?id=42&lot=B7',
       'Hello World!', '9876543210987654321012', 'x'.repeat(300),
       '白色无纺布', '物料A-01', 'Café', '仓库WH01-库位3', 'Ø12×30 µm', '25°C', '±5%', '📦A1-批次',
       '物料' + 'B'.repeat(200)],
  c128: ['A-1001', 'MAT-100001', '0303000237-00', '123456', '12345', 'A', 'Hello World!',
         'abcXYZ 09 #@$%', '~', '00000000', '9876543210987654321012', 'Z'.repeat(40)],
  dm: ['A-1001', 'MAT-100001', '0303000237-00', '123456', 'A', '0', '99',
       'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'Café', 'x'.repeat(100), 'y'.repeat(200)],
};

const symbols = [];
for (const text of TEXTS.qr) {
  const qr = qrcode(QR_TYPE, QR_EC);
  qr.addData(text); qr.make();
  const n = qr.getModuleCount(), rows = [];
  for (let r = 0; r < n; r++) {
    let row = '';
    for (let c = 0; c < n; c++) row += qr.isDark(r, c) ? '1' : '0';
    rows.push(row);
  }
  symbols.push({ kind: 'qr', text, ec: QR_EC, rows });
}
for (const text of TEXTS.c128) {
  const m = C.code128Modules(text);
  symbols.push({ kind: 'c128', text, bars: m ? m.bits.join('') : null });
}
for (const text of TEXTS.dm) {
  const dm = C.dataMatrix(text);
  const rows = [];
  if (dm) for (let r = 0; r < dm.size; r++) rows.push(dm.bits.slice(r * dm.size, (r + 1) * dm.size).join(''));
  symbols.push({ kind: 'dm', text, rows: dm ? rows : null });
}

process.stdout.write(JSON.stringify({ qr: { type: QR_TYPE, ec: QR_EC, encoding: QR_ENCODING }, symbols }, null, 1) + '\n');
