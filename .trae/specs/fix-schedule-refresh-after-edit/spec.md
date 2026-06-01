# Fix Schedule Refresh After Edit Spec

## Why
用户通过 AI 修改日程后，日程数据已被写入文件，但 UI 没有刷新显示。根因：SSE 流路径中 `_call_ai_api_stream` 的 `_sse_done()` 只发送 `data: [DONE]\n\n`，不包含 `shouldRefresh` 信息。`main.js` 中的 `shouldRefresh: finalResponse?.shouldRefresh || false` 永远为 `false`，因为没有任何 SSE 事件设置 `finalResponse.shouldRefresh`。

非流式路径（`_handle_agent_chat` → `_call_ai_api`）正确传递了 `shouldRefresh`，工作正常。

## What Changes
- [server.py](file:///d:/Trae CN/Projects/PlanMosaic/backend/server.py#L578)：`_call_ai_api_stream` 添加 `_parent_modified` 参数，跨递归调用追踪数据修改
- [server.py](file:///d:/Trae CN/Projects/PlanMosaic/backend/server.py#L738)：在 `yield _sse_done()` 前 yield `result` SSE 事件，包含 `shouldRefresh`
- [server.py](file:///d:/Trae CN/Projects/PlanMosaic/backend/server.py#L732)：递归调用时传递 `_parent_modified`
- [server.py](file:///d:/Trae CN/Projects/PlanMosaic/backend/server.py#L969)：`_handle_deep_planning_chat` 的 `shouldRefresh: False` → `shouldRefresh: response.get("shouldRefresh", False)`

## Impact
- Affected code: `backend/server.py`
- main.js 无需修改 — 已正确处理 `result` 类型的 SSE 事件（L716-718: `finalResponse = parsed`）
- ai-agent.js 无需修改 — 已有 `if (data.shouldRefresh) await refreshScheduleData()`（L593, L629）

## MODIFIED Requirements

### Requirement: SSE 流正确传递 shouldRefresh
系统 SHALL 在 SSE 流的 done 事件前发送包含 `shouldRefresh` 的 result 事件。

#### Scenario: 工具调用修改了日程数据
- **WHEN** AI 在流式对话中执行了数据修改工具（如 delete_task、add_schedule）
- **THEN** SSE 流在 `[DONE]` 之前发送 `{"type": "result", "shouldRefresh": true}`
- **AND** main.js 解析该事件并设置 `finalResponse.shouldRefresh = true`
- **AND** 前端调用 `refreshScheduleData()` 刷新 UI

#### Scenario: 递归工具调用中任一层级修改了数据
- **WHEN** AI 进行了多轮工具调用（如先查后改）
- **THEN** `_parent_modified` 参数确保任一层级的修改都能传递到最终的 result 事件