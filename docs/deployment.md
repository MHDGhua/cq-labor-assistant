# 部署说明

## 部署模式

### 1. SQLite 回退模式（本地演示）

后端默认读取 `DATABASE_URL`。未设置该变量时，会自动使用 `sqlite:///./law.db`，适合简历现场演示、无数据库环境或快速验证 `/manage` 素材导入。

```bash
npm install
python -m pip install -r backend/requirements.txt
```

两个终端分别启动后端和前端：

```bash
npm run dev:backend
```

```bash
npm run dev
```

启动后访问 `http://localhost:3000/manage`，可以粘贴或上传 CSV/JSON，批量导入案例和知识文档素材，并查看最近分析历史与 trace 摘要。
`/manage` 需要输入与后端一致的 `ADMIN_TOKEN`；本地手动启动时请在前后端终端都设置同一个值。若只想给演示或运营人员查看后台，可设置 `ADMIN_VIEW_TOKEN`，它只能读取运行态、历史、反馈和审计日志，不能导入或删除素材。

### 2. Docker Compose 一键启动（完整演示）

一条命令启动前端、后端和 PostgreSQL：

```bash
docker compose up --build
```

Compose 会把前端容器的 `BACKEND_URL` 指向 `http://backend:8000`，把后端容器的 `DATABASE_URL` 指向内置 PostgreSQL，并通过 healthcheck 等待 PostgreSQL 和后端就绪。未显式设置时，Compose 使用 `dev-admin-token` 作为可写演示口令，`dev-view-token` 作为只读演示口令；正式部署必须覆盖 `ADMIN_TOKEN` 和 `ADMIN_VIEW_TOKEN`。启动后访问 `http://localhost:3000`，后端 API 位于 `http://localhost:8000`。

### 3. 手动 PostgreSQL 部署

如果不使用 Compose，可以手动配置前后端和数据库：

```powershell
# 后端终端
$env:DATABASE_URL = "postgresql+psycopg2://law:law_password@localhost:5432/law_assistant"
npm run dev:backend

# 前端终端
$env:BACKEND_URL = "http://127.0.0.1:8000"
npm run dev
```

如果要回退到 SQLite，只需不设置 `DATABASE_URL`，后端会回到 `sqlite:///./law.db`。
如果要访问 `/manage`，还需要设置 `ADMIN_TOKEN`，例如：

```powershell
$env:ADMIN_TOKEN = "change-me-admin-token"
$env:ADMIN_VIEW_TOKEN = "change-me-readonly-token"
```

## `/manage` 批量导入格式

- 案例 CSV 表头：`title,scenario,district,year,summary,holding,sourceUrl,sourceLabel,tags`。
- 知识文档 CSV 表头：`title,category,region,year,summary,content,sourceUrl,sourceLabel,tags,isActive`。
- `tags` 可用 `|`、`;`、`；`、`、` 或 `，` 分隔。
- `scenario` 可用 `wage_arrears`、`unlawful_termination`、`no_written_contract`、`overtime`、`labor_relation`、`social_insurance`、`work_injury`、`female_protection`、`non_compete`、`pay_benefits` 或 `mixed`。
- `category` 可用 `law`、`judicial_interpretation`、`local_case`、`procedure` 或 `policy`。
- 案例 JSON 可以直接传数组，也可以传带 `cases`、`items` 或 `rows` 字段的对象。
- 知识文档 JSON 可以直接传数组，也可以传带 `docs`、`items` 或 `rows` 字段的对象。
- 未提供 `id` 时会自动生成稳定 ID，同一素材重复导入会更新同一条记录，不会重复堆积。
- 导入后内容进入内部素材库，首页只用于对话式分析、缺失事实追问和少量来源引用，不展开全量案例。
- 分析历史与 trace 只在 `/manage` 内部展示，用于复盘 provider、agent 链路、命中素材和质量标记，不暴露完整案例库。

## 部署建议

- 前端：Vercel、Netlify 或 Cloudflare Pages。
- 后端：Render、Railway、Fly.io 或云服务器。
- 数据库：Render Postgres、Railway Postgres、Supabase Postgres、自建 PostgreSQL，或演示用 SQLite 回退。
- Docker 演示：`docker compose up --build` 启动完整栈。
- 公网稳定演示：优先使用 `docker-compose.prod.yml`，Caddy 负责 80/443 和 HTTPS，前端/后端/数据库留在 Docker 内网，后端仅绑定 `127.0.0.1:8000` 供本机排障。

## 生产 Runbook

### 1. 环境变量和密钥

本地开发或演示时，复制 `.env.example` 为 `.env.local`，把真实密钥只写入 `.env.local` 或当前终端环境变量；`.env.local` 已用于本地后端和 DeepSeek shadow 评测读取，但不应提交到仓库。

DeepSeek 生产最小配置：

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=replace-with-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_REASONING_EFFORT=medium
DEEPSEEK_TIMEOUT_SECONDS=45
AI_TRACE=false
```

管理端必须配置强口令：

```env
ADMIN_TOKEN=replace-with-long-random-writer-token
ADMIN_VIEW_TOKEN=replace-with-long-random-readonly-token
```

前端和后端分开部署时，前端必须配置：

```env
BACKEND_URL=https://your-backend.example.com
```

公网 Compose 演示还需要配置：

```env
SERVER_NAME=your-domain.example.com
```

注意：`DEEPSEEK_API_KEY` 只给后端或服务端运行环境使用，不要暴露给浏览器端公开变量；不要使用 `NEXT_PUBLIC_` 前缀保存密钥。

### 1.1 演示账号和角色

- 普通访客：不需要 token，只访问首页 `/`，可以提交案情、查看公开结论、补充问题、少量引用、免责声明和反馈入口。
- 只读管理员：使用 `ADMIN_VIEW_TOKEN` 解锁 `/manage`，可查看运行态、`/healthz`、历史 trace 摘要、反馈、审计日志和质量门禁；不能导入、删除或修改素材。
- 可写管理员：使用 `ADMIN_TOKEN` 解锁 `/manage`，可导入/删除案例和知识文档，执行素材补齐与反馈复盘闭环。
- 演示时不要公开展示可写 token；如果需要给面试官或观察者看后台，优先发只读 token。
- 两个 token 必须不同且足够长；如果发现 token 泄露，先轮换环境变量，再重启前端和后端容器。

### 2. 数据库模式与 fallback

- PostgreSQL 是生产优先模式。只要设置 `DATABASE_URL=postgresql+psycopg2://...`，后端就连接 PostgreSQL。
- SQLite 是演示 fallback。未设置 `DATABASE_URL` 时，后端自动使用 `sqlite:///./law.db`。
- Docker Compose 默认把后端 `DATABASE_URL` 指向内置 PostgreSQL，不会走 SQLite。
- 如果 PostgreSQL 连接失败，当前服务不会自动切换到 SQLite；需要修复数据库连接或临时移除 `DATABASE_URL` 后重启，才能进入 SQLite 演示模式。
- 独立部署时要给数据库做持久化、备份和连接串密钥管理；容器内 SQLite 只适合短期演示，不适合作为生产数据源。

### 3. Docker Compose 上线演练

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

如果服务器内 Docker 构建容器无法解析 npm registry，前端改走“服务器本地预构建”路径：

```bash
# 1. 从上一版成功镜像提取 Linux 依赖
docker create --name frontend-artifact new-project-frontend
docker cp frontend-artifact:/app/node_modules /tmp/frontend-node_modules
docker rm frontend-artifact

# 2. 同步最新源码后，把 Linux 依赖复制回项目目录
cp -a /tmp/frontend-node_modules /opt/new-project/node_modules

# 3. 在服务器本地生成新的 .next
docker run --rm -v /opt/new-project:/app -w /app node:20-alpine \
  sh -lc "node node_modules/next/dist/bin/next build"

# 4. 再构建运行时镜像并启动
docker compose -f docker-compose.prod.yml up -d --build
```

当前生产 `Dockerfile.frontend` 已按这个路径收敛：它不再在容器内联网安装依赖，而是直接打包 `node_modules`、`.next` 和 `public` 作为运行时镜像。因此服务器二次发布时，要么沿用上面的预构建步骤，要么先恢复容器 DNS，再改回在线安装依赖的多阶段构建。

上线前置条件：

- `SERVER_NAME` 已设置为真实域名，DNS A/AAAA 已指向服务器公网 IP。
- 服务器安全组和防火墙放行 80/443；生产 Compose 里的 Caddy 使用 host network 接管公网入口。
- 后端 API 不直接暴露公网；`127.0.0.1:8000` 只给本机 `curl`、日志排障和 health check 使用。
- `ADMIN_TOKEN`、`ADMIN_VIEW_TOKEN`、`DEEPSEEK_API_KEY` 和数据库密码已通过服务器环境变量或 `.env.local` 管理，未写入 Git。

启动后检查：

```bash
curl http://localhost:8000/healthz
curl -H "x-admin-token: dev-admin-token" http://localhost:8000/runtime
curl https://your-domain.example.com/api/healthz
```

预期：

- `/healthz` 返回 HTTP 200，且 `status` 为 `ok`、`ok` 为 `true`。
- `/runtime` 返回 `providerMode`、`model`、`apiKeyConfigured`、`database` 等非敏感运行态。
- 浏览器访问 `https://your-domain.example.com/` 能打开首页并完成一次案情分析。
- 浏览器访问 `https://your-domain.example.com/manage`，用只读 token 能看运行态和质量门禁，用可写 token 才能导入/删除素材。

### 4. healthz/health check 判读

当前后端生产健康端点是 `GET /healthz`，`GET /health` 保留为兼容别名。Docker Compose healthcheck 已使用 `/healthz`，云平台 readiness/health check 也建议填写 `/healthz`。

判读规则：

- `200` 且 `{"status": "ok", "ok": true, ...}`：后端进程和数据库计数检查可响应。
- `status` 为 `degraded` 或 `databaseReachable` 为 `false`：后端仍可响应，但数据库查询失败，需要优先修数据库连接。
- 非 `200`、超时或连接拒绝：后端未启动、端口未暴露、容器仍在启动、反向代理配置错误，或进程崩溃。
- `databaseLabel` 字段只展示脱敏数据库标签，不包含账号密码或 query string。
- `caseCount`、`activeKnowledgeDocCount` 过低：服务可用但 RAG 素材不足，不建议放量。

`/healthz` 不等于回答质量合格；上线前还必须确认 DeepSeek provider、RAG 素材、反馈和审计闭环。

### 5. 上线前验证清单

```bash
npm run evals
npm run evals:adapted
npm run evals:adapted-review
npm run evals:quality
npm run evals:shadow
npm run evals:drafts
npm run release:check
npm run test:all
npm run build
python -m compileall backend
```

可选 DeepSeek 真实 provider smoke：

```bash
$env:AI_PROVIDER = "deepseek"
$env:DEEPSEEK_API_KEY = "replace-with-deepseek-key"
$env:DEEPSEEK_SHADOW_LIMIT = "2"
npm run evals:deepseek
```

上线前人工检查：

- `docker compose -f docker-compose.prod.yml config` 通过，Caddyfile 中 `SERVER_NAME`、反代目标和固定 Docker 内网地址与 Compose 一致。
- `/manage` 用 `ADMIN_TOKEN` 可导入和删除素材，用 `ADMIN_VIEW_TOKEN` 只能查看，不能写入。
- 导入至少一批案例和知识文档后，在首页提交案情，结果应包含结论、缺失事实追问、下一步和少量来源引用，不展示全量案例库。
- `npm run evals:adapted` 和 `npm run evals:adapted-review` 应通过，确认 50 条公开真实案例改写输入能稳定跑完公共分析链路，且能产出未识别场景、素材缺口、关键事实缺口和追问缺口复盘报告。
- `/manage` 的 Runtime 卡显示期望 provider；DeepSeek 生产模式下应为 `providerMode=deepseek` 且 `apiKeyConfigured=true`。
- 历史与 trace 能记录最近分析，质量标记没有大量“未命中重庆案例”“未命中法源材料”。
- `npm run evals:quality` 生成的质量门禁报告为 `passed`，复盘队列里的边界样本有明确处理建议。
- `npm run evals:shadow` 在有 DeepSeek key 时完成小样本 shadow eval；无 key 时应明确标记 skipped，不影响本地上线演示。
- `npm run evals:drafts` 会把复盘队列转成匿名化评测草稿，必须人工补全后再合并进评测集。
- `npm run release:check` 通过才视为可以进入灰度或上线准备阶段。
- 公网 smoke 通过：`https://your-domain.example.com/` 首页可访问，`https://your-domain.example.com/api/healthz` 返回 `status=ok`，`/manage` 可用只读 token 查看健康、运行态、历史、反馈、审计和质量门禁。
- 反馈区能收到“有用/需要改进”，反馈统计可在 `/manage` 刷新。
- 审计日志能记录管理端读写动作。

### 6. 常见故障处理

- `/manage` 提示运行态、历史或反馈不可用：先查 `BACKEND_URL` 是否指向后端，再查 `/healthz` 和后端日志。
- `/healthz` 正常但 `/runtime` 401/403：管理 token 不一致；确认前端、后端和 Compose 环境里的 `ADMIN_TOKEN`、`ADMIN_VIEW_TOKEN`。
- DeepSeek 未生效：确认 `AI_PROVIDER=deepseek`、`DEEPSEEK_API_KEY` 非空，查看 `/runtime.apiKeyConfigured` 和历史 trace 的 provider；未配置密钥时会回退本地规则引擎。
- DeepSeek 超时或 4xx：先把 `DEEPSEEK_SHADOW_LIMIT=2` 跑小样本；必要时提高 `DEEPSEEK_TIMEOUT_SECONDS`，或临时切回 `AI_PROVIDER=local` 保持演示可用。
- Docker Compose 后端不健康：检查 Postgres healthcheck、`DATABASE_URL`、端口占用和 `docker compose logs backend postgres`。
- 公网域名打不开但本机 `curl http://localhost:8000/healthz` 正常：优先检查 DNS、80/443 安全组、Caddy 容器日志、`SERVER_NAME` 和证书申请失败原因。
- 公网首页可打开但分析失败：检查前端容器里的 `BACKEND_URL=http://backend:8000`、后端健康状态、Caddy 是否只反代到前端，以及后端日志里的 `/analyze` 错误。
- 页面能打开但素材为空：检查是否连到 SQLite fallback、是否导入了案例和知识文档、是否使用只读 token 误以为导入成功。
- 历史为空但分析可用：确认数据库表是否持久化、后端是否重启到了新库、`/manage` 是否显示 `source: unavailable`。

### 7. 案例导入与反馈评估闭环

1. 在 `/manage` 用 `ADMIN_TOKEN` 导入案例 CSV/JSON 和知识文档 CSV/JSON。
2. 首页提交典型案情，检查结论是否引用了合适的重庆案例或法源，并在关键信息不足时提出可回答的补充问题。
3. 用户对结果点“有用”或“需要改进”，必要时填写短备注。
4. 管理员在 `/manage` 查看反馈、历史 trace、风险分布和质量标记。
5. 对“需要改进”样本补充案例/知识文档，或把样本转成评测候选：

```bash
python scripts/feedback-to-eval-candidates.py --source evals/reports/feedback-summary-latest.json
```

6. 人工匿名化候选样本并补进评测集，再运行 `npm run evals`；如果使用 DeepSeek，再跑 `npm run evals:deepseek` 做 provider 对比。
7. 复盘新报告中的 warning、失败样本和 provider 差异，继续补素材或收紧规则。

## 环境变量

- `BACKEND_URL`：前端 API Route 访问后端的基础地址，本地默认可用 `http://127.0.0.1:8000`，独立部署时建议显式配置。
- `DATABASE_URL`：后端连接数据库的 SQLAlchemy URL；留空则回退到 SQLite `law.db`。
- `ADMIN_TOKEN`：内部素材管理、导入、删除和历史接口的可写访问口令；前后端必须一致。
- `ADMIN_VIEW_TOKEN`：只读管理口令；可查看运行态、历史、反馈和审计日志，但不能修改素材。
- `AI_PROVIDER`：`local` 或 `deepseek`，默认 `local`；设为 `deepseek` 且提供密钥后才会走远程推理。
- `DEEPSEEK_API_KEY`：DeepSeek API 密钥；未设置时自动回退到本地规则引擎。
- `DEEPSEEK_BASE_URL`：DeepSeek OpenAI-compatible 基础地址，默认 `https://api.deepseek.com`。
- `DEEPSEEK_MODEL`：DeepSeek 模型名，默认 `deepseek-v4-pro`。
- `DEEPSEEK_REASONING_EFFORT`：推理强度提示，默认 `medium`。
- `DEEPSEEK_TIMEOUT_SECONDS`：DeepSeek 请求超时，默认 `45`。
- `AI_TRACE`：是否打开 tracing 级别的运行元数据，默认 `false`；内部历史监控会展示 provider、agent 链路和质量标记。

## 验证命令

```bash
npm run evals
npm run evals:adapted
npm run evals:adapted-review
npm run test:all
npm run build
python -m compileall backend
```

DeepSeek shadow smoke（需要 `.env.local` 或当前终端里已有 `DEEPSEEK_API_KEY`）：

```bash
$env:AI_PROVIDER = "deepseek"
$env:DEEPSEEK_SHADOW_LIMIT = "2"
npm run evals:deepseek
```

浏览器级 smoke（只在前端已启动、且前端启动时把 `BACKEND_URL` 指向不可用地址时执行）：

```bash
npm run smoke:manage
```

该 smoke 会同时确认素材接口进入本地回退、历史接口明确返回 `source: "unavailable"`，避免后台空记录掩盖后端故障。
