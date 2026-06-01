# Tasks

- [x] **Task 1: 修复 `_handle_agent_chat` 历史消息重建**
  - [x] 在 [server.py:L800-L814](file:///d:/Trae CN/Projects/PlanMosaic/backend/server.py#L800-L814) 修改 `msg` 重建逻辑，保留 `reasoning_content` 和 `tool_calls`
  - [x] 若 `msg` 的 role 是 `tool`（工具返回），也保留 `tool_call_id`

- [x] **Task 2: 修复 `_handle_agent_chat_stream` 历史消息重建**
  - [x] 在 [server.py:L871-L886](file:///d:/Trae CN/Projects/PlanMosaic/backend/server.py#L871-L886) 应用相同修复

# Task Dependencies

- Task 1 和 Task 2 互不依赖，可并行执行