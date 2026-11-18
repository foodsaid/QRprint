/* =====================================================================
   GS1 模块测试：GTIN 校验位、日期、Digital Link、元素串、GS1 DataMatrix
   ---------------------------------------------------------------------
   test/gs1_vectors.json 是姊妹项目 qrbarcode 的测试向量原样拷贝（来源见
   VECTORS_SOURCE，CI 会核对与上游一致），保证两边生成的 GS1 码完全相同。
   直接从 ../index.html 取出码制模块运行，不复制源码。

   运行：  node test/gs1.test.mjs        全部通过时退出码为 0
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const VECTORS_SOURCE = {
  repo: 'foodsaid/qrbarcode',
  commit: 'f963d0b18fe5a3e4efb5afc40e5edf67fff08123',
  path: 'tests/gs1_vectors.json',
  sha256: '6758439cf26b62caf870cc555b4832d054a9e9433b62ac542ff65a42cefd7ec5',
};

const html = readFileSync(join(HERE, '..', 'index.html'), 'utf8');
const at = html.indexOf('<!-- ===== 码制模块');
const open = html.indexOf('<script>\n', at), close = html.indexOf('\n</script>', open);
const C = new Function(html.slice(open + '<script>\n'.length, close) + '\nreturn QRPCodes;')();

const raw = readFileSync(join(HERE, 'gs1_vectors.json'));
const V = JSON.parse(raw);

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else { fail++; console.log('  FAIL:', name, extra === undefined ? '' : extra); }
};
const section = (s) => console.log('\n=== ' + s + ' ===');
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

section('测试向量与上游一致');
ok('gs1_vectors.json 的 SHA-256 与记录相同',
   createHash('sha256').update(raw).digest('hex') === VECTORS_SOURCE.sha256);

section('共享向量：合法输入');
for (const v of V.valid) {
  const item = C.gs1Build(v.input);
  const uri = C.gs1DigitalLink(item, v.input.domain);
  ok(`${v.name} → Digital Link`, uri === v.uri, uri);
  ok(`${v.name} → 元素串`, C.gs1ElementString(item) === v.element_string, C.gs1ElementString(item));
}

section('共享向量：非法输入必须拒绝');
for (const v of V.invalid) {
  const msg = throws(() => C.gs1DigitalLink(C.gs1Build(v.input), v.input.domain));
  ok(`${JSON.stringify(v.input)} 被拒绝`, msg !== null);
  ok(`${JSON.stringify(v.input)} 提示是中文`, msg === null || /[一-鿿]/.test(msg), msg);
}

section('校验位');
ok('9506000134352 的前 12 位 → 2', C.gs1CheckDigit('950600013435') === 2);
ok('5901234123457 的前 12 位 → 7', C.gs1CheckDigit('590123412345') === 7);
ok('校验位错误时提示正确的位', /应为 2/.test(throws(() => C.gs1Build({ gtin: '9506000134353' }))));

section('日期：各种写法');
const D = (s) => C.gs1Date(s, '有效期');
ok('YYMMDD', D('271231') === '271231');
ok('YYYY-MM-DD', D('2027-12-31') === '271231');
ok('YYYY/M/D', D('2027/1/5') === '270105');
ok('YYYY.MM.DD', D('2027.12.31') === '271231');
ok('日为 00（月底）', D('2027-04-00') === '270400');
ok('Excel 序列号 46387 = 2026-12-31', D('46387') === '261231', D('46387'));
ok('Excel 序列号带小数（含时间）', D('46387.5') === '261231');
ok('Excel 序列号 46447 = 2027-03-01', D('46447') === '270301', D('46447'));
ok('2 月 29 日（闰年 2028）', D('280229') === '280229');
ok('2 月 29 日（平年 2027）被拒', throws(() => D('270229')) !== null);
ok('月份 13 被拒', /月份/.test(throws(() => D('271331'))));
ok('1999 年被拒', throws(() => D('1999-12-31')) !== null);
ok('乱写被拒', throws(() => D('明年')) !== null);

section('GS1 DataMatrix 码字');
{
  const item = C.gs1Build({ gtin: '9506000134352', batch: 'ABC123', serial: 'S9', expiry: '271231' });
  // ASCII 编码方案里 129 只会是填充（PAD），之前的才是实际数据码字
  const payload = (dm) => { const i = dm.data.indexOf(129); return dm.data.slice(0, i < 0 ? undefined : i); };
  const both = payload(C.gs1DataMatrix(item));
  ok('首码字是 FNC1（232）', both[0] === 232, both[0]);
  ok('批号与序列号之间恰有一个 FNC1 分隔', both.slice(1).filter((c) => c === 232).length === 1);
  const one = payload(C.gs1DataMatrix(C.gs1Build({ gtin: '9506000134352', batch: 'ABC123' })));
  ok('只有一个变长字段时不需要分隔符', !one.slice(1).includes(232));
  ok('URL 版本可生成', /^data:image\/svg\+xml/.test(C.gs1DataMatrixURL(item, 2)));
}

section('百分号编码与 Python quote 一致');
{
  const item = C.gs1Build({ gtin: '9506000134352', batch: "A(1)!*'" });
  ok('( ) ! * \' 都被编码', C.gs1DigitalLink(item).endsWith('/10/A%281%29%21%2A%27'), C.gs1DigitalLink(item));
}

console.log('\n---------------------------------------------');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
