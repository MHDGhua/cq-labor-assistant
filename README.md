# 重庆劳动法案情分析助手

一个可演示、可面试讲解的重庆劳动法简历项目。前端是对话式案情页，后端在内部做多 agent 推理与 RAG 检索，素材统一通过 `/manage` 批量导入，首页只展示分析结论和少量引用，不公开全量案例库。

## 项目定位

- 前端对话式展示：用户像聊天一样输入案情，系统只返回最终结论、下一步和少量来源。
- 后端内部多 agent 推理：案情抽取、重庆案例/法源检索、结论审校都在后端串联完成。
- 素材统一从 `/manage` 进入：案例与知识文档都支持 CSV/JSON 批量粘贴或上传。
- 简历演示友好：默认支持 SQLite 回退，也支持 Docker Compose 一键启动完整栈。
- 公网稳定演示：生产 Compose 提供 Caddy 反代、HTTPS 自动证书、后端本机端口绑定、`/healthz` 健康检查和发布门禁报告。
- DeepSeek 影子评测可选：有 `DEEPSEEK_API_KEY` 时可执行 `npm run evals:deepseek`，验证真实 provider 的稳态，并生成可用于简历展示和迭代复盘的 JSON 报告。
- 50 条公开真实劳动争议案例改写输入：`evals/chongqing_adapted_input_cases_50.json` 用于测试重庆语境下的输入覆盖，不宣称为真实重庆裁判案例。
- 生产级评测门禁：`evals/chongqing_production_eval_cases.json` 专门验证低置信度保护、人工复核转交和上线前质量门槛。

## 核心能力

- 对话式案情输入：围绕拖欠工资、违法解除、未签书面劳动合同等高频场景组织分析。
- 内部多 Agent 协作：事实抽取、重庆法源与案例检索、结论审校，用户只看最终结果。
- RAG 重庆劳动法知识库：案例、官方法源统一入库，供内部检索使用。
- 缺失事实追问闭环：当入职时间、金额、解除理由、合同签订等关键事实不足时，首页只展示面向用户的补充问题，内部 trace 不外露。
- 素材不全量展示：前端只呈现少量引用和分析结论，完整案例和法源由 `/manage` 内部管理。
- 内部管理保护：`/manage`、素材 API 和历史 API 通过多角色协作令牌控制，普通分析入口不需要口令。
- 支持多角色协作：`ADMIN_VIEW_TOKEN` 用于 viewer 只读查看，`ADMIN_EDITOR_TOKEN` 用于 editor 协作维护素材，`ADMIN_TOKEN` 用于 admin 管理与运营导出。
- 内部运行监控：管理员可在 `/manage` 查看最近分析历史、风险分布和三 agent trace 质量标记，只做复盘不对外展示。
- 用户反馈闭环：用户可对单次分析标记“有用/需要改进”，管理页统计反馈，用于补案例、调检索和扩展评测集。
- 审计留痕：管理端读写动作会自动写入审计日志，方便排查权限和误操作。
- 可部署架构：Next.js 前端、FastAPI 后端、PostgreSQL/SQLite 双模式数据库。

## 技术栈

- Frontend：Next.js 15、React 19、TypeScript
- Backend：FastAPI、SQLAlchemy、Pydantic
- Database：PostgreSQL 优先，未设置 `DATABASE_URL` 时自动回退到 SQLite（`law.db`）
- Tests：Vitest、unittest、FastAPI TestClient

## 本地运行

1. 安装前端依赖：

```bash
npm install
```

2. 安装后端依赖：

```bash
python -m pip install -r backend/requirements.txt
```

3. SQLite 回退模式启动前后端，两个终端分别执行：

```bash
npm run dev:backend
```

```bash
npm run dev
```

4. 如果要一键启动前端、后端和 PostgreSQL：

```bash
docker compose up --build
```

5. 如果手动切到 PostgreSQL，再设置数据库地址：

```powershell
$env:DATABASE_URL = "postgresql+psycopg2://law:law_password@localhost:5432/law_assistant"
$env:ADMIN_TOKEN = "change-me-admin-token"
$env:ADMIN_EDITOR_TOKEN = "change-me-editor-token"
$env:ADMIN_VIEW_TOKEN = "change-me-readonly-token"
```

默认情况下，后端会使用 `sqlite:///./law.db`。若不提供 `DATABASE_URL`，就会自动回退到 SQLite，适合简历现场或无数据库环境的演示。使用 Docker Compose 时，后端会切换到 PostgreSQL。

访问 `/manage` 时可输入任一已配置协作令牌。Docker Compose 默认使用 `dev-admin-token`，正式部署请通过环境变量覆盖。
本地手动运行时，Python 后端和 DeepSeek 影子评测脚本会读取项目根目录的 `.env.local`，但不会覆盖已经显式设置的环境变量。

运行前请确认数据库中已导入案例和官方法源素材，分析流程会优先从库内做内部检索，不直接暴露全量内容。

## 生产落地速查

- 密钥只放在本机或部署平台的环境变量里，推荐本地复制 `.env.example` 为 `.env.local` 后填写 `DEEPSEEK_API_KEY`、`ADMIN_TOKEN`、`ADMIN_EDITOR_TOKEN` 和 `ADMIN_VIEW_TOKEN`；不要提交 `.env.local`。
- 公网演示前设置 `SERVER_NAME` 为真实域名，并确认 DNS A/AAAA 记录指向服务器、80/443 入站开放、`docker-compose.prod.yml` 使用 Caddy 暴露公网入口。
- 演示角色分三类：普通访客只访问 `/` 和 `/api/analyze`；viewer 使用 `ADMIN_VIEW_TOKEN` 查看 `/manage` 运行态、历史、反馈、审计和质量门禁；editor 使用 `ADMIN_EDITOR_TOKEN` 导入和维护素材；admin 使用 `ADMIN_TOKEN` 执行删除、清空和运营快照导出。
- 启用 DeepSeek 时设置 `AI_PROVIDER=deepseek` 和 `DEEPSEEK_API_KEY`。未配置密钥时系统会保守回退到本地规则引擎，`/manage` 的 Runtime 卡可确认当前 provider、模型、超时和是否配置密钥。
- Docker Compose 完整栈使用 PostgreSQL：`docker compose up --build`。本地无数据库演示可不设置 `DATABASE_URL`，后端自动使用 `sqlite:///./law.db`。
- 公网稳定演示使用生产 Compose：`docker compose -f docker-compose.prod.yml up --build -d`。该模式仅让 Caddy 公开 80/443，后端绑定 `127.0.0.1:8000` 供本机排障，不直接暴露公网。
- 如果服务器里的 Docker 构建容器无法解析 npm registry，前端发布改走“服务器本地预构建”路径：先从上一版 `new-project-frontend` 镜像提取 Linux `node_modules`，再用 `node:20-alpine` 在 `/opt/new-project` 本地执行 `node node_modules/next/dist/bin/next build` 生成新的 `.next`，最后再 `docker compose -f docker-compose.prod.yml up -d --build`。完整命令见 [docs/deployment.md](docs/deployment.md)。
- 健康检查端点是 `GET /healthz`，`GET /health` 保留为兼容别名；成功判据是 HTTP 200、`status: "ok"` 且 `ok: true`，响应只包含脱敏数据库标签和运行计数。
- 上线前至少执行 `npm run release:check`，再做公网 smoke：访问 `https://<SERVER_NAME>/`、`https://<SERVER_NAME>/api/healthz` 和 `/manage`，确认首页分析、健康卡、历史 trace、反馈统计、审计日志和质量门禁都可读。
- 闭环流程是“导入案例与法源 -> 分析 -> 用户反馈 -> `/manage` 复盘 -> 导出评测候选 -> 补充素材或评测集 -> 重新跑评测”。

公网演示细节见 [docs/public-demo.md](docs/public-demo.md)，完整部署 Runbook 见 [docs/deployment.md](docs/deployment.md)。

## 验证

```bash
npm run evals
npm run evals:production
npm run evals:adapted
npm run evals:adapted-review
npm run evals:quality
npm run evals:production-report
npm run test:all
npm run build
python -m compileall backend
```

质量门禁报告：

```bash
npm run evals:quality
npm run evals:production-report
npm run evals:shadow
npm run release:check
```

脚本会生成 `evals/reports/quality-gate-latest.json`、`evals/reports/quality-gate-latest.md` 和 `evals/reports/review-queue-latest.json`。报告按场景识别、风险等级、引用数量、重庆本地程序、安全边界和三 agent 契约拆分评分；复盘队列只记录样本 ID、维度结果和 trace 摘要，不导出用户原始长文本、密钥或内部完整推理链。

生产级评测门禁：

```bash
npm run evals:production
npm run evals:production-report
```

会额外生成 `evals/reports/production-eval-latest.json`、`production-eval-latest.md` 和 `production-review-queue-latest.json`，重点关注低置信度、人工复核队列和上线前需要阻断的样本。

模型 shadow gate：

```bash
npm run evals:shadow
```

脚本会先跑本地质量门禁，再在检测到 `DEEPSEEK_API_KEY` 时自动执行小样本 DeepSeek shadow eval，默认使用 `DEEPSEEK_SHADOW_LIMIT=2` 控制成本。输出 `evals/reports/model-shadow-gate-latest.json` 和 `.md`，管理页会读取这些摘要用于上线前复盘。

发布门禁：

```bash
npm run release:check
```

它会串联类型检查、固定评测、50 条公开案例改写输入评测与复盘、质量门禁、单测、生产构建、后端编译、开发/生产 Docker Compose 配置检查，以及公网演示静态门禁，并输出 `evals/reports/release-check-latest.json` / `.md`。失败时只保留短输出预览，不导出密钥或原始长文本。

公开案例改写输入评测：

```bash
npm run evals:adapted
npm run evals:adapted-review
```

该评测会把 50 条来自公开典型案例的改写案情逐条跑过公共分析链路，检查基础可用性、安全边界、缺失事实追问覆盖和禁止胜诉保证/裁判偏向表达。复盘脚本会额外输出 `evals/reports/adapted-input-review-latest.json` / `.md`，用于定位未识别场景、缺少重庆本地案例命中、关键事实缺口或追问缺口。

复盘队列转评测草稿：

```bash
npm run evals:drafts
```

脚本会把 `review-queue-latest.json` 转成匿名化的评测草稿模板，方便人工补充后回流到评测集。

反馈闭环候选导出：

```bash
python scripts/feedback-to-eval-candidates.py --source evals/reports/feedback-summary-latest.json
```

脚本默认输出 `evals/reports/feedback-eval-candidates.json`，也可用 `--source evals/reports/deepseek-shadow-latest.json` 从本地评测报告提取失败、warning 或 provider 差异信号。它只处理后端反馈摘要 JSON 或本地报告文件，不读取 `.env`、密钥或后端长文本；用户备注只保留短预览和哈希，人工再把候选补成匿名化评测样本后重新运行评测。

可选的浏览器级 smoke：

```bash
$env:ADMIN_TOKEN = "dev-admin-token"
$env:BACKEND_URL = "http://127.0.0.1:8999"
npm run dev
```

另开一个终端：

```bash
npm run smoke:manage
```

验证时重点确认两点：数据库里的案例和官方法源可被检索，前端只展示结论与少量来源，不输出完整素材；`/manage` 在后端不可用时应明确切换到本地缓存回退。

阶段验证会先跑 `npm run evals`，再看 `npm run test:all` 和部署验证。当前项目已经把三 agent 契约固定下来，后续切到 DeepSeek 只需要替换 provider，不需要重写前端流程。
如果要跑 DeepSeek 影子评测，把 `DEEPSEEK_API_KEY` 放在 `.env.local` 或当前终端环境变量里，再执行 `npm run evals:deepseek`。脚本会自动写出 `evals/reports/deepseek-shadow-latest.json`，里面只保留执行时间、样本数、是否配置 DeepSeek、local/remote 失败与 warning、比较差异，以及 provider/model/risk/citation 统计，不包含任何密钥或原始敏感内容。
`npm run smoke:manage` 现在还会检查历史监控是否明确暴露“不可用”状态，避免把后端故障误判成空记录。

## 页面

- `/`：对话式案情输入、单条结果展示、缺失事实追问、少量来源引用，不展示全量案例库。
- `/manage`：内部素材管理页，支持 viewer/editor/admin 三类角色解锁；可查看运营信号、维护案例和知识文档、导出运营快照，并按权限限制写操作。未提供 `id` 时会自动生成稳定 ID，重复导入会更新同一条素材。

## API

- `POST /analyze`：生成案情分析结果。前端代理返回公共结果结构，不暴露内部 transcript。
- `GET /cases`：读取案例库，需要 viewer/editor/admin 任一协作令牌。
- `POST /cases/import`：批量导入或更新自定义案例，需要 editor 或 admin。
- `DELETE /cases/{case_id}`：删除自定义案例，需要 admin。
- `GET /knowledge-docs`：读取内部知识文档素材，需要 viewer/editor/admin 任一协作令牌。
- `POST /knowledge-docs/import`：批量导入或更新知识文档素材，需要 editor 或 admin。
- `DELETE /knowledge-docs/{doc_id}`：删除或停用知识文档素材，需要 admin。
- `GET /history`：读取分析历史，需要 viewer/editor/admin 任一协作令牌。
- `GET /runtime`：读取非敏感运行状态，需要 viewer/editor/admin 任一协作令牌。
- `POST /feedback`：记录用户对单次分析的有用性反馈。
- `GET /feedback/summary`：读取反馈统计，需要 viewer/editor/admin 任一协作令牌。
- `GET /audit-logs`：读取审计日志，需要 admin。

前端通过 Next API Route 代理访问后端，后端不可用时保留本地回退，便于演示。

## 法律边界

本项目仅用于信息演示，不构成法律意见。不输出胜诉保证、裁判偏向、法官偏好等结论。重庆本地特色仅落在公开程序、典型案例和救济路径上。

## 参考来源

- [《劳动争议调解仲裁法》](https://gongbao.court.gov.cn/Details/997e66171cf55d219c613ec18dc370.html)
- [最高法《劳动争议案件适用法律问题的解释（一）》](https://www.court.gov.cn/zixun/xiangqing/282121.html)
- [最高法《劳动争议案件适用法律问题的解释（二）》](https://www.court.gov.cn/zixun/xiangqing/472691.html)
- [重庆市人社局劳动争议典型案例](https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245920.html)
- [重庆高院劳动争议典型案例](https://rlsbj.cq.gov.cn/zwxx_182/tzgg/202105/t20210506_9245905.html)
- [重庆一站式联调与速裁机制](https://www.cq.gov.cn/ywdt/zwhd/bmdt/202311/t20231101_12499145.html)
