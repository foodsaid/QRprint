/* =====================================================================
   码制模块（Code 128 + DataMatrix ECC200）的离线验证
   ---------------------------------------------------------------------
   直接从 ../index.html 里把码制那段代码抠出来跑，不复制源码、不需要构建，
   所以项目仍然只有一个可交付文件。

   运行：  node test/codes.test.mjs
   除 Node 本身外没有任何依赖。全部通过时退出码为 0。

   为什么要有这个测试：SheetJS 与 qrcode.js 是久经考验的第三方库，
   而 Code 128 与 DataMatrix 是本项目按 ISO 标准手写的，必须自证正确。
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, '..', 'index.html');

/* ---------------- 从单文件里抠出码制模块 ---------------- */
function extractCodesBlock() {
  const html = readFileSync(HTML, 'utf8');
  const MARK = '<!-- ===== 码制模块';
  const at = html.indexOf(MARK);
  if (at < 0) throw new Error('index.html 里找不到码制模块的标记注释');
  const open = html.indexOf('<script>\n', at);
  const close = html.indexOf('\n</script>', open);
  if (open < 0 || close < 0) throw new Error('码制模块的 script 标签不完整');
  const src = html.slice(open + '<script>\n'.length, close);
  if (!src.includes('var QRPCodes')) throw new Error('抠出来的不是码制模块');
  return src;
}
// 该模块不碰 DOM，可直接在 Node 里求值
const C = new Function(extractCodesBlock() + '\nreturn QRPCodes;')();

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  FAIL:', name, extra === undefined ? '' : extra); }
};
const section = (s) => console.log('\n=== ' + s + ' ===');

/* ------------------------------------------------------ Code 128 结构 */
section('Code 128 图案表不变量');
{
  const t = C.C128;
  ok('共 107 个图案', t.length === 107, t.length);
  const seen = new Set();
  for (let i = 0; i < 107; i++) {
    const p = t[i];
    const digits = [...p].map(Number);
    const sum = digits.reduce((a, b) => a + b, 0);
    if (i < 106) {
      ok(`#${i} 6 元素`, digits.length === 6, p);
      ok(`#${i} 共 11 模块`, sum === 11, `${p} = ${sum}`);
      // ISO 15417 结构约束：三个"条"的宽度之和必为偶数
      ok(`#${i} 条宽和为偶`, (digits[0] + digits[2] + digits[4]) % 2 === 0, p);
    } else {
      ok('终止符 7 元素', digits.length === 7, p);
      ok('终止符 13 模块', sum === 13, `${p} = ${sum}`);
    }
    ok(`#${i} 唯一`, !seen.has(p), p);
    seen.add(p);
  }
}

/* -------------------------------- Code 128 独立反向解码（不复用编码路径） */
section('Code 128 编码 → 反向解码往返');
function decode128(bits) {
  let a = 0, b = bits.length - 1;
  while (a < bits.length && bits[a] === 0) a++;
  while (b >= 0 && bits[b] === 0) b--;
  const core = bits.slice(a, b + 1);
  const runs = [];
  let i = 0;
  while (i < core.length) {
    let j = i; while (j < core.length && core[j] === core[i]) j++;
    runs.push(j - i); i = j;
  }
  const vals = [];
  for (let k = 0; k + 6 <= runs.length; k += 6) {
    const n = (runs.length - k === 7) ? 7 : 6;
    const idx = C.C128.indexOf(runs.slice(k, k + n).join(''));
    if (idx < 0) return { err: 'unknown pattern' };
    vals.push(idx);
    if (n === 7) break;
  }
  const stop = vals.pop();
  if (stop !== 106) return { err: 'bad stop ' + stop };
  const check = vals.pop();
  let sum = vals[0];
  for (let k = 1; k < vals.length; k++) sum += vals[k] * k;
  if (sum % 103 !== check) return { err: `checksum ${sum % 103} != ${check}` };
  const start = vals.shift();
  let text = '';
  if (start === 105) for (const v of vals) text += String(v).padStart(2, '0');
  else if (start === 104) for (const v of vals) text += String.fromCharCode(v + 32);
  else return { err: 'bad start ' + start };
  return { text, start };
}

for (const s of ['0303000237-00', '123456', '12345', 'A', 'Hello World!', 'ZC-2001',
                 'MAT-100001', '00000000', 'abcXYZ 09 #@$%', '~', ' ',
                 '9876543210987654321012']) {
  const m = C.code128Modules(s);
  if (!m) { ok(`"${s}" 可编码`, false); continue; }
  const d = decode128(m.bits);
  ok(`"${s}" 往返一致`, d.text === s, JSON.stringify(d));
  ok(`"${s}" 模块数 = 11n+13+静区`, (m.bits.length - 20 - 13) % 11 === 0, m.bits.length);
  if (/^\d+$/.test(s) && s.length % 2 === 0) ok(`"${s}" 走 Code C`, d.start === 105, d.start);
}
ok('中文返回 null', C.code128Modules('物料A') === null);
ok('空串返回 null', C.code128Modules('') === null);

/* ---------------------------------------------------- Data Matrix 编码 */
section('Data Matrix ASCII 编码');
const enc = (s) => JSON.stringify(C.dmEncode(s));
ok('"123456" → [142,164,186]', enc('123456') === '[142,164,186]', enc('123456'));
ok('"A" → [66]', enc('A') === '[66]', enc('A'));
ok('"0" → [49]', enc('0') === '[49]', enc('0'));
ok('"99" → [229]', enc('99') === '[229]', enc('99'));
ok('中文 → null', C.dmEncode('物') === null);

/* ------------------------------- Data Matrix RS：校验子必须全为 0 */
section('Data Matrix Reed-Solomon 校验子');
function syndromesZero(all, eccN) {
  // 码字向量视为多项式，在 α^1..α^n 处求值应全为 0
  for (let i = 1; i <= eccN; i++) {
    let acc = 0;
    const alpha = C.EXP[i];
    for (const cw of all) acc = C.gmul(acc, alpha) ^ cw;
    if (acc !== 0) return false;
  }
  return true;
}
for (const s of ['123456', 'A', '0303000237-00', 'MAT-100001',
                 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                 'x'.repeat(100), 'y'.repeat(200)]) {
  const dm = C.dataMatrix(s);
  if (!dm) { ok(`"${s.slice(0, 12)}" 可编码`, false); continue; }
  ok(`"${s.slice(0, 12)}"(${dm.size}x${dm.size}) 校验子归零`, syndromesZero(dm.codewords, dm.spec[2]));
  ok(`"${s.slice(0, 12)}" 码字数 = 数据+纠错`, dm.codewords.length === dm.spec[1] + dm.spec[2]);
}

/* ------------------------ Data Matrix 放置：每个位置恰好用一次（双射） */
section('Data Matrix 放置双射性');
for (const [side, cap, eccN, reg] of C.DM_SIZES) {
  const total = cap + eccN;
  const nrow = side - 2 * reg, ncol = side - 2 * reg;
  const dm = C.dataMatrix('x'.repeat(Math.max(1, cap - 2)));
  if (!dm || dm.size !== side) continue;
  const map = dm.place.map;
  const usedSlots = new Set();
  let fixed = 0, empty = 0;
  for (let i = 0; i < nrow * ncol; i++) {
    const v = map[i];
    if (v === -1 || v === -2) { fixed++; continue; }   // 右下角固定图案
    if (v === 0) { empty++; continue; }
    if (usedSlots.has(v)) ok(`${side} 位置重复 ${v}`, false);
    usedSlots.add(v);
  }
  ok(`${side}x${side} 无空洞`, empty === 0, `empty=${empty}`);
  ok(`${side}x${side} 角落固定块 0 或 4 格`, fixed === 0 || fixed === 4, `fixed=${fixed}`);
  ok(`${side}x${side} 槽位数对得上`, usedSlots.size + fixed === nrow * ncol,
     `${usedSlots.size}+${fixed} vs ${nrow * ncol}`);
  ok(`${side}x${side} 码字全覆盖`, usedSlots.size === total * 8, `${usedSlots.size} vs ${total * 8}`);
  const perCw = new Map();
  for (const v of usedSlots) {
    const cw = Math.floor(v / 10), bit = v % 10;
    if (!perCw.has(cw)) perCw.set(cw, new Set());
    perCw.get(cw).add(bit);
  }
  let bad = 0;
  for (const [, bset] of perCw) if (bset.size !== 8) bad++;
  ok(`${side}x${side} 每码字 8 位齐全`, bad === 0, `bad=${bad}`);
}

/* --------------------- Data Matrix 定位图形：L 边 + 交替时钟边 */
section('Data Matrix 定位图形');
for (const s of ['123456', 'x'.repeat(60), 'y'.repeat(200)]) {
  const dm = C.dataMatrix(s);
  const n = dm.size, reg = dm.spec[3], dr = (n - 2 * reg) / reg;
  const at = (r, c) => dm.bits[r * n + c];
  const bad = [];
  for (let ri = 0; ri < reg; ri++) for (let rj = 0; rj < reg; rj++) {
    const r0 = ri * (dr + 2), c0 = rj * (dr + 2);
    for (let r = 0; r < dr + 2; r++) {
      if (at(r0 + r, c0) !== 1) bad.push(`left ${r0 + r}`);
      if (at(r0 + r, c0 + dr + 1) !== (r % 2 ? 1 : 0)) bad.push(`right ${r0 + r}`);
    }
    for (let c = 0; c < dr + 2; c++) {
      if (at(r0 + dr + 1, c0 + c) !== 1) bad.push(`bottom ${c0 + c}`);
      if (at(r0, c0 + c) !== (c % 2 ? 0 : 1)) bad.push(`top ${c0 + c}`);
    }
  }
  ok(`${n}x${n} L 边与时钟边正确`, bad.length === 0, bad.slice(0, 4).join(' | '));
  ok(`${n}x${n} 左下角暗`, at(n - 1, 0) === 1);
  ok(`${n}x${n} 右上角亮`, at(0, n - 1) === 0);
}

/* ------------------------- Data Matrix 完整往返：从位图读回码字与文本 */
section('Data Matrix 位图 → 码字 → 文本 往返');
for (const s of ['123456', '0303000237-00', 'ABC-123',
                 'x'.repeat(4), 'x'.repeat(10), 'x'.repeat(16), 'x'.repeat(20),
                 'x'.repeat(28), 'x'.repeat(32), 'x'.repeat(40), 'x'.repeat(56),
                 'x'.repeat(80), 'x'.repeat(110), 'x'.repeat(140), 'x'.repeat(170),
                 'z'.repeat(150), 'z'.repeat(200)]) {
  const dm = C.dataMatrix(s);
  const n = dm.size, reg = dm.spec[3], dr = (n - 2 * reg) / reg, nrow = n - 2 * reg;
  // 1) 从完整符号里把数据区抠回映射矩阵
  const mapBits = new Uint8Array(nrow * nrow);
  for (let ri = 0; ri < reg; ri++) for (let rj = 0; rj < reg; rj++) {
    const r0 = ri * (dr + 2), c0 = rj * (dr + 2);
    for (let r = 0; r < dr; r++) for (let c = 0; c < dr; c++) {
      mapBits[(ri * dr + r) * nrow + (rj * dr + c)] = dm.bits[(r0 + 1 + r) * n + (c0 + 1 + c)];
    }
  }
  // 2) 用放置表反查每个码字的比特
  const cws = new Array(dm.codewords.length).fill(0);
  for (let i = 0; i < nrow * nrow; i++) {
    const v = dm.place.map[i];
    if (v <= 0) continue;
    const cw = Math.floor(v / 10), bit = v % 10;
    if (mapBits[i]) cws[cw - 1] |= 1 << (8 - bit);
  }
  ok(`"${s.slice(0, 12)}" 码字还原一致`,
     JSON.stringify(cws) === JSON.stringify(dm.codewords));
  // 3) 数据码字解回文本
  let text = '';
  for (let k = 0; k < dm.spec[1]; k++) {
    const v = cws[k];
    if (v === 129) break;                                   // PAD
    if (v >= 130 && v <= 229) text += String(v - 130).padStart(2, '0');
    else if (v >= 1 && v <= 128) text += String.fromCharCode(v - 1);
  }
  ok(`"${s.slice(0, 12)}" 文本还原一致`, text === s, `got "${text.slice(0, 20)}"`);
}

/* --------------------------------- 输出的 SVG 必须自洽且不含外部引用 */
section('SVG 输出');
for (const s of ['0303000237-00', 'ABC-123']) {
  for (const [name, url] of [['Code128', C.code128URL(s, 30)],
                             ['DataMatrix', C.dataMatrixURL(s, 2)]]) {
    ok(`${name} 输出 data URI`, url.startsWith('data:image/svg+xml;charset=utf-8,'));
    const svg = decodeURIComponent(url.slice('data:image/svg+xml;charset=utf-8,'.length));
    ok(`${name} 是完整 SVG`, svg.startsWith('<svg') && svg.endsWith('</svg>'));
    ok(`${name} 无外部引用`, !/https?:|<image|xlink:href|<script/i.test(
      svg.replace('http://www.w3.org/2000/svg', '')));
    ok(`${name} 只有一条 path`, (svg.match(/<path/g) || []).length === 1);
  }
}
ok('Code128 拉伸填满标签框', C.code128URL('ABC', 30).includes(
  encodeURIComponent('preserveAspectRatio="none"')));
ok('中文 Code128 返回 null', C.code128URL('物料', 30) === null);
ok('中文 DataMatrix 返回 null', C.dataMatrixURL('物料', 2) === null);
ok('超长内容 DataMatrix 返回 null', C.dataMatrixURL('x'.repeat(500), 2) === null);

console.log('\n---------------------------------------------');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
