import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = [];

const html = read('public/index.html');
const JSPARTS = ['app-core.js', 'app-backtest.js', 'app-charts.js', 'app-runtime.js'];
const js = JSPARTS.map((f) => read('public/assets/' + f)).join('\n');
const css = read('public/assets/app.css');
const runtime = read('public/assets/app-runtime.js');
const core = read('public/assets/app-core.js');

// 1) app.js 语法
for (const f of JSPARTS) {
  const chk = spawnSync(process.execPath, ['--check', path.join(root, 'public/assets', f)], { encoding: 'utf8' });
  if (chk.status !== 0) fail.push('public/assets/' + f + ' 语法错误: ' + chk.stderr.split('\n')[0]);
}

// 2) 首页结构
const need = [
  ['查看数据依据', '缺少「查看数据依据」入口'],
  ['id="evidence"', '缺少证据折叠区'],
  ['assets/app.css', '缺少 CSS 外链'],
  ['assets/app-core.js', '缺少 core 脚本'],
  ['assets/app-backtest.js', '缺少回测数据脚本'],
  ['assets/app-charts.js', '缺少 charts 脚本'],
  ['assets/app-runtime.js', '缺少 runtime 脚本'],
  ['assets/snapshot-data.js', '缺少内置快照']
];
for (const [needle, msg] of need) if (!html.includes(needle)) fail.push(msg);

if (!/id="evidence"[^>]*hidden/.test(html)) fail.push('#evidence 必须默认折叠（hidden）');
if (/<script>\s*const DATA/.test(html)) fail.push('内置数据必须外置为 snapshot-data.js');

// 3) 关键逻辑仍在
for (const fn of ['renderSimple', 'winPen', 'verdictOf', 'buildWindows', 'fromOpenMeteo', 'tripVerdict']) {
  if (!js.includes('function ' + fn)) fail.push('缺少核心函数 ' + fn);
}
if (!js.includes("const CACHE_KEY='gz_wx_v9'") && !js.includes('CACHE_KEY')) fail.push('缺少浏览器缓存键');

// 4) 背景（模型/回测）不得进首屏：首屏区（#simple）之外才允许
const simple = js.indexOf('function renderSimple');
if (simple < 0) fail.push('缺少极简首屏渲染');

if (!css.includes('@media')) fail.push('缺少响应式断点');

// 数据依据只保留逐日预报与温度/降雨趋势。
const evidenceHeadings = ['逐日预报', '温度与降雨趋势'];
const evidenceIds = ['evidence-daily', 'evidence-trend'];
if ((html.match(/<section class="sheet"/g) || []).length !== 2) fail.push('数据依据必须有且仅有 2 个模块');
for (const heading of evidenceHeadings) if (!html.includes(heading)) fail.push('缺少数据模块标题：' + heading);
for (const id of evidenceIds) if (!html.includes('id="' + id + '"')) fail.push('缺少数据模块：' + id);
for (const removed of ['关键指标', '四天窗口比较', '历史天气参考', '各家模式各报了什么', '报得准不准', 'id="rankchart"', 'id="trip"', 'id="probtab"', 'id="probchart"', 'class="evidence-intro"', 'class="evidence-nav"', '<footer>', 'class="calhint"', 'class="cap"']) {
  if (html.includes(removed)) fail.push('已删除内容仍存在：' + removed);
}
if (!html.includes('id="btnRecalc"') || !html.includes('id="status"')) fail.push('缺少数据刷新状态或手动刷新入口');
if (!css.includes('EVIDENCE DETAILS') || !css.includes('.evidence-actions') || !css.includes('@media(max-width:640px)')) {
  fail.push('缺少简洁数据依据布局或手机端样式');
}
for (const removedCall of ['hero(view)', 'renderFacts(view)', 'renderRank(view)', 'renderTripUI(view)', 'renderProb()']) {
  if (runtime.includes(removedCall)) fail.push('已删除的数据模块仍在运行时渲染：' + removedCall);
}
if (core.includes("getElementById('band1')") || core.includes("getElementById('band2')") || core.includes('calhint')) {
  fail.push('日历仍引用已删除的提示或窗口标记');
}
if (!runtime.includes('renderTrend(view)') || !runtime.includes('renderCal(view)')) fail.push('逐日预报或趋势图未接入渲染流程');

if (fail.length) {
  console.error('check:page FAILED');
  for (const f of fail) console.error(' - ' + f);
  process.exit(1);
}
console.log('check:page OK · html ' + html.length + 'B · js ' + js.length + 'B · css ' + css.length + 'B');
