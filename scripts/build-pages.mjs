import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUTPUT = path.join(ROOT, 'dist-pages');

// 只发布广州页面运行所需的前端文件，不复制 Node 服务、API、密钥或研究数据。
const ASSETS = [
  'app.css',
  'snapshot-data.js',
  'app-core.js',
  'app-backtest.js',
  'app-charts.js',
  'app-runtime.js'
];
const OPTIONAL_ASSETS = ['live-forecast.json'];

async function build() {
  let html = await fs.readFile(path.join(PUBLIC, 'guangzhou.html'), 'utf8');
  const apiSetting = "window.GZ_API_BASE = '/api/forecast';";
  const count = html.split(apiSetting).length - 1;
  if (count !== 1) {
    throw new Error('广州页面的服务端 API 地址应恰好出现一次，当前为 ' + count);
  }

  // GitHub Pages 没有 Node API；留空后，现有前端会直接请求 Open-Meteo。
  html = html.replace(apiSetting, "window.GZ_API_BASE = '';");

  // 去掉原先使用的第三方字体 CDN，页面改用系统字体回退，减少外部依赖。
  const externalFonts = '<link rel="stylesheet" href="https://miaoda.feishu.cn/fonts/css2?family=Barlow+Condensed:wght@500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap">\n';
  html = html.replace(externalFonts, '');

  await fs.rm(OUTPUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUTPUT, 'assets'), { recursive: true });
  await fs.writeFile(path.join(OUTPUT, 'index.html'), html, 'utf8');
  await fs.writeFile(path.join(OUTPUT, '.nojekyll'), '', 'utf8');

  for (const name of ASSETS) {
    const source = path.join(PUBLIC, 'assets', name);
    const target = path.join(OUTPUT, 'assets', name);
    const stat = await fs.stat(source);
    if (!stat.isFile()) throw new Error('缺少网站资源：' + source);
    await fs.copyFile(source, target);
  }
  for (const name of OPTIONAL_ASSETS) {
    const source = path.join(PUBLIC, 'assets', name);
    try {
      const payload = JSON.parse(await fs.readFile(source, 'utf8'));
      if (name === 'live-forecast.json' &&
        (payload.schemaVersion !== 1 || !Array.isArray(payload.forecast))) {
        throw new Error('静态预报快照格式不正确');
      }
      await fs.copyFile(source, path.join(OUTPUT, 'assets', name));
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn('未找到可选资源 ' + name + '；当前构建不包含自动同步预报');
      } else {
        throw error;
      }
    }
  }

  const publishedHtml = await fs.readFile(path.join(OUTPUT, 'index.html'), 'utf8');
  if (!publishedHtml.includes('id="sPacking"')) {
    throw new Error('GitHub Pages 首页缺少最少携带衣物区域');
  }
  if (publishedHtml.includes('/api/forecast') || publishedHtml.includes('/api/geocoding')) {
    throw new Error('静态网站仍引用不可用的服务端 API');
  }
  if (publishedHtml.includes('miaoda.feishu.cn')) {
    throw new Error('静态网站仍依赖原第三方字体 CDN');
  }
  for (const name of ASSETS) {
    await fs.access(path.join(OUTPUT, 'assets', name));
  }
  const publishedCore = await fs.readFile(path.join(OUTPUT, 'assets', 'app-core.js'), 'utf8');
  if (!publishedCore.includes('function recommendPacking(')) {
    throw new Error('GitHub Pages 首页缺少衣物推荐计算逻辑');
  }

  const entries = await fs.readdir(OUTPUT);
  const leakedBackend = entries.some(name => ['api', 'server', 'data', 'node_modules'].includes(name));
  if (leakedBackend) throw new Error('静态发布包不应包含后端目录');

  console.log('GitHub Pages 静态包构建完成：广州首页 + ' + ASSETS.length + ' 个前端资源');
}

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
