import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/app-charts.js', import.meta.url), 'utf8');

function chartEnvironment() {
  const element = { innerHTML: '', textContent: '', clientWidth: 360 };
  const listeners = new Map();
  const window = {
    innerWidth: 390,
    addEventListener(name, fn) {
      const list = listeners.get(name) || [];
      list.push(fn);
      listeners.set(name, list);
    }
  };
  const document = {
    getElementById(id) { return id === 'trendchart' ? element : null; },
    querySelectorAll() { return []; }
  };
  const context = vm.createContext({
    window,
    document,
    selectDisplayWindow() { return null; }
  });
  vm.runInContext(source, context, { filename: 'app-charts.js' });
  return { context, element, listeners };
}

const sample = {
  windows: [],
  days: [
    { date: '11-24', hi: 25, lo: 17, popMax: 40, recs: [{ p: 'ecmwf_ifs025', hi: 24 }] },
    { date: '11-25', hi: 26, lo: 18, popMax: 60, recs: [{ p: 'ecmwf_ifs025', hi: 25 }] },
    { date: '11-26', hi: 24, lo: 17, popMax: null, recs: [] }
  ]
};

test('趋势图以原生 SVG 绘制温度、ECMWF 和降雨概率', () => {
  const { context, element } = chartEnvironment();
  context.renderTrend(sample);
  assert.match(element.innerHTML, /<svg class="trend-svg"/);
  assert.match(element.innerHTML, /class="trend-max"/);
  assert.match(element.innerHTML, /class="trend-min"/);
  assert.match(element.innerHTML, /class="trend-ecmwf"/);
  assert.match(element.innerHTML, /class="trend-rainbar"/);
  assert.match(element.innerHTML, /最高温/);
  assert.match(element.innerHTML, /降雨概率/);
  assert.doesNotMatch(element.innerHTML, /NaN|undefined/);
});

test('重复刷新趋势图只注册一次 resize 监听', () => {
  const { context, listeners } = chartEnvironment();
  context.renderTrend(sample);
  context.renderTrend(sample);
  assert.equal(listeners.get('resize').length, 1);
});

test('趋势图不依赖 ECharts 或其他外部图表脚本', () => {
  assert.doesNotMatch(source, /echarts/i);
});
