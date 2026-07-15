# 实用查

独立实用信息查询（H5 + 轻量 API），与 **wikimap 后台剥离**，参考同类独立工程（如 `gongchang`）自包含目录。

默认本地城市：**临沂**（可在 `packages/shared/config.mjs` 换城）。

## 产品配比

| 类型 | 占比 | 模块 |
|------|------|------|
| **本地服务** | ~60% | 临沂天气、空气质量、医院速查、便民电话、区划邮编、办事指南、本地银行、出行、公交 GPS |
| **全国工具** | ~40% | 官方导航、身份证归属、油价、台风、地震、联行号、坐标、节假日 |

后续扩城：复制 `data/local/linyi/` → `data/local/<city_id>/`，并改配置即可。

## 目录

```
apps/web/          Vue3 + Vite + Leaflet（5176）
apps/api/          Node HTTP API（5180）
packages/shared/   天气 / 银行 / 节假日核心
data/              联行号种子 · 临沂本地 JSON · 节假日
docs/              小程序后接说明
```

**不依赖** wikimap 的 Directus / search-api / `@wikimap/*`。

## 快速开始

```powershell
cd D:\projects\tool
npm install
npm install --prefix apps/web
npm run build
npm run dev:preview   # API + 静态预览（省内存，推荐）
# 或 npm run dev      # API + Vite 热更新（更吃内存）
```

- Web：http://localhost:5176
- API：http://127.0.0.1:5180/api/v1/health

| 命令 | 说明 |
|------|------|
| `npm run dev:preview` | API + dist 静态预览（反代 API） |
| `npm run dev` | API + Vite 开发服 |
| `npm run api` / `npm run web` / `npm run serve` | 单独起 |
| `npm run build` | 构建 H5 |
| `npm run smoke` | 冒烟 |
| `npm run license:issue -- --plan once\|month\|quarter` | 签发激活码（客服发放） |

## 配置

见 `.env.example`：`API_PORT`、`CS_WECHAT`（客服索码）、`JUHE_INTERBANK_KEY`（可选）。

银行支行编码全量：

1. 将 `银行支行编码.xlsx` 放在项目根或 `data/`
2. `npm run import:cnaps` → 生成 `data/cnaps-full.jsonl`
3. 详见 [docs/银行支行编码.md](docs/银行支行编码.md)

批量查询与激活码（按次 / 包月 / 包季）：见 [docs/批量查询与激活码.md](docs/批量查询与激活码.md)，页面 `/bank/batch`。

临沂公交 GPS（开放网）：见 [docs/临沂开放数据-公交GPS.md](docs/临沂开放数据-公交GPS.md)，页面 `/bus`；配置 `LYDATA_CLIENT_ID` 后可用。

本地银行地图：见 [docs/本地银行网点地图.md](docs/本地银行网点地图.md)，页面 `/local-bank`；配置 `AMAP_WEB_KEY` 后 `npm run geocode:linyi-banks`。

## 与 wikimap 的关系

- 原型曾在 `wikimap/apps/typhoon-radar`，**现已迁至本仓库继续迭代**。
- wikimap 主站「相关工具」仅保留入口说明；功能以本项目为准。

## 小程序

见 [docs/MINIPROGRAM.md](docs/MINIPROGRAM.md)（H5 → web-view 或原生页）。

## 地震通报

- 页面：`/earthquake`
- API：`GET /api/v1/national/earthquake/list`、`/eew`
- 数据：Wolfx 聚合的中国地震台网列表；相对临沂距离与「本地关注」；EEW 仅展示 30 分钟内样本

## 官方信息查询

- 页面：`/official-nav`
- 首页「全国工具」入口：**官方信息查询**
- 外链表：`apps/web/src/data/officialNav.js`（学信、征信、企信、裁判文书等）
- 说明：部分政务站对人机验证较严；专利原 `epub.cnipa.gov.cn` 不稳定，已改为国家知识产权局官网入口；招投标使用 `http://www.cebpubservice.com/`（https 网关常 502）

## 新增值得用的查询

| 页面 | API | 说明 |
|------|-----|------|
| `/aqi` | `GET /api/v1/weather/aqi` | 临沂空气质量（Open-Meteo） |
| `/hospitals` | `GET /api/v1/local/hospitals` | 临沂医院速查 |
| `/id-region` | `GET /api/v1/national/id-region?q=` | 身份证归属 / 校验位 |
| `/oil` | `GET /api/v1/national/oil` | 山东油价参考（`data/national/oil-prices.json`） |
| `/history-today` | `GET /api/v1/local/history-today` | 临沂历史上的今天 |
| `/admin` | `GET /api/v1/admin/analytics/*` | 访问统计后台（需 `ADMIN_TOKEN`） |

## 页面分享

- 各查询页顶栏右侧统一「分享」（`SubNav`）；台风天气页在自定义顶栏同样提供
- 优先调用系统 `navigator.share`，否则复制「标题 + 说明 + 当前链接」
- 历史上的今天同步 `?date=MM-DD`；银行查询同步筛选条件；身份证归属仅同步 6 位区划码（不分享完整证件号）
- 运营后台 `/admin` 不提供分享；埋点 `page.share`

## 访问统计与运营后台

- 前台路由自动上报 `page.view`；落盘 `data/analytics/`（gitignore）
- 后台：`/admin`（`ADMIN_TOKEN` / 头 `X-Admin-Token`）
  - **概况**：PV/UV、热门页、待处理反馈、生效公告、上架工具数
  - **工具**：是否展示、上下排序（写 `data/ops/catalog.json`）
  - **公告**：发布 / 上下架 / 过期；前台首页展示（`GET /api/v1/notices`）
  - **反馈**：用户 `POST /api/v1/feedback` 或页面 `/feedback`；后台标记已读/完成/垃圾
  - **访问**：设备分维、趋势、最近事件
- 公开目录：`GET /api/v1/catalog`（仅 enabled 项，按 sort）

## 临沂历史上的今天

- 页面：`/history-today`；首页本地服务首位 + 今日摘要卡片
- 数据：`data/local/linyi/history-today.json`（按 `mmdd` 检索；无专条时回落当月条目）
- API：`GET /api/v1/local/history-today?date=MM-DD`

## 免责

气象、地震、联行号、电话、办事信息与地方史条目仅供参考，不构成官方预警、结算/办事依据或史学定论。以防灾部门公告与地方志为准。
