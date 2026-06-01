# 深度代码质量审计 Spec

## Why

前几轮审计（`code-vulnerability-audit`、`comprehensive-code-fix`）已覆盖安全漏洞和基础加固，但**代码健壮性、边界条件、资源管理、并发安全**等深层次质量问题尚未系统性排查。新一轮深度审计在 6 个 JS 文件 + Python 后端中发现了 **37 个具体缺陷**，涵盖进程永久阻塞、数据丢失、状态不一致、内存泄漏等高风险问题。需要在现有安全基础之上进行代码质量层面的加固。

## What Changes

### 🔴 紧急修复（P1-P4）

- **(P1) 所有 HTTP 请求缺少超时** — [main.js](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/main.js) 中 `http.request` 调用无 `timeout` 配置，Python 后端挂起时 Electron 主进程永久阻塞。
- **(P2) 文件写入非原子操作** — [server.py](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/server.py#L195-L201) `_write_schedule_data`、`_write_agent_history` 直接 `open(w)` 覆盖，写入中途崩溃会丢失全部数据。
- **(P3) preload.js API Key 检测逻辑 bug** — `getApiKeys` 中 `Object.entries(keys).map` 返回 `{provider: { configured: !!key }}` 结构错误。
- **(P4) ai-agent.js 消息重复添加历史** — [ai-agent.js](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/ai-agent.js) 中 `addMessage` 和 `sendAgentMessage` 双重写入 history 导致对话记录膨胀。

### 🟡 高优先级（H1-H8）

- **(H1) 用户画像重复保存** — [main.js](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/main.js) `agent-chat` 处理器中 LLM 返回 `updatedProfile` 时又额外调用 `saveAgentHistory`，造成两次写盘。
- **(H2) 图片 Blob URL 清理不完整** — [ai-agent.js](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/ai-agent.js) `clearConversations` 中仅清理 agent 图片，未覆盖深度规划模式。
- **(H3) 并发操作缺少防重入** — 多处按钮点击无防连点，`sendAgentMessage`、`saveScheduleData`、`agentApprove` 可被重复调用导致数据损坏。
- **(H4) DOM 元素空引用风险** — [index.html](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html) 中多处 `getElementById` 无 null 检查，DOM 未就绪时崩溃。
- **(H5) 刀具执行原子性缺失** — [tool_executor.py](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/tool_executor.py) 中一次 agent 回合内多次调用 `_write_schedule_data`，中途失败导致部分修改已落盘。
- **(H6) Web fetch 响应未检查 Content-Type** — [ai-agent.js](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/ai-agent.js) 直接 `response.json()`，服务端返回 HTML 错误页时崩溃。
- **(H7) localStorage 与后端数据一致性问题** — [index.html](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html) 部分数据同时存储在 localStorage 和后端，切换账号后可能读取旧数据。
- **(H8) Python 文件写入无 fsync** — [server.py](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/server.py) `_write_schedule_data` 和 [tool_executor.py](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/tool_executor.py) `_write_schedule_data` 未调用 `os.fsync`，系统崩溃时缓冲数据丢失。

### 🟡 中等优先级（M1-M10）

- **(M1) main.js 全局变量过多** — 约 20 个模块级变量（DEEPSEEK_API_KEY、QWEN_API_KEY、currentProvider 等），不利于测试和重构。
- **(M2) 日期解析缺少验证** — 多处 `new Date(dateStr)` 无格式/范围校验，`new Date('not-a-date')` 产生 Invalid Date 传播。
- **(M3) 超大日程数据无大小限制** — data.json 可无限增长，无上限检查。
- **(M4) 定时器泄漏** — [ai-agent.js](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/ai-agent.js) `scheduleProfileUpdate` 使用 `setTimeout` 无条件创建，组件卸载后仍执行。
- **(M5) 深呼吸动画内存泄漏** — [index.html](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html) 深呼吸功能中使用 `requestAnimationFrame` 未在模式切换时取消。
- **(M6) WebSocket/SSE 连接未设置心跳** — [main.js](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/main.js) SSE 流式连接无空闲超时，代理层断开后不重连。
- **(M7) 搜索功能大小写敏感且无防抖** — [index.html](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html) 每次按键触发完整 rerender。
- **(M8) 备份文件无大小限制** — [paths.js](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/paths.js) 和 [paths.py](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/paths.py) 仅按数量（10个）清理，未按总大小限制。
- **(M9) 用户切换账号后缓存残留** — [index.html](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html) 切换账号时未完全清空内存中的日程数据和对话历史。
- **(M10) ReAct 日志生成无长度限制** — [server.py](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/server.py#L1372) `generate-react-log` 可能生成超大日志导致内存溢出。

### 🟢 低优先级（L1-L5）

- **(L1) console.log 生产环境未剥离** — 所有文件大量 `console.log`，生产构建应移除。
- **(L2) CSS 硬编码像素值** — [index.html](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html) 大量 `px` 值，极端缩放/高DPI下布局错位。
- **(L3) Python 依赖版本未锁定** — [requirements.txt](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/requirements.txt) 仅有包名无版本号，不可复现构建。
- **(L4) index.html 内联 JS 过长** — 单文件包含 ~3000+ 行 JS，可维护性差。
- **(L5) 错误消息直接暴露给用户** — [server.py](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/server.py) 异常消息直接返回给前端，可能泄露内部信息。

## Impact

- **Affected specs**: `comprehensive-code-fix`（在其安全加固基础上进一步提升代码质量）
- **Affected code** (8 文件):
  - `PlanMosaic Desktop/main.js` — HTTP 超时、防重入、重复保存
  - `PlanMosaic Desktop/preload.js` — API Key 检测 bug
  - `PlanMosaic Desktop/ai-agent.js` — 消息重复、资源清理、Blob URL
  - `PlanMosaic Desktop/index.html` — DOM 空引用、防抖、缓存清理
  - `PlanMosaic Desktop/paths.js` — 备份大小限制
  - `backend/server.py` — 原子写入、fsync、错误消息消毒
  - `backend/tool_executor.py` — 事务性写入、fsync
  - `backend/requirements.txt` — 版本锁定

## ADDED Requirements

### Requirement P1: All HTTP requests MUST have timeout
所有 `http.request` 调用必须设置 `timeout`（建议 30 秒），超时后必须 abort 请求并返回错误。

#### Scenario: Python 后端无响应
- **WHEN** Python 后端挂起超过 30 秒
- **THEN** Electron 主进程不被阻塞，返回超时错误给渲染进程

### Requirement P2: File writes MUST be atomic
数据文件写入必须先写到临时文件，再原子性 rename 到目标路径。写入过程中系统崩溃时原数据文件保持完整。

#### Scenario: 写入 data.json 时系统崩溃
- **WHEN** `_write_schedule_data` 执行中途系统断电
- **THEN** 原 data.json 未被损坏，下次启动可正常读取

### Requirement P3: getApiKeys MUST return correct structure
`getApiKeys` 必须返回 `{provider: {configured: boolean}}` 而非嵌套错误结构。

### Requirement P4: Messages MUST NOT be duplicated in history
同一条 AI 回复消息只能被添加到对话历史一次。`addMessage` 和 `sendAgentMessage` 中的历史写入必须统一入口。

### Requirement H1: Profile save MUST NOT be duplicated
`agent-chat` handler 中不要在 LLM 已返回 `updatedProfile` 时再次调用 `saveAgentHistory`。

### Requirement H2: Blob URL cleanup MUST cover all modes
清除对话时必须同时清理普通模式和深度规划模式的图片 Blob URL。

### Requirement H3: Critical operations MUST have re-entrancy guard
`sendAgentMessage`、`saveScheduleData`、`agentApprove` 等关键操作必须有防重入锁。

### Requirement H4: DOM references MUST be null-checked
所有 `getElementById` 调用在访问 `.style`/`.classList`/`.innerHTML` 前必须检查返回值非 null。

### Requirement H5: Multi-step tool execution SHOULD be transactional
一次 agent 回合内多次工具调用产生的数据修改应当在回合结束时统一落盘，而非每步写一次。

### Requirement H6: Web responses MUST validate Content-Type
`fetch` 调用在解析 JSON 前应检查 `response.headers.get('Content-Type')` 包含 `application/json`。

### Requirement H7: Account switch MUST clear all caches
切换账号后必须清空所有 localStorage 中的日程缓存和内存中的对话历史。

### Requirement H8: File writes MUST fsync after write
所有关键数据文件写入后必须调用 `os.fsync()`（Python）确保刷盘。

### Requirement M1-M10: General hardening
修复：防抖搜索、备份大小限制、日期校验、定时器清理、版本锁定等。