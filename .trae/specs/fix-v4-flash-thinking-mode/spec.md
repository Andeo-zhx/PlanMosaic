# Fix V4 Flash Thinking Mode Spec

## Why
根据 DeepSeek 官方文档，`deepseek-v4-flash` 和 `deepseek-v4-pro` 都默认开启思考模式（`thinking.type` 默认为 `enabled`）。但当前 `_is_reasoner_model()` 只匹配 `v4-pro` 和 `reasoner`，遗漏了 `v4-flash`。导致 flash 模型：
1. 仍然设置 `temperature`（思考模式下不应设置）
2. `reasoning_content` 不会被保留/回传（工具调用时可能触发 400 错误）

## What Changes
- [server.py](file:///d:/Trae CN/Projects/PlanMosaic/backend/server.py#L155-L156)：`_is_reasoner_model()` 扩展为匹配 `v4-flash`、`v4-pro`、`reasoner`

## Impact
- Affected code: `backend/server.py` 仅 `_is_reasoner_model()` 一处修改
- 联动影响（自动修复）：
  - `_call_ai_api` L453：flash 不再设置 temperature
  - `_call_ai_api` L554：flash 的 reasoning_content 被保留
  - `_call_ai_api_stream` L602：flash 不再设置 temperature
  - `_call_ai_api_stream` L720：flash 的 reasoning_content 被保留

## MODIFIED Requirements

### Requirement: `_is_reasoner_model` 覆盖所有 V4 模型
系统 SHALL 将 `deepseek-v4-flash` 和 `deepseek-v4-pro` 都视为 thinking 模型。

#### Scenario: flash 模型不设置 temperature
- **WHEN** 使用 `deepseek-v4-flash` 调用 API
- **THEN** 请求体中不包含 `temperature` 参数

#### Scenario: flash 模型的 reasoning_content 被保留
- **WHEN** `deepseek-v4-flash` 返回 `reasoning_content`
- **THEN** assistant 消息中包含 `reasoning_content` 字段
- **AND** 后续工具调用请求回传该字段