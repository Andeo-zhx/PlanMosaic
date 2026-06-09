# 全前端功能 + 全案件视觉调试 Spec

## Why

之前的调试走了两条路都失败：
1. **CLI/IPC 自动化**（`live-program-test-plan`）— 只能测后端状态层，看不见 UI
2. **Browser-use + python http.server**（`fix-visual-found-issues-v1` Phase 4）— 报 `[AI Agent] Load error: Unexpected token '<', "<!DOCTYPE "...`，因为没有真实 /api/* 后端

用户要的是：**真正在浏览器里把整个 PlanMosaic Desktop 前端跑起来，所有功能、所有案件（来自 `live-program-test-plan` 等 spec）都测一遍，用视觉能力核对**。

**根本困难**：
- `ai-agent.js:113-121` 在非 Electron 模式直接 `fetch('/api/agent-history')` + `fetch('data.json?ts')`，python http.server 只能返回 HTML → 报错
- Electron 主进程的 IPC 通道（preload.js 暴露的 `window.electronAPI`）在普通浏览器里**根本不存在**
- Python 后端（`backend/server.py`）必须独立启动

**正确路径**：
1. **真正启动 Python 后端**（uvicorn 5199）— 让 `/api/*` 真实响应
2. **用 Browser-use 加载本地 HTML + 注入完整的 electronAPI mock**（不只是 P0/P1 的最小 stub，要覆盖**所有** IPC 通道）
3. **覆盖 `live-program-test-plan/test/cases/` 所有 8+ 个案件** + `desktop-visual-browser-testing/visual-test-script.md` 所有 96 个场景
4. **用 Browser-use 视觉能力**截图、像素采样、DOM 推断
5. **结果统一汇总**到 `comprehensive-frontend-test-report.md`

## What Changes

- **不启动 Electron 主进程**（GUI 在子代理环境不可显示）
- **启动 Python 后端**（5199，独立进程）
- **启动本地 HTTP 服务**（8765，serve 静态文件）
- **扩展 electronAPI mock** 覆盖 20+ IPC 通道（从 `phase8-ipc-analysis.md` 拉清单）
- **扩展 mock 数据**：scheduleData / agentHistory / tasksData / coursesData 等
- **执行所有案件**（来自 `live-program-test-plan`）+ **所有视觉场景**（来自 `desktop-visual-browser-testing`）
- **不修改任何源码**
- **输出综合报告**

## Impact

- Affected specs:
  - 取代：`fix-visual-found-issues-v1` Phase 4（Browser-use 方式，已被证伪）
  - 关联：`live-program-test-plan`（CLI test harness + 8+ 案件）
  - 关联：`desktop-visual-browser-testing`（96 视觉场景）
  - 关联：`phase2-phase8` 分析报告（IPC 清单、按钮清单）
- Affected code:
  - 不修改任何源码
  - 新增文件：
    - `.trae/specs/comprehensive-frontend-test/full-electronapi-mock.js`（完整 mock，~400 行）
    - `.trae/specs/comprehensive-frontend-test/comprehensive-frontend-test-report.md`

## ADDED Requirements

### Requirement: 完整 mock 注入使前端可独立运行
系统 SHALL 注入完整 electronAPI mock，使 Browser-use 加载的 index.html 可**像真实 Electron 一样**工作（除了没有真实窗口）。

#### Scenario: 完整 electronAPI mock 注册
- **WHEN** Browser-use 加载 index.html
- **THEN** `window.electronAPI` 含 20+ 方法（`getIsElectron` 返回 true、IPC 通道全 mock、事件监听全注册）
- **AND** `getAgentHistory` / `getScheduleData` / `getCourses` / `getTasks` / `getApiKeys` 返回结构化数据
- **AND** `agentChat` / `agentChatStream` 模拟流式响应
- **AND** `setApiKey` / `setDeepseekModel` 写入 localStorage 模拟持久化

#### Scenario: 事件通道全注册
- **WHEN** mock 注入
- **THEN** `onAgentStreamChunk` / `onAgentStreamDone` / `onAgentStreamError` / `onAgentStreamStatus` / `onPythonStatus` 全部可注册
- **AND** `removeAllAgentListeners` 清理所有监听

#### Scenario: getIsElectron 返回 true
- **WHEN** ai-agent.js 检查 `getIsElectron()`
- **THEN** 返回 true（强制走 IPC 分支，不走 fetch 分支）
- **AND** 不再触发 `/api/agent-history` fetch（这是 v1 报告的 JSON 错误源头）

### Requirement: 真实 Python 后端
系统 SHALL 独立启动 `backend/server.py` 提供真实的 `/api/*` 端点。

#### Scenario: Python 后端启动
- **WHEN** `python backend/server.py`
- **THEN** uvicorn 监听 5199
- **AND** `/api/config` 返回 200 + JSON
- **AND** `/api/schedule` / `/api/courses` / `/api/tasks` 等端点可访问

### Requirement: 覆盖所有 live-program-test-plan 案件
系统 SHALL 在 mock 环境中跑 `live-program-test-plan/test/cases/` 下的所有 8+ 个案件。

#### Scenario: 案件 1: API Key 配置
- **WHEN** 模拟 `set-api-key` 调用
- **THEN** localStorage 写入，IPC 响应 ok
- **AND** 后续 `getApiKeys` 返回 `{deepseek: {configured: true}}`

#### Scenario: 案件 2: 简单对话
- **WHEN** 模拟 `agentChat` 调用
- **THEN** 返回 mock 流式响应
- **AND** 思路链 + 内容 + done 事件全触发

#### Scenario: 案件 3-8: 工具调用、模型切换、对话历史、错误降级等
- **WHEN** 每个案件被触发
- **THEN** 验证预期输出

### Requirement: 覆盖所有 visual-test-script 视觉场景
系统 SHALL 跑 `desktop-visual-browser-testing/visual-test-script.md` 中所有 96 个场景（按钮、弹窗、侧边栏、主题、错误降级）。

#### Scenario: 按钮清单核对
- **WHEN** 65 个按钮被悬停/点击
- **THEN** 视觉反馈与预期一致（hover 变色、active 阴影、disabled 灰）
- **AND** Browser-use 截屏每状态

#### Scenario: 弹窗交互
- **WHEN** 9 类弹窗被打开
- **THEN** 遮罩关闭、Escape 关闭、必填星号、保存 loading 全部生效
- **AND** v1 报告的 6 个"缺遮罩关闭"弹窗现已修复

#### Scenario: 错误降级
- **WHEN** 触发网络错误/超时/无效 API Key
- **THEN** typing 立即消失 + 错误气泡 + 重连提示
- **AND** P0-1 修复的 `onAgentStreamError` 链路生效

### Requirement: Andeo / Funkes 登录验证
系统 SHALL 用 **Andeo / Funkes** 凭证验证登录流程（Supabase RPC `login_user`）。

#### Scenario: 登录成功
- **WHEN** mock 注入 + Python 后端 + 凭证 Andeo / Funkes 输入
- **THEN** `supabaseRPC('login_user', ...)` 返回成功
- **AND** session/token 写入 localStorage
- **AND** UI 跳转到主界面

#### Scenario: 登录失败
- **WHEN** 错误凭证
- **THEN** UI 显示明确错误（不是 alert/console）
- **AND** 不写 token

### Requirement: 综合报告输出
系统 SHALL 输出 `comprehensive-frontend-test-report.md`，含所有案件 + 所有视觉场景的 PASS/FAIL/PARTIAL。

#### Scenario: 报告内容
- **WHEN** 全部测试完成
- **THEN** 报告含：
  - 环境状态（Python 后端 / HTTP 服务 / Mock 注入 / Browser 加载）
  - 案件测试矩阵（来自 `live-program-test-plan`，8+ 案件）
  - 视觉场景测试矩阵（来自 `desktop-visual-browser-testing`，96 场景）
  - v1 报告 23 问题在真实 mock 环境下的重新核对
  - v2 修复 15 条在真实 mock 环境下的重新核对
  - 登录闭环验证
  - 新识别问题
  - 修复建议
  - 截图归档

## MODIFIED Requirements
（无，本 spec 是测试方案，不修改功能需求）

## REMOVED Requirements
（无）
