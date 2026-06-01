# 修复 reasoning_content 丢失导致 API 400 错误 Spec

## Why

`deepseek-v4-flash` 模型在某些对话场景下会进入"思考模式"（thinking mode），在 API 响应中携带 `reasoning_content` 字段。DeepSeek API 要求该字段必须在后续请求中原样传回。当前代码仅在使用 `deepseek-reasoner` 模型时才保留 `reasoning_content`（通过 `modelName.includes('reasoner')` 条件判断），对 `deepseek-v4-flash` 的 `reasoning_content` 进行了丢弃，导致下一轮 API 调用返回 HTTP 400 错误。

## What Changes

- **流式路径修复**：移除 `callDeepseekAPIMessages` 流式分支中保留 `reasoning_content` 的模型名条件判断，只要 API 响应中存在 `reasoning_content` 就保留
- **同步路径修复**：同上，移除 `callDeepseekAPIMessages` 同步分支中相同的条件判断

## Impact

- Affected specs: 无
- Affected code:
  - `PlanMosaic Desktop/main.js` — `callDeepseekAPIMessages` 函数（第 1699-1701 行流式路径，第 1770-1772 行同步路径）

## MODIFIED Requirements

### Requirement: reasoning_content 始终随 API 响应保留

系统 SHALL 在任何模型返回 `reasoning_content` 时将其保留在 assistant message 中，不做模型名称条件过滤。

#### Scenario: deepseek-v4-flash 返回 reasoning_content
- **WHEN** `deepseek-v4-flash` 在 API 响应中返回了非空的 `reasoning_content`
- **THEN** 系统将其附加到 `assistantMessage.reasoning_content`
- **THEN** 下一轮 API 调用中，该 assistant message 包含 `reasoning_content`，API 不再返回 400 错误

#### Scenario: 模型未返回 reasoning_content
- **WHEN** 任何模型在 API 响应中未返回 `reasoning_content`（或为空字符串）
- **THEN** assistant message 不包含 `reasoning_content` 字段
- **THEN** 行为与修复前一致

#### Scenario: 流式路径和同步路径行为一致
- **WHEN** 同样条件下，流式路径和同步路径处理同一响应
- **THEN** 两者的 assistant message 构建结果一致（均正确保留 reasoning_content）