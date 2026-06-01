# Python 后端迁移 Spec

## Why
当前后端核心逻辑（HTTP 服务器、AI API 调用、工具执行、数据管理）全部使用 Node.js（server.js、main.js 部分逻辑、ai-tools.js、paths.js、cli.js），存在大量代码在 server.js 和 main.js 之间重复。将后端迁移为 Python 可消除这种重复，统一后端入口，便于后续扩展和维护。

## What Changes
- **新增** Python HTTP API 服务器（FastAPI），替代 `server.js` 的全部功能
- **新增** Python 工具定义模块，替代 `ai-tools.js`
- **新增** Python 路径/数据管理模块，替代 `paths.js`
- **新增** Python CLI 工具，替代 `cli.js`
- **重构** `main.js`（Electron 主进程）：移除直接调用 DeepSeek API 和工具执行的逻辑，改为通过 HTTP 调用 Python 后端
- **保留** `preload.js`（Electron 预加载脚本）：仅修改端口等配置引用
- **保留** 所有前端/渲染进程 JS 文件不变：`ai-agent.js`、`WordMosaic/` 下全部文件

## Impact
- Affected specs: 无（新 spec）
- Affected code:
  - **新增**: `backend/` 目录（Python 项目）
  - **修改**: `PlanMosaic Desktop/main.js`（大幅精简，移除重复逻辑）
  - **修改**: `PlanMosaic Desktop/preload.js`（配置引用变更）
  - **保持不变**: `PlanMosaic Desktop/server.js`、`ai-tools.js`、`paths.js`、`cli.js`（保留作为参考，迁移完成后可删除）
  - **保持不变**: 所有前端文件（`ai-agent.js`、`WordMosaic/*.js`、`*.html`、`*.css`）

## ADDED Requirements

### Requirement: Python API 服务器
系统 SHALL 提供一个 Python FastAPI HTTP 服务器，提供与原 `server.js` 完全等价的 REST API 端点。

#### Scenario: Agent 聊天请求（普通模式）
- **WHEN** 前端发送 POST `/api/agent-chat` 请求，包含消息、历史、画像
- **THEN** 服务器调用 DeepSeek/Qwen API，执行工具调用（含多轮递归），返回 `{ response: { content, proposal }, shouldRefresh }`
- **AND** 响应格式与原有 `server.js` 完全一致

#### Scenario: Agent 流式聊天（Electron SSE 模式）
- **WHEN** Electron 主进程发送 POST `/api/agent-chat-stream` 请求
- **THEN** 服务器以 SSE（Server-Sent Events）格式流式返回 `{ type: "content"|"reasoning"|"retry"|"status", content/phase }` 事件

#### Scenario: 深度规划对话
- **WHEN** 前端发送 POST `/api/deep-planning-chat` 请求
- **THEN** 服务器使用 reasoner 模型和过滤后的工具白名单，返回深度规划响应

#### Scenario: 日程数据读写
- **WHEN** 前端发送 GET `/api/schedule-data` 或 POST `/api/save-schedule`
- **THEN** 服务器从/向 `data.json` 读写日程数据，格式与原实现一致

#### Scenario: Agent 历史管理
- **WHEN** 前端发送 GET `/api/agent-history`、POST `/api/agent-save` 等
- **THEN** 服务器正确读写 `agent-log.json`，支持归档和清空

#### Scenario: ReAct 日志生成
- **WHEN** 前端发送 POST `/api/generate-react-log`
- **THEN** 服务器遍历消息数组，生成格式化的 ReAct 日志文本

### Requirement: 工具定义模块（Python）
系统 SHALL 将 `ai-tools.js` 中的 16 个工具定义完整迁移为 Python 数据结构（list of dicts），字段和嵌套结构与原 JSON Schema 完全一致。

#### Scenario: 工具定义一致性
- **WHEN** 比较 Python 和 JS 版本的工具定义
- **THEN** 每个工具的 `type`、`function.name`、`function.description`、`function.parameters` 完全一致

### Requirement: 工具执行引擎（Python）
系统 SHALL 在 Python 中实现与 `main.js`/`server.js` 等价的工具执行逻辑，包括：
- `view_schedule`、`add_schedule`（含周期性添加）、`modify_schedule`（6 种操作子类型）
- `manage_tasks`（6 种操作子类型）、`manage_big_tasks`（7 种操作子类型）
- `manage_courses`（10 种操作子类型）
- `check_conflicts`、`analyze`、`manage_templates`
- 深度规划专用工具（`value_monetization`、`roi_calculator`、`milestone_planner`、`swot_analysis`、`decision_matrix`、`web_search_evaluate`、`estimate_task_time`）
- 旧工具名称到新工具名称的完整路由映射

#### Scenario: 工具执行结果正确
- **WHEN** AI 模型调用任意工具（如 `view_schedule(date="2025-01-01")`）
- **THEN** 返回的 JSON 结果与原 Node.js 实现完全一致

### Requirement: Python 路径/数据管理模块
系统 SHALL 在 Python 中实现与 `paths.js` 等价的功能：
- 跨平台应用数据目录定位（Windows/Mac/Linux）
- 数据文件路径获取（`data.json`、`config.json`、`agent-log.json`）
- 配置文件加载（含 API Key、模型名称、服务器端口等）
- 数据备份创建与旧备份清理

### Requirement: Python CLI 工具
系统 SHALL 提供与 `cli.js` 等价的 Python CLI：
- `python cli.py` → 显示当前月日历
- `python cli.py -m YYYY-MM` → 显示指定月日历
- `python cli.py -d YYYY-MM-DD` → 显示指定日期的详细安排
- `python cli.py -h` → 帮助信息

### Requirement: Electron 主进程适配
系统 SHALL 修改 `main.js`，使其：
- 移除所有直接调用 DeepSeek/Qwen API 的代码（~400+ 行）
- 移除所有工具执行代码（~600+ 行）
- 改为通过 HTTP 调用 Python 后端
- 在应用启动时自动启动 Python 后端进程
- 在应用退出时关闭 Python 后端进程

#### Scenario: Electron 启动 Python 后端
- **WHEN** Electron 应用启动
- **THEN** `main.js` 自动启动 Python 后端（`python -m backend.server` 或类似命令）
- **AND** 等待后端就绪后再加载前端页面

#### Scenario: Electron 关闭 Python 后端
- **WHEN** Electron 应用退出
- **THEN** `main.js` 终止 Python 子进程

### Requirement: 100% 性能保持
系统 SHALL 确保 Python 后端的响应时间不高于原 Node.js 实现的 1.1 倍（即性能退化不超过 10%）。

#### Scenario: API 响应时间
- **WHEN** 发送相同的 `/api/agent-chat` 请求
- **THEN** Python 后端的端到端响应时间（不含 AI API 调用往返时间）≤ Node.js 版本的 1.1 倍

### Requirement: 配置兼容性
系统 SHALL 保持 `config.json` 格式完全不变，Python 后端能正确读取所有现有配置字段：
- `api.deepseek.*`（key, baseUrl, model, reasonerModel）
- `api.qwen.*`（key, baseUrl, model）
- `agent.provider`
- `server.port`、`server.host`
- `security.rejectUnauthorized`
- `timeouts.apiTimeoutMs`

## REMOVED Requirements
无移除的需求。