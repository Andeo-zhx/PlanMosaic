# Tasks

本 spec 目标：**真正启动 Electron + Python 后端**，用 Andeo/Funkes 凭证验证登录，重新跑视觉场景。不修改任何源码。

---

## Phase 1：清理错误的 Browser-use 模式

- [ ] **Task 1：停止 python http.server 8765**
  - 通过 `StopCommand` 终止之前启动的 8765 端口服务
  - 验证端口已释放（`netstat -an | findstr 8765` 无 LISTENING）
  - 输出端口释放确认

- [ ] **Task 2：清理 Browser-use mock 文件**
  - 保留 `electronapi-mock.js`（可作 dev tool，但不再作主调试方式）
  - 在 mock 脚本顶部加注释"已废弃：用于 fix-visual-found-issues-v1；新调试见 restart-debug-with-real-backend"

## Phase 2：启动 Python 后端（独立进程）

- [ ] **Task 3：检查后端依赖**
  - 验证 fastapi/uvicorn/httpx/python-dotenv 等已装（`pip show`）
  - 检查 `backend/requirements.txt` 依赖
  - 验证 `__pycache__/` 存在（说明最近成功 import 过）

- [ ] **Task 4：直接启动 server.py 验证**
  - 命令：`cd "PlanMosaic Desktop/backend" && python server.py --port 5199`
  - 预期：uvicorn 监听 5199，无 traceback
  - curl 验证：`curl http://127.0.0.1:5199/api/config` 应返回 200 + JSON
  - 记录启动日志到 `real-debug-report.md`

## Phase 3：用 Andeo/Funkes 验证登录

- [ ] **Task 5：直接 HTTP 调 Supabase login_user RPC**
  - 在后端日志中找 Supabase URL + service_role key
  - 用 curl 调：`curl -X POST "$SUPABASE_URL/rest/v1/rpc/login_user" -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"username":"Andeo","password":"Funkes"}'`
  - 记录响应（成功 → token，失败 → 错误码）

- [ ] **Task 6：调后端 /api/auth/login（如存在）**
  - 检查 `backend/server.py` 是否有 auth 路由
  - 如有，调它（POST body 传 Andeo/Funkes）
  - 记录响应

- [ ] **Task 7：调后端透传到 supabaseRPC('login_user', ...)**
  - 模拟 index.html:8106 调 `supabaseRPC`
  - 验证：返回 200 + user/session 或具体错误

## Phase 4：启动 Electron 主进程

- [ ] **Task 8：检查 Electron 启动条件**
  - 验证 `node_modules` 已装
  - 验证 electron 包存在
  - 验证 `package.json` 有 `start` 脚本

- [ ] **Task 9：尝试启动 Electron（子代理环境）**
  - 命令：`cd "PlanMosaic Desktop" && npm start`
  - 预期：在子代理环境**仍可能无法显示 GUI**（之前已确认）
  - 如失败：用 Playwright/electron CLI 验证主进程能 spawn
  - 备选：只启动 Python 后端 + 用 curl 验证 IPC 通道

- [ ] **Task 10：用户本地启动（实际 GUI）**
  - 准备用户启动指南
  - 写入 `real-debug-report.md` §用户启动
  - 含：环境变量、命令、登录步骤、观察点

## Phase 5：用户本地验证（GUI 真实交互）

- [ ] **Task 11：登录闭环验证**
  - 步骤：启动 Electron → 等待 splash → 输入 Andeo/Funkes → 点击登录
  - 预期：跳转主界面，无 JSON 错误
  - 截屏存到 `screenshots/login-success.png`

- [ ] **Task 12：v1 报告 23 问题在真实 GUI 下重新核对**
  - 按 `desktop-visual-browser-testing/visual-test-script.md` 跑核心 6 类场景：
    - 主界面按钮可见性
    - 弹窗遮罩关闭
    - 发送按钮 spinner
    - saveApiKey 防抖
    - 侧边栏滚动位置
    - focus-visible
  - 每场景截屏 + 状态记录
  - 任何 v1 报告 PASS 在真实 GUI 下变成 FAIL 的，记录为"Browser-use 漏报"

- [ ] **Task 13：v2 修复在真实 GUI 下重新核对**
  - 15 条修复逐条验证（按 visual-report-v2 §六 Browser-use 流程）
  - 截屏每条修复的证据

## Phase 6：报告与回流

- [ ] **Task 14：生成 real-debug-report.md**
  - 含：启动日志、登录结果、GUI 验证表、v1/v2 重新核对、新增问题
  - 与 v1/v2 报告对比

- [ ] **Task 15：识别 Browser-use 漏报的真问题**
  - 任何 v1 报告 PASS 在真实 GUI 下变 FAIL → 标记为"v1 漏报"
  - 任何 v2 修复在真实 GUI 下未生效 → 标记为"v2 漏修"
  - 任何新识别问题 → 追加到 tasks.md Phase 6 末尾

---

# Task Dependencies

- Task 1~2：清理（无依赖）
- Task 3~4：Python 后端（Task 3 依赖 Task 1）
- Task 5~7：登录验证（依赖 Task 4）
- Task 8~10：Electron 启动（Task 8 依赖 Task 1；Task 9 依赖 Task 8；Task 10 独立可并行）
- Task 11~13：用户 GUI 验证（依赖 Task 10 用户启动成功）
- Task 14~15：报告（依赖 Task 11~13）
