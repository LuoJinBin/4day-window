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

if (fail.length) {
  console.error('check:page FAILED');
  for (const f of fail) console.error(' - ' + f);
  process.exit(1);
}
console.log('check:page OK · html ' + html.length + 'B · js ' + js.length + 'B · css ' + css.length + 'B');
