import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const files = [
  'public/assets/planner.js',
  'server/flexible-api.js',
  'api/plan.js',
  'api/locations.js',
  'server/index.js'
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(file + ' 语法错误：' + result.stderr.split('\n')[0]);
}

const html = read('public/index.html');
const css = read('public/assets/planner.css');
const planner = read('public/assets/planner.js');
const required = [
  'id="cityInput"', 'id="cityResults"', 'id="findControls"', 'id="fixedControls"',
  'id="searchStart"', 'id="searchEnd"', 'id="fixedStart"', 'id="fixedEnd"',
  'data-period="morning"', 'data-period="afternoon"', 'data-period="evening"',
  'data-period="custom"', 'id="customStart"', 'id="customEnd"',
  'id="duration"', 'id="dayList"', 'id="alternatives"', 'id="appStatus"',
  'assets/planner.js', 'assets/planner.css'
];
for (const item of required) if (!html.includes(item)) failures.push('首页缺少：' + item);
for (const item of ['/api/locations', '/api/plan', 'timezone', 'precipitationProbability']) {
  if (!planner.includes(item)) failures.push('规划逻辑缺少：' + item);
}
if (!css.includes('@media(max-width:640px)')) failures.push('缺少手机端布局');
if (!html.includes('role="status"') || !html.includes('role="listbox"')) failures.push('缺少辅助技术标记');
if (/<script[^>]+src=["']https?:\/\//i.test(html)) failures.push('页面不应依赖外部脚本');
if (html.includes('snapshot-data.js') || html.includes('app-runtime.js')) failures.push('旧广州固定版运行脚本不应再加载');

if (failures.length) {
  console.error('check:page FAILED');
  failures.forEach((failure) => console.error(' - ' + failure));
  process.exit(1);
}
console.log('check:page OK · flexible planner · ' + planner.length + 'B JS · ' + css.length + 'B CSS');
