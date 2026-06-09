# 重新启动调试：Electron + Python 后端 + 真实登录测试 Spec

## Why

上一轮调试（`fix-visual-found-issues-v1`）用 **IDE 内置 Browser + python http.server**（8765 端口）做视觉回归，但这条路径**根本走不通**：

`PlanMosaic Desktop/ai-agent.js:113-121` 的 `loadData()` 在**非 Electron 模式**下会执行：
```js
const [hRes, dRes] = await Promise.all([
    fetch('/api/agent-history'),
    fetch('data.json?' + Date.now())
]);
const hist = await hRes.json();  // ← 报错点
```

python http.server 收到这两个请求时，**没有 /api/agent-history 也没有 data.json**，返回的是 404 HTML 页面（`<!DOCTYPE html>...`），前端 `hRes.json()` 解析失败 → catch 块报：
```
[AI Agent] Load error: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

**用户报告**：用 Browser-use 打开 `http://127.0.0.1:8765/index.html` → 尝试登录（Andeo / Funkes）→ 立即报这个错。

**根本原因**：
- Browser-use 模式**没有真实的 Electron 主进程** → `getIsElectron()` 返回 false → 走到 web 分支 → fetch 真实后端失败
- python http.server 是**纯静态服务**，不能模拟后端

**重启调试的真正路径**：
1. **真正启动 Electron 桌面应用**（用户本地）
2. **真正启动 Python 后端**（`backend/server.py`，独立端口）
3. 用 `electronAPI`（preload 暴露）走 IPC 而不是 fetch
4. 用 Andeo / Funkes 验证登录闭环

由于 Electron GUI 在**子代理终端环境无法直接显示**，本 spec 调整策略：
- **子代理**：启动 Python 后端 + Node 端 IPC 通道 + headless 测试（用 Playwright/Puppeteer 启动 Electron + 远程 DevTools）
- **用户**：本地 GUI 真实交互验证（提供步骤清单）
- **凭证**：Andeo / Funkes（用户提供，连接到 Supabase `login_user` RPC）

## What Changes

- **停止** python http.server 8765（错误的 Browser-use 模式）
- **启动** 真实的 `backend/server.py`（Python 进程）
- **启动** Electron 主进程（`PlanMosaic Desktop/main.js`）
- **使用** Andeo / Funkes 调用 Supabase `login_user` RPC 验证登录
- **记录** 真实启动日志、DevTools Console、Network 行为
- **修复** 启动过程中识别的真问题（如果发现）

## Impact

- Affected specs:
  - 取代：`fix-visual-found-issues-v1` 的 Phase 4（Browser-use 方式，已被证伪）
  - 关联：`merge-backend-into-desktop`、`python-backend-migration`
- Affected code:
  - 不修改任何代码（本 spec 为**纯诊断+启动验证**）
  - 仅运行现有程序 + 记录问题

## ADDED Requirements

### Requirement: 停止错误的 Browser-use 服务并清理
系统 SHALL 停掉 `python -m http.server 8765`（错误模式）并清理临时文件。

#### Scenario: 关闭 8765 端口服务
- **WHEN** 调试重启开始
- **THEN** 通过 `StopCommand` 终止之前的 8765 端口 http server
- **AND** 验证 8765 端口已释放（`netstat -an | findstr 8765` 无 LISTENING）

### Requirement: 启动 Python 后端（独立进程）
系统 SHALL 用独立 Python 进程启动 `backend/server.py`，让 Electron 主进程能 spawn 它。

#### Scenario: Python 后端独立启动测试
- **GIVEN** Python 依赖（fastapi/uvicorn/httpx）已装
- **WHEN** 手动 `cd "PlanMosaic Desktop/backend" && python server.py`
- **THEN** uvicorn 监听端口（默认 5199），无 traceback
- **AND** `GET /api/config` 返回 200 + JSON

#### Scenario: Supabase login_user 端到端
- **GIVEN** 凭证 Andeo / Funkes
- **WHEN** 调 `POST /api/auth/login` 或直接调 Supabase RPC
- **THEN** 返回 `{ok: true, user: {...}, session: {...}}` 或具体错误信息
- **AND** 不返回 HTML（验证 Content-Type: application/json）

### Requirement: 启动 Electron 主进程
系统 SHALL 用 `npm start` 启动 Electron，主进程自动 spawn Python 后端（main.js 内置 spawn 逻辑）。

#### Scenario: 主进程正常启动
- **WHEN** `cd "PlanMosaic Desktop" && npm start`
- **THEN** 主窗口出现（`BrowserWindow`）
- **AND** Python 后端被 spawn（约 2~3s 后 `/api/python-status` 推送 'running'）
- **AND** preload.js 注入 `window.electronAPI`

#### Scenario: 控制通道（5199）注册
- **GIVEN** `PLANMOSAIC_TEST_MODE=1` 或默认开启
- **WHEN** Electron 启动
- **THEN** main.js 在 5199 端口注册 HTTP 控制通道
- **AND** 控制 token 写入 `PLANMOSAIC_CONTROL_TOKEN` 环境变量

### Requirement: 用凭证验证登录闭环
系统 SHALL 用 **Andeo / Funkes** 验证 PlanMosaic 登录流程（Supabase RPC `login_user`）。

#### Scenario: 前端登录调用
- **GIVEN** Electron 已启动 + Python 后端 running + Supabase 可达
- **WHEN** 在登录界面输入 Andeo / Funkes → 点击登录
- **THEN** `index.html:8105` 调 `supabaseRPC('login_user', {username, password})`
- **AND** 后端透传到 Supabase，返回成功 → 写入 localStorage / sessionStorage
- **AND** UI 跳转到主界面（去掉登录遮罩）

#### Scenario: 登录失败路径
- **WHEN** 凭证错误（test 用 wrong/pass）
- **THEN** UI 显示明确错误（不是 alert 也不只是 console）
- **AND** 不写入 token
- **AND** 后端日志记录失败原因

### Requirement: 重新跑 v1 视觉测试核心场景
系统 SHALL 在登录成功后，重新跑 `desktop-visual-browser-testing/visual-test-script.md` 中的**关键场景**（按钮 + 弹窗 + 错误降级），验证修复未破坏 + 识别 Browser-use 模式漏掉的问题。

#### Scenario: 实际 GUI 场景验证
- **WHEN** 用户本地登录成功
- **THEN** 按 visual-test-script §1 按钮清单核对（visible / hover / press / 反馈）
- **AND** 按 §2 弹窗交互核对（遮罩关闭、Escape、保存 loading）
- **AND** 任何 v1 报告问题在真实 GUI 下重新核对 PASS/FAIL

### Requirement: 输出真实调试报告
系统 SHALL 输出一份 `real-debug-report.md`，记录真实启动日志、登录结果、GUI 场景验证。

#### Scenario: 报告生成
- **WHEN** 调试完成
- **THEN** `real-debug-report.md` 含：
  - 启动日志（Python + Electron）
  - 登录调用链路（请求/响应）
  - GUI 场景验证表（PASS/FAIL/PARTIAL + 截图）
  - Browser-use 模式漏掉的真问题（如有）
  - 修复建议（如有问题）

## MODIFIED Requirements
（无，本 spec 修复调试方法，不修改功能需求）

## REMOVED Requirements
（无）
