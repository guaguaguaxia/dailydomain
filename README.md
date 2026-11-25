# DailyDomain · 每日新注域名归档站

基于 Cloudflare Workers + D1 + R2 构建的每日新注域名采集、按天归档与检索平台，部署于 [https://domains.guaxiaai.com](https://domains.guaxiaai.com)。

## 架构概览

1. **数据源与自动同步**
   - 对接 WhoisExtractor Daily Domains API（`https://get.whoisextractor.com/?api=<KEY>&pid=10&date=YYYY-MM-DD`）。
   - Cloudflare Cron Triggers 在 **每日 UTC `01:15`、`06:15`**（`15 1,6 * * *`，对应北京时间 **`09:15`、`14:15`**）自动触发 `scheduled` 任务，今天仅幂等检查并同步 **昨天（UTC）** 已封版的全量数据；第二班次作为幂等兜底重试（若首班已完成则自动跳过）。
   - 支持在前端弹窗手动补拉/强制重拉指定日期，或调用 `POST /api/sync`（单次最多 7 天）。当 `force: true` 重拉时，会在请求上游 API 之前先清空该日期在 D1（`domain_chunks`、`daily_tld_stats`、`daily_batches`）与 R2 中的已有归档数据，再重新拉取入库。

2. **分块索引存储（D1 + R2）**
   - **Cloudflare R2 (`dailydomain`)**：按 `raw/YYYY/MM/YYYY-MM-DD.zip` 归档每日原始 ZIP 压缩包，用于零额外计算开销的原包下载及历史溯源。
   - **Cloudflare D1 (`dailydomain`, ID: `4adefd4d-6651-43f3-8d1f-9c296c657d3b`)**：
     - `daily_batches`：按天记录总量、TLD 种类数、分块数、ZIP/原始大小、R2 key、同步状态（`completed` / `unavailable` / `failed` / `syncing`）。
     - `daily_tld_stats`：按天统计各后缀 TLD 数量及索引，支持秒级 Top 后缀芯片展示与精确 TLD 总量统计。
     - `domain_chunks`：将当日按字典序去重排序后的域名每 **1,000 条**聚合成一个块（以 `\n...\n` 包裹存储），配合 `(day, chunk_index)` 与 `(day, first_domain, last_domain)` 索引，将每日数十万条域名入库压缩至数百次 D1 写入，并实现 O(1) 深度分页与快速前缀/后缀/关键词过滤。

3. **全站访问控制**
   - 除 `/login`、`/api/auth/login`、`/api/auth/logout` 与 `/api/health` 外，全部页面与接口均受保护。
   - 浏览器端通过登录页验证访问密码后签发 HMAC-SHA256 签名 `HttpOnly; Secure; SameSite=Lax` Cookie（有效期 30 天）。
   - API 调用支持携带 `Authorization: Bearer <ACCESS_PASSWORD>` 请求头。
   - 响应统一附加 `X-Robots-Tag: noindex, nofollow`、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`。

## 目录结构

- `src/index.ts`：Worker `fetch` 与 `scheduled` 入口、路由分发、认证中间件与安全响应头
- `src/auth.ts`：恒定时间密码校验与 HMAC-SHA256 无状态会话签名/验签
- `src/zip.ts`：零第三方依赖 ZIP 解析器（读取 Central Directory + `node:zlib` 解压 `dailyupdate.txt`）
- `src/sync.ts`：上游拉取、域名规范化/去重分块、R2 存档与 D1 批量入库
- `src/queries.ts`：总览统计、按天详情、O(1) 分页、TLD/前缀/关键词过滤、跨天检索及 TXT/CSV/ZIP 流式下载
- `src/ui.ts`：零外部 CDN 依赖中文控制台与登录界面
- `migrations/0001_init.sql`：D1 数据库初始化表结构与索引
- `scripts/build.mjs`：使用 `esbuild` 打包并压缩内嵌 UI 样式与脚本输出 `dist/worker.js`
- `cloudflare.config.ts`：Cloudflare 资源与绑定清单（不含密钥明文）
- `test/`：基于 Vitest 的 ZIP、鉴权、同步与查询集成测试

## 主要 API 端点

| 方法与路径 | 说明 | 鉴权 |
| --- | --- | --- |
| `GET /api/health` | 健康检查 | 公开 |
| `POST /api/auth/login` | 使用访问密码换取会话 Cookie | 公开 |
| `POST /api/auth/logout` | 清除会话 Cookie | 公开 |
| `GET /api/overview` | 获取已收录天数、总域名数、每日批次与 Top TLD | 需鉴权 |
| `GET /api/days/:date` | 获取指定日期（`YYYY-MM-DD`）汇总及 Top 40 TLD | 需鉴权 |
| `GET /api/days/:date/domains` | 分页/筛选查询当日域名（`q`、`tld`、`prefix`、`regex=1`、`page`、`pageSize`） | 需鉴权 |
| `GET /api/days/:date/download` | 流式下载（`format=txt\|csv\|zip`，TXT/CSV 支持 `tld`、`q`、`regex=1` 过滤） | 需鉴权 |
| `GET /api/search` | 跨天关键词或正则全局搜索（`q`、`tld`、`regex=1`、`limit`） | 需鉴权 |
| `POST /api/sync` | 手动同步或强制重拉（Body: `{ date?, dates?, force? }`） | 需鉴权 |

## 密钥管理与密码轮换

本项目不在代码库中保存任何密钥。Worker 运行时依赖以下三个 Cloudflare Secret：

- `ACCESS_PASSWORD`：站点登录及 Bearer API 访问密码
- `SESSION_SECRET`：用于签名 `dd_session` Cookie 的随机密钥
- `WHOISEXTRACTOR_API_KEY`：WhoisExtractor Daily API Key

**轮换方式**：在 Cloudflare Dashboard → **Workers & Pages** → `dailydomain` → **Settings** → **Variables and Secrets** 中更新对应 Secret 并保存（或通过 Cloudflare Workers API 更新 Secret）。更新 `SESSION_SECRET` 会使此前所有已登录会话立即失效；仅更新 `ACCESS_PASSWORD` 则仅影响新登录与 Bearer 请求。

## 本地开发与验证

```bash
npm install
npm run typecheck
npm test
npm run build
```
