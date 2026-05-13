# 公网稳定演示 Runbook

## 目标

公网演示只公开用户需要看的页面和健康信号：`/`、`/api/analyze`、`/api/feedback`、`/api/healthz` 和受 token 保护的 `/manage`。后端容器不直接暴露公网，生产 Compose 由 Caddy 接收 80/443 并反代到前端容器。

## 拓扑

- DNS：`SERVER_NAME` 指向服务器公网 IP。
- Caddy：`network_mode: host`，自动申请 HTTPS 证书，反代到 `172.30.0.10:3000`。
- Frontend：Next.js，Docker 内网固定地址 `172.30.0.10`，通过 `BACKEND_URL=http://backend:8000` 调后端。
- Backend：FastAPI，Docker 内网固定地址 `172.30.0.11`，本机排障端口绑定 `127.0.0.1:8000`。
- Postgres：Docker 内网固定地址 `172.30.0.12`，数据写入 `postgres-data` volume。

## 环境变量

生产演示最小变量：

```env
SERVER_NAME=your-domain.example.com
ADMIN_TOKEN=replace-with-long-random-writer-token
ADMIN_VIEW_TOKEN=replace-with-long-random-readonly-token
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=replace-with-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_REASONING_EFFORT=medium
DEEPSEEK_TIMEOUT_SECONDS=45
AI_TRACE=false
```

`ADMIN_TOKEN` 和 `ADMIN_VIEW_TOKEN` 必须不同。公网演示时优先给观察者只读 token，避免误删素材或导入脏数据。

## 演示角色

- 普通访客：访问首页，输入案情，查看公开结论、补充问题、下一步、风险边界和少量引用。
- 只读管理员：用 `ADMIN_VIEW_TOKEN` 进入 `/manage`，查看健康、运行态、历史、反馈、审计和质量门禁。
- 可写管理员：用 `ADMIN_TOKEN` 进入 `/manage`，导入/删除案例和知识文档，处理反馈复盘。

## 发布步骤

1. 确认 DNS 指向服务器，80/443 已放行。
2. 在服务器设置生产环境变量，不提交 `.env.local`。
3. 执行发布门禁：

```bash
npm run release:check
```

4. 启动生产 Compose：

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

5. 查看容器状态和日志：

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=80 caddy frontend backend postgres
```

6. 做公网 smoke：

```bash
curl https://your-domain.example.com/api/healthz
curl http://localhost:8000/healthz
```

7. 浏览器打开 `https://your-domain.example.com/` 跑一次案情分析，再打开 `/manage` 分别验证只读 token 和可写 token。

## 发布门禁

`npm run release:check` 必须通过。它会检查：

- TypeScript、固定评测、生产评测、50 条公开案例改写输入评测、质量门禁、单测、生产构建和 Python 编译。
- 开发 Compose 和生产 Compose 配置可解析。
- `.env.example` 包含公网演示需要的 `SERVER_NAME`、管理 token、DeepSeek、smoke 变量。
- `docker-compose.prod.yml` 使用 Caddy、`/healthz`、后端本机绑定和 restart 策略。
- `deploy/Caddyfile` 使用 `SERVER_NAME`，并反代到固定前端内网地址。
- README 和部署文档说明公网演示、角色和 healthz 判读。

## 稳定性判读

- `/api/healthz` 返回 `status=ok` 且 `ok=true`：公网链路、前端代理、后端和数据库基础可用。
- `databaseReachable=false` 或 `status=degraded`：服务仍响应，但数据库计数失败，不适合继续演示写入链路。
- `caseCount` 或 `activeKnowledgeDocCount` 过低：服务可用但素材不足，应先导入或修复种子数据。
- `/manage` 质量门禁不是 passed：不要宣称生产就绪，只能作为开发演示。

## 故障处理

- 域名无法访问：查 DNS、服务器安全组、80/443、防火墙、Caddy 日志和 `SERVER_NAME`。
- HTTPS 证书失败：确认域名解析到本机、公网 80 可达、没有其他进程占用 80/443。
- 首页可打开但分析失败：查前端容器的 `BACKEND_URL`、后端 `/healthz`、后端日志和 Postgres 健康状态。
- `/manage` 401/403：确认使用的是正确 token；只读 token 不能执行导入或删除。
- Caddy 正常但后端不健康：先看 `docker compose -f docker-compose.prod.yml logs backend postgres`，再检查 `DATABASE_URL` 和 volume 状态。
