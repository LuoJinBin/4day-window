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

// 数据依据保持五个清晰板块：两张冗余的大型数据表不进入页面。
const evidenceHeadings = ['关键指标', '逐日预报', '四天窗口比较', '温度与降雨趋势', '历史天气参考'];
const evidenceIds = ['evidence-key', 'evidence-daily', 'evidence-window', 'evidence-trend', 'evidence-history'];
if ((html.match(/<section class="sheet"/g) || []).length !== 5) fail.push('证据区域必须有且仅有 5 个模块');
for (const heading of evidenceHeadings) if (!html.includes(heading)) fail.push('缺少证据模块标题：' + heading);
for (const id of evidenceIds) if (!html.includes('id="' + id + '"') || !html.includes('href="#' + id + '"')) fail.push('章节导航缺失：' + id);
for (const removed of ['各家模式各报了什么', '报得准不准', 'id="mx"', 'id="acctop2"', 'id="acctab2"']) {
  if (html.includes(removed)) fail.push('冗余区块仍存在：' + removed);
}
if (!css.includes('EVIDENCE REPORT REDESIGN') || !css.includes('.evidence .sheet{') || !css.includes('@media(max-width:640px)')) {
  fail.push('缺少数据依据的分组卡片或手机端布局样式');
}
if (/renderMatrix\(view\); renderAccV2\(\)/.test(js)) fail.push('已移除板块仍被整体渲染');

if (fail.length) {
  console.error('check:page FAILED');
  for (const f of fail) console.error(' - ' + f);
  process.exit(1);
}
console.log('check:page OK · html ' + html.length + 'B · js ' + js.length + 'B · css ' + css.length + 'B');
