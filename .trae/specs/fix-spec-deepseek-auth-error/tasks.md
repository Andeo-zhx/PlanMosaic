# Tasks

- [x] Task 1: 同步路径 `_call_ai_api` 鉴权失败立即返回
  - [x] 1.1 在 [server.py:676-678](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/backend/server.py#L676-L678) 的 `if response.status_code != 200` 分支前，增加对 `response.status_code in (401, 403)` 的早返回逻辑
  - [x] 1.2 早返回时构造 `error_msg` 包含"API Key 无效或鉴权失败"字样，并附带 `errorCode: "AUTH_INVALID"`
  - [x] 1.3 调用 `_get_fallback_response` 时传入鉴权专用 key（`auth_invalid`），让兜底函数返回明确文案
  - [x] 1.4 同步路径返回结构与现有 `_get_fallback_response` 保持一致（不破坏 `_handle_deep_planning_chat` 和 `_handle_agent_chat` 的解析逻辑）

- [x] Task 2: 流式路径 `_call_ai_api_stream` 鉴权失败立即结束流
  - [x] 2.1 在 [server.py:847-857](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/backend/server.py#L847-L857) 的 `async with client.stream(...)` 内，检测到 `response.status_code in (401, 403)` 时直接 yield `content` 事件说明鉴权失败，然后 yield `_sse_done()` 返回
  - [x] 2.2 不再为 401/403 触发 `_sse_event("retry", "")` 事件和后续重试循环
  - [x] 2.3 流式鉴权失败响应中追加 `result` 事件，包含 `errorCode: "AUTH_INVALID"` 供前端识别

- [x] Task 3: `_get_fallback_response` 增加鉴权失败专用文案
  - [x] 3.1 在 [server.py:579](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/backend/server.py#L579) 函数签名中增加可选参数 `error_code: str = None`
  - [x] 3.2 当 `error_code == "AUTH_INVALID"` 或 `error_msg` 包含 `"Authentication Fails"` / `"401"` / `"403"` 时，返回专门文案："AI 服务鉴权失败，请前往设置检查 DeepSeek API Key 是否有效。"
  - [x] 3.3 保留原有 Mosa 风格兜底逻辑（网络错误、429 限流等），确保非鉴权错误文案不变

# Task Dependencies

- Task 1 和 Task 2 都依赖 Task 3 提供的鉴权专用文案支持。建议执行顺序：Task 3 → Task 1 / Task 2（Task 1 和 Task 2 可并行）。
