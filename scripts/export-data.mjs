// 把页面内置的数据资产导出为独立 JSON，供服务端、回测脚本与后续开发复用。
// 数据来自线上页面同一份常量，不做二次计算、不改口径。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLIMO, CLIMO_META, BT, BT_ORG, BT_LEADS, SRC, SNAP, SNAP_RAW,
  W_MDL, MDL, ORG, ORG_NAME, MODEL_TOTAL, W_SCORE, RUB, CONF_TXT
} from '../src/core/logic.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data');
fs.mkdirSync(dir, { recursive: true });

const write = (name, obj) => {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log('  data/' + name);
};

write('climatology.json', { meta: CLIMO_META, months: CLIMO });
write('backtest.json', {
  point: '23.13N 113.26E',
  timezone: 'UTC',
  source: 'Open-Meteo Single Runs（按真实起报时间回算）',
  leads: BT_LEADS,
  organizations: BT_ORG,
  result: BT
});
write('weights.json', { models: W_MDL, models_meta: MDL, organizations: ORG, organization_names: ORG_NAME, model_total: MODEL_TOTAL, score_weights: W_SCORE });
write('sources.json', SRC);
write('condition-matrix.json', RUB);
write('confidence-levels.json', CONF_TXT);
write('snapshot-2026-11-14.json', SNAP);
write('snapshot-raw.json', SNAP_RAW);
fs.writeFileSync(path.join(dir, 'README.md'), `# data/

| 文件 | 内容 | 口径 |
| --- | --- | --- |
| \`climatology.json\` | ERA5 2015-01-01—2025-12-31（4018 天）逐月统计 | 每月「至少出现一次合格四天窗口」的真实年份占比；严格档=晴/多云无雨，放宽档=阴也可但不下雨 |
| \`backtest.json\` | 按真实起报时间的逐提前量回测（1/3/5/7/10 天） | Single Runs，UTC 日，6 模式（剔除 GFS），起报 2026-07-12—2026-11-18，126 个 00Z；目标日 2026-07-13—11-18 |
| \`weights.json\` | 模型权重、机构映射、天气评分权重 | 权重按广州本地同提前量平衡准确率重排，合计 1.0 |
| \`snapshot-2026-11-14.json\` | 页面内置离线快照（6 模式 / 四城区合成） | 仅作断网兜底，不代表实时 |
| \`snapshot-raw.json\` | 内置快照的原始视图对象 | 同上 |

回测中的缺失起报日（2026-10-01、10-17、10-18 存档不可用；11-02 抓取失败）保持缺失，未补造。
所有 JSON 由 \`npm run data:export\` 从 \`src/core/logic.js\` 导出，不手工编辑。
`, 'utf8');
