# 修复 web_search_evaluate 工具无法调用 Bug

## Why

Agent 在 Electron 桌面端调用 `web_search_evaluate`（网页搜索）工具时失败，因为 `main.js` 的 `executeToolCall` 函数中没有实现该工具的处理逻辑（`server.js` 中已有实现）。当 Agent 调用此工具时，会命中 `default` 分支返回 `{"error": "Unknown tool", "name": "web_search_evaluate"}`，导致 Agent 无法完成搜索任务。

## What Changes

- 在 `main.js` 的 `executeToolCall` 函数中新增 `web_search_evaluate` case，通过 DuckDuckGo Instant Answer API 实现网络搜索
- 将 `executeToolCall` 函数改为 `async` 函数以支持异步 HTTP 请求（现有调用方式已使用 `Promise.all`，兼容异步返回值）

## Impact

- Affected specs: 无
- Affected code:
  - `PlanMosaic Desktop/main.js` — `executeToolCall` 函数

## ADDED Requirements

### Requirement: web_search_evaluate 工具在 Electron 端可用

系统 SHALL 在 `executeToolCall` 中处理 `web_search_evaluate` 工具调用，调用 DuckDuckGo Instant Answer API 获取搜索结果。

#### Scenario: 正常搜索
- **WHEN** Agent 调用 `web_search_evaluate`，传入 `query` 参数
- **THEN** 系统通过 HTTPS 调用 `https://api.duckduckgo.com/?q={query}&format=json&no_html=1&skip_disambig=1`
- **THEN** 返回 JSON 格式的搜索结果（包含 AbstractText、RelatedTopics 等）
- **THEN** 8 秒超时保护

#### Scenario: 搜索无结果
- **WHEN** DuckDuckGo API 返回空结果
- **THEN** 返回 `{ success: true, query, results: [], message: '未找到相关搜索结果，建议尝试其他关键词' }`

#### Scenario: 网络错误
- **WHEN** API 请求失败（网络错误、超时等）
- **THEN** 返回 `{ success: false, query, error: '网络搜索暂时不可用（请检查网络连接或API配置），Mosa将基于已有知识回答。', fallback: true }`
- **THEN** 工具调用不会中断整个 Agent 循环

#### Scenario: 深度规划模式使用
- **WHEN** 深度规划模式下 Agent 调用 `web_search_evaluate`
- **THEN** 工具正常执行（该工具已在深度规划白名单 `DEEP_PLANNING_TOOL_WHITELIST` 中）