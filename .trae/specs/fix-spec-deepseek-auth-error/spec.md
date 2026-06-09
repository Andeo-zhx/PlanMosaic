# 修复 AI 对话 401 鉴权失败重试风暴 Spec

## Why

PlanMosaic 桌面端所有调用 DeepSeek API 的对话功能（主 Agent 聊天 `/api/agent-chat`、流式 Agent 聊天 `/api/agent-chat-stream`、深度规划 `/api/deep-planning-chat`、深度规划 `/spec` 入口），只要配置了无效的 API Key，都会连续触发多次重试调用，全部返回：

```
HTTP 401: {"error":{"message":"Authentication Fails, Your api key: ****ey-b is invalid","type":"authentication_error"}}
```

日志被无效重试刷屏，/spec 表现尤为明显，但根因不在 /spec 端点本身，而在底层的 AI 调用函数。

根因有两处：
1. 后端在 `_call_ai_api`（约 667-681 行）和 `_call_ai_api_stream`（约 824-849 行）两个函数中，对**任意非 200 状态码**都进行最多 3 次指数退避重试。401/403 属于鉴权失败，密钥无效时反复重试毫无意义，只会污染日志并放大对上游 API 的请求压力。**所有 AI 对话端点都共享这两个底层函数**，所以问题影响面覆盖主 Agent 聊天和深度规划。
2. 重试用尽后，错误被 `_get_fallback_response` 包装成 Mosa 风格的俏皮话（"哎呀，网络出问题了..."）。用户既不知道是密钥错了，也不知道去哪里修，体验极差。

## What Changes

- **同步路径 (`_call_ai_api`)**：识别 401/403 鉴权类错误，立即停止重试，并返回结构化的"密钥无效"错误响应
- **流式路径 (`_call_ai_api_stream`)**：同上，401/403 直接退出流，不再继续重试
- **错误响应内容**：鉴权失败时，给前端返回一个**对用户友好**的提示（包含"请检查 API Key 是否有效"），并在响应中附带 `errorCode: "AUTH_INVALID"` 供前端识别
- **同步路径返回的兜底文案**：当错误码为鉴权失败时，跳过 Mosa 俏皮话风格，直接展示可操作的引导
- **覆盖所有 AI 对话端点**：修复同时作用于主 Agent 聊天、深度规划对话
- **不影响 5xx/429 路径**：这些仍然是临时性错误，保留现有的重试逻辑

## Impact

- Affected specs: `deep-planning-feature`、`fix-v4-flash-thinking-mode`（仅在错误处理行为上微调，不影响各模块核心能力）
- Affected code:
  - `PlanMosaic Desktop/backend/server.py` — `_call_ai_api`（约 667-681 行）、`_call_ai_api_stream`（约 824-849 行）、`_get_fallback_response`（约 575-588 行）
  - 不涉及 `data_guard.py`、`config.py`、`index.html`、前端 JS 等模块

## ADDED Requirements

### Requirement: 鉴权错误立即失败，不再重试

系统 SHALL 在 DeepSeek API 返回 401（未授权）或 403（禁止）状态码时，**立即停止重试**，直接进入错误响应流程。该规则对所有调用 `_call_ai_api` 或 `_call_ai_api_stream` 的端点都生效。

#### Scenario: 主 Agent 聊天收到 401
- **WHEN** 用户在主聊天面板发送消息，DeepSeek 返回 `HTTP 401`
- **THEN** `/api/agent-chat` 和 `/api/agent-chat-stream` 不再触发后续重试
- **THEN** 日志中只出现 1 条 `HTTP 401` 错误记录，而不是 3 条
- **THEN** 调用方在合理时间内（< 5 秒）收到明确的错误响应

#### Scenario: 深度规划（/spec）收到 401
- **WHEN** 用户在深度规划对话框中发送消息，DeepSeek 返回 `HTTP 401`
- **THEN** `/api/deep-planning-chat` 不再触发后续重试
- **THEN** 日志中只出现 1 条 `HTTP 401` 错误记录
- **THEN** 调用方在合理时间内收到明确的错误响应

#### Scenario: DeepSeek 返回 403
- **WHEN** 任何 AI 对话端点收到 `HTTP 403`
- **THEN** 系统不再发起后续重试请求
- **THEN** 调用方收到明确的错误响应

#### Scenario: 5xx 错误仍然重试
- **WHEN** DeepSeek 返回 500/502/503/504
- **THEN** 系统按现有指数退避策略进行最多 3 次重试
- **THEN** 行为与修复前一致

#### Scenario: 429 限流仍然重试
- **WHEN** DeepSeek 返回 429
- **THEN** 系统按现有策略进行重试（遵守 `Retry-After` 头）
- **THEN** 行为与修复前一致

### Requirement: 鉴权失败时向用户提供可操作的错误提示

系统 SHALL 在鉴权失败时，向用户展示一条明确指出"API Key 无效"或"请检查 API 密钥配置"的提示，而不是 Mosa 风格的俏皮话。

#### Scenario: 主 Agent 聊天鉴权失败
- **WHEN** 用户在主聊天面板发送消息，API 密钥无效
- **THEN** 聊天面板显示明确的错误提示（例如："AI 服务鉴权失败，请前往设置检查 DeepSeek API Key 是否有效。"）
- **THEN** 错误响应中包含 `errorCode: "AUTH_INVALID"` 字段

#### Scenario: 深度规划鉴权失败
- **WHEN** 用户在深度规划对话框中发送消息，API 密钥无效
- **THEN** 深度规划对话框内显示明确的错误提示
- **THEN** 错误响应中包含 `errorCode: "AUTH_INVALID"` 字段

## MODIFIED Requirements

### Requirement: 同步 API 调用的错误处理

`_call_ai_api` 函数 SHALL 在收到 401 或 403 状态码时，跳过重试逻辑，直接返回结构化错误。

原行为：所有非 200 状态码（5xx、4xx、429 等）统一走指数退避重试最多 3 次。

新行为：401/403 直接失败；429 和 5xx 保持现有重试逻辑。

### Requirement: 流式 API 调用的错误处理

`_call_ai_api_stream` 函数 SHALL 在收到 401 或 403 状态码时，跳过重试逻辑，立即终止 SSE 流。

原行为：所有非 200 状态码都触发最多 3 次流式重试（每轮重试都新建 SSE `retry` 事件）。

新行为：401/403 直接发送 `content` 事件说明鉴权失败后结束流；429 和 5xx 保持现有重试逻辑。

### Requirement: 鉴权失败的兜底响应文案

`_get_fallback_response` 函数 SHALL 在错误信息包含"Authentication Fails"或状态码为 401/403 时，返回专门的"密钥无效"提示，而不是通用的网络错误俏皮话。

## REMOVED Requirements

无。

## Quality Constraints

- 修复后，使用无效 API Key 触发任何 AI 对话时：
  - 401 重试次数 ≤ 1（不再重试 3 次）
  - 用户在 5 秒内看到明确的密钥错误提示
  - 日志中不出现连续 3 条相同的 401 记录
- 修复后，使用有效 API Key 时：
  - 行为与修复前完全一致
  - 不影响主 Agent 聊天、深度规划对话、工具调用
- 不影响 5xx/429 现有重试行为
