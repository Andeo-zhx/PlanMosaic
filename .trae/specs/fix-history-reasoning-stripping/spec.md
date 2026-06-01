# Fix History Reasoning Content Stripping Spec

## Why
`_handle_agent_chat` 和 `_handle_agent_chat_stream` 在重建历史消息时，只保留了 `role` 和 `content` 字段，丢弃了 `reasoning_content` 和 `tool_calls`。当用户使用 `deepseek-v4-pro` 模型时，之前的 assistant 消息中可能包含 `reasoning_content`，DeepSeek API 要求 thinking 模型的后续请求**必须**原样回传这个字段。丢失后 API 返回 HTTP 400: "The `reasoning_content` in the thinking mode must be passed back to the API."

## What Changes
- [server.py](file:///d:/Trae CN/Projects/PlanMosaic/backend/server.py#L800-L804)：`_handle_agent_chat` 历史消息重建时，保留 `reasoning_content` 和 `tool_calls`
- [server.py](file:///d:/Trae CN/Projects/PlanMosaic/backend/server.py#L863-L868)：`_handle_agent_chat_stream` 历史消息重建时，保留 `reasoning_content` 和 `tool_calls`

## Impact
- Affected specs: fix-reasoning-content-stripping（之前的修复未覆盖 Python 后端）
- Affected code: `backend/server.py` 两处历史消息重建

## MODIFIED Requirements

### Requirement: 历史消息完整传递
系统 SHALL 在重建对话历史消息时保留所有 API 相关字段，包括 `reasoning_content` 和 `tool_calls`。

#### Scenario: 发送消息后历史包含 reasoning_content
- **GIVEN** 上一次对话使用了 `deepseek-v4-pro` 模型，assistant 消息含 `reasoning_content`
- **WHEN** 用户发送下一条消息
- **THEN** 发送给 API 的历史消息中，对应的 assistant 消息**包含** `reasoning_content` 字段
- **AND** DeepSeek API 不返回 "reasoning_content...must be passed back" 错误

#### Scenario: 工具调用历史保留 tool_calls
- **GIVEN** 上一次对话涉及工具调用
- **WHEN** 用户发送后续消息
- **THEN** 历史消息中的 assistant 消息**包含** `tool_calls` 字段
- **AND** 后续的 tool 角色消息（工具返回）也被保留