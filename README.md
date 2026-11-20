# 广州 · 四天窗口监测

判断广州中心城区**未来哪连续四天最适合出行**（4 天 3 晚）。首屏只回答四件事：什么时候出发、四天什么天气、现在能不能安排、要不要继续等；所有模型明细、回测与公式收在「查看数据依据」里，默认折叠。

线上页面：<https://hcnlnejwgxc4.doubao.link/app/app_17j5a7evesj>（`app_id=app_17j5a7evesj`）

---

## 1. 这个仓库是什么

原始交付物是一个**单文件 HTML**（CSS/JS 全内联、无后端）。本仓库在不改动任何判定口径的前提下做了三件事：

1. 把页面拆成 `public/index.html` + `app.css` + 三个按顺序加载的 JS 模块（core / charts / runtime，原单文件 JS 只做切分、未改逻辑）+ 内置快照数据；
2. 从同一份模块自动截取出 Node 可导入的纯逻辑模块 `src/core/logic.js`（**不是重写**，见 `scripts/sync-core.mjs`）；
3. 增加一个**可选**的 Node 服务（缓存、定时刷新、JSON API、静态托管）。没有它，页面仍可像原来一样直接访问 Open-Meteo 独立运行。

> 口径红线：天气判定、历史统计、模型权重、回测方法一律以本仓库 `src/core/logic.js` 与 `data/*.json` 为准。换手开发时不要“顺手优化”这些数值。

### 目录

```text
.
├── public/                     # 可直接静态部署的前端
│   ├── index.html              # 极简首屏 + 折叠的「数据依据」
│   └── assets/
│       ├── app.css             # 全部样式（响应式）
│       ├── app-core.js         # 常量、评分、四天窗口、风险与三档结论
│       ├── app-charts.js       # 图表、表格、日历、行程评估等渲染
│       ├── app-runtime.js      # 取数、缓存、实况回填、boot 与事件绑定
│       └── snapshot-data.js    # 2026-11-14 内置离线快照
├── src/core/logic.js           # 自动生成（git 忽略）：页面逻辑的 Node 版本；npm install/test/start 会重建
├── server/                     # 可选后端
│   ├── index.js                # HTTP 服务：静态页 + /api/*
│   ├── config.js               # 环境变量与四点坐标
│   ├── openmeteo.js            # 预报抓取（URL 与页面完全同参）
│   ├── cache.js                # 磁盘缓存（原子写）
│   ├── forecast-service.js     # 单飞刷新、过期重抓、失败保留旧数据
│   └── scheduler.js            # 定时刷新
├── scripts/
│   ├── sync-core.mjs           # 三个前端模块 → src/core/logic.js
│   ├── export-data.mjs         # 页面常量 → data/*.json
│   └── check-page.mjs          # 静态检查（语法 + 关键结构）
├── data/                       # 已固化的数据资产（口径见 data/README.md）
│   ├── climatology.json        # ERA5 11 年逐月窗口统计
│   ├── backtest.json           # 按真实起报时间的分层回测
│   ├── weights.json            # 模型权重 / 机构映射 / 评分权重
│   ├── sources.json            # 数据源清单
│   ├── condition-matrix.json   # 天气现象评分矩阵
│   ├── snapshot-*.json         # 离线快照
│   └── cache/                  # 运行时缓存（git 忽略）
├── test/                       # node:test 断言
├── .env.example
├── package.json
└── package-lock.json
```

---

## 2. 运行

要求 Node **>= 22**（用到内置 `fetch`、`--env-file-if-exists`、`node:test`）。

```bash
npm install           # 无第三方依赖；postinstall 会生成 src/core/logic.js
cp .env.example .env  # 可选；不配也能跑
npm start             # http://127.0.0.1:8787
```

- 只想要页面：把 `public/` 整个目录丢到任意静态托管即可。此时 `window.GZ_API_BASE` 为空，页面直连 Open-Meteo，并用浏览器 `localStorage`（键 `gz_wx_v9`，TTL 6 小时）缓存。
- 想让页面走服务端缓存：用 `npm start`。服务端会把 `index.html` 里的 `window.GZ_API_BASE = ''` 替换为 `/api/forecast`，页面优先请求同源接口，失败自动回退直连。

测试与检查：

```bash
npm test              # 12 项：窗口/判定/风险分级/权重/气候/回测结构/接口
npm run check:page    # 三个 JS 模块语法 + 首页关键结构
```

---

## 3. 数据流

```text
Open-Meteo（4 个城区点位 × 6 个数值模式，16 天）
        │  server/openmeteo.js（或浏览器 fetchLive）
        ▼
aggPoints()  四点合成一份（天气现象取众数，温度/降水/风取中位）
        ▼
fromOpenMeteo()  按模式汇总 → 每日 recs / 中位温度 / 中位降水 / pop / 模式覆盖数 n
        ▼
buildWindows()  14 天 → 11 个连续四天窗口
        ▼
riskOf / winPen / verdictOf → 推荐出发 / 可以考虑 / 建议继续等待
        ▼
renderSimple()  首屏；renderRank/renderTrend/renderProb/renderAccV2 折叠区
```

- 预报接口（页面与服务端同一条，参数逐字一致）：
  `https://api.open-meteo.com/v1/forecast?latitude=23.125,23.129,23.135,23.09&longitude=113.24,113.267,113.33,113.31&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=Asia%2FShanghai&forecast_days=16&models=ecmwf_ifs025,ecmwf_aifs025_single,ukmo_seamless,cma_grapes_global,icon_seamless,meteofrance_seamless`
- 实况回填：同接口加 `hourly=precipitation&past_days=7&forecast_days=1`，今天按 06:00 至当前逐小时累计 ≥1.0mm 判雨。
- 历史再分析：`https://archive-api.open-meteo.com/v1/archive`（ERA5，UTC 日，广州 23.13N/113.26E，2015-01-01—2025-12-31）。
- 回测：`https://single-runs-api.open-meteo.com/v1/forecast`，**必须** `timezone=UTC`、`run=<YYYY-MM-DD>T00:00`；`previous-runs-api` 只有最近 8 天带真实 pop。

有效率事实（页面会如实标注，不要抹平）：ECMWF/AIFS 15 天、UKMO/ICON 7 天、CMA 5 天、Météo-FR 4 天。远期只剩 ECMWF 一家，覆盖不足即标「暂定」并降为「建议继续等待」。

---

## 4. 判定口径（不可改）

### 4.1 两套窗口

- **严格档**：晴 / 多云且无雨（`ok`）。
- **放宽档**：阴天也可接受，但不得下雨（`loose`）。
- 阴天**不扣分**。跨周末窗口只作备用，不优先。

### 4.2 判雨

```text
realRain = 天气现象属于雨类 且（日降水 mm ≥ 1.0 或 pop ≥ 60）
heavy    = 重雨权重过半
```

区分短时小雨与全天降雨：`mist` / `rainLevel==='零星'` 只轻扣，不淘汰整窗；`mmMed ≥ 10` 的四天直接判「建议继续等待」。温度舒适度（最高温偏离 23℃、最低温 < 12℃）只作辅助扣分。

### 4.3 三档结论

`winPen` 对四天累计罚分：

| 条件 | 结论 |
| --- | --- |
| 任一天 `mmMed ≥ 10` | 建议继续等待 |
| 罚分 ≤ 22，无中/高降雨风险，最低置信 ≥ 2 | 推荐出发 |
| 罚分 ≤ 72，高降雨风险 ≤ 1 天，最低置信 ≥ 1 | 可以考虑 |
| 其余 | 建议继续等待 |

天气接近的窗口：先取罚分最小档（相差 10 分以内），再按最低置信度、罚分、日期先后排序。**模型覆盖率、机构独立性、预报分歧只进置信度，不进天气评分。**

### 4.4 置信度

- 机构投票：`ORG` 把 `ecmwf_ifs025` 与 `ecmwf_aifs025_single` 合并为 ECMWF 一家（5 家机构 / 6 个模式）。
- 分层：1–3 天 / 4–7 天 / 8–10 天 / 11–15 天。
- 页面只显示「高 / 中 / 低」+ 一句原因，不展示模型数量与名称。

### 4.5 模型权重（广州本地、同提前量平衡准确率重排，合计 1.0）

| 模式 | 权重 |
| --- | --- |
| `ecmwf_ifs025` | 0.18 |
| `ecmwf_aifs025_single` | 0.18 |
| `meteofrance_seamless` | 0.18 |
| `cma_grapes_global` | 0.16 |
| `ukmo_seamless` | 0.16 |
| `icon_seamless` | 0.14 |

> 美国 GFS 因降水偏湿虚报已剔除，不要再加回来。

### 4.6 ERA5 历史统计

`data/climatology.json`：2015-01-01—2025-12-31，4018 天，缺 0 天。指标是「每月至少出现一次合格四天窗口的真实年份占比」，严格档与放宽档分开。11 月：严格档 1/11（2019 年），放宽档 11/11。

### 4.7 回测（`data/backtest.json`）

- 仅用 Single Runs 按真实起报时间回算；UTC 日；6 模式（剔除 GFS）；起报 2026-07-12—2026-11-18，126 个 00Z 成功；目标日 2026-07-13—11-18。
- 样本：1 天 125、3 天 123、5 天 121、7 天 119、10 天 116；参与机构/模式 1 天 5 家/6 个、3 天 5 家/6 个、5 天 3 家/4 个、7 天与 10 天仅 ECMWF 一家 2 个产品。
- 样本期 129 天中 98 天有雨（76.0%），因此同时给「无雨日命中」与「平衡准确率」。
- 结论：**组合不总优于最佳单模型**——1 天组合 87.4%（ECMWF 87.9%）、3 天组合 86.0%（Météo-FR 83.9%）、5 天组合 88.0%（ECMWF-AI 85.8%）、7 天组合 79.1%（ECMWF-AI 80.5%）、10 天 78.2% vs 78.0%（仅同机构两产品，不算跨机构集成）。
- Brier **未计算**：Single Runs 存档 `pop` 全空；Previous Runs 有真实概率但只有最近 8 天，样本不足。雨量误差单列第三表。
- 缺失起报 2026-10-01、10-17、10-18（存档不可用）与 11-02（抓取失败）保持缺失，未补造。

---

## 5. 可选后端

### 环境变量

复制 `.env.example` 为 `.env`。全部可缺省：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址；容器部署可设 `0.0.0.0` |
| `CACHE_TTL_MINUTES` | `360` | 缓存有效期（与页面 6 小时一致） |
| `REFRESH_INTERVAL_MINUTES` | `360` | 定时刷新间隔，最小 5 分钟 |
| `CACHE_FILE` | `data/cache/forecast.json` | 磁盘缓存路径 |
| `OPEN_METEO_BASE` | `https://api.open-meteo.com/v1/forecast` | 可指向自建代理 |
| `FORECAST_POINTS` | 四点默认 | `lat,lon;lat,lon;...` |
| `FORECAST_DAYS` | `16` | 预报天数 |
| `REQUEST_TIMEOUT_MS` | `14000` | 单次请求超时 |
| `ALLOW_FORCE_REFRESH` | `false` | 是否允许 `?force=1` 跳过缓存 |

**当前不需要任何 API Key / Token / Cookie。** Open-Meteo 免费、免密钥；若将来接入付费源，只加到 `.env`，不要写进代码或提交。

### 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 缓存时间、是否过期、最近错误 |
| GET | `/api/forecast` | `{updatedAt, stale, ageMinutes, days, windows}` |
| GET | `/api/forecast/raw` | 聚合后的 `daily` 原始数组 |
| GET | `/api/config` | 点位、天数、缓存 TTL |
| GET | `/api/data/{name}` | `climatology` / `backtest` / `weights` / `sources` / `snapshot-2026-11-14` / `snapshot-raw` / `condition-matrix` / `confidence-levels` |

缓存策略：启动即刷一次；命中 6 小时内缓存不重复请求；刷新失败保留旧数据并标 `stale`；页面侧再兜底到内置快照。

### 部署

- 静态：上传 `public/`（Nginx / 对象存储 / 飞书应用托管均可）。
- 服务：`npm start`，Nginx 反代到 `127.0.0.1:8787`；`data/` 需可写。单进程即可，定时器进程内运行，无需 cron。
- 继续用豆包 HTML 应用发布时：`lark-cli apps +deploy --file-path "<相对路径>" --app-id app_17j5a7evesj`，再用 `+release-get` 轮询到 `finished`。注意 `--file-path` 只收相对 cwd 的路径，且必须与 `cd` 同一条命令。

---

## 6. 交接状态

已验证通过：

- `npm test`：**12/12 通过**（窗口数量与跨度、阴天零扣分、持续降雨判等待、单日小雨可考虑、风险分级、置信分层、权重合计 1.0 与 ECMWF 合并计票、ERA5 11 年、回测分层与 Brier 为 null、URL 参数、缺失模式覆盖、HTTP 接口与静态资源）。
- `npm run check:page`：通过。
- 服务端实跑：`/api/health` 返回 `stale:false`，缓存 16 天数据；首页截图确认首屏为 `11-27 出发 · 11-30 返程`、四天逐日天气、`建议继续等待`、`暂定`、`更新于 11-20 21:57`。

尚未包含 / 需要接手注意：

1. **126 个 Single Runs 原始响应与 `/tmp/backtest.py` 未随仓库提供**（原工作区为临时目录，已清理）。回测结论以 `data/backtest.json` 固化；重跑需按第 4.7 节与 `data/README.md` 的接口参数重新抓取，缺失日期不得补造。
2. **Brier 分数为空**，原因见上；不要用模拟概率填充。
3. 页面的旧版研究报告（01–07 节）仍保留在 `#evidence` 折叠区，作为数据依据；首屏已不展示。
4. 浏览器缓存键 `gz_wx_v9` 与服务端缓存互相独立；换域名/清缓存后首屏会先显示内置快照再自动更新，属预期。
5. Windows 侧另有一份旧副本，未纳入本仓库；以本仓库 `public/` 为准。
6. 线上页面当前仍是“浏览器直连 + localStorage”版本；本仓库的服务端模式需部署后才会生效。

---

## 7. 数据来源

见 `data/sources.json`（中央气象台、ECMWF、和风天气、中国天气网等页面溯源清单）与 Open-Meteo（预报 / ERA5 / Single Runs）。页面内不展示这些技术细节。

## 8. 许可

内部项目，未授权不得外传。`package.json` 标记 `UNLICENSED`。
