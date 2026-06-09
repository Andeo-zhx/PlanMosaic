# Checklist

## 鉴权错误处理
- [x] 同步路径：DeepSeek 返回 401 时，不再触发指数退避重试（HTTP 401 日志最多 1 条，不再连续 3 条）
- [x] 同步路径：DeepSeek 返回 403 时，同样不重试
- [x] 同步路径：鉴权失败时，`_get_fallback_response` 返回包含"API Key 无效"或"请检查 API Key"的明确文案，而不是 Mosa 风格俏皮话
- [x] 同步路径：`_handle_deep_planning_chat` 解析 `_error` 字段时不报错，响应结构与修复前兼容
- [x] 同步路径：`_handle_agent_chat` 解析 `_error` 字段时不报错，响应结构与修复前兼容
- [x] 流式路径：DeepSeek 返回 401 时，直接 yield `content` 事件并 `_sse_done()` 结束流，不再 yield `retry` 事件
- [x] 流式路径：DeepSeek 返回 403 时，同样不重试
- [x] 流式路径：鉴权失败时，响应事件中携带 `errorCode: "AUTH_INVALID"` 供前端识别

## 兜底文案函数
- [x] `_get_fallback_response` 函数签名新增 `error_code` 参数
- [x] 对非鉴权错误（网络/5xx/429）返回的文案与修复前完全一致
- [x] 鉴权失败时返回的文案对用户友好，提示"前往设置检查 DeepSeek API Key"

## 端点覆盖
- [x] 主 Agent 聊天（`/api/agent-chat`、`/api/agent-chat-stream`）鉴权失败时按新规则处理
- [x] 深度规划（`/api/deep-planning-chat`，即 /spec）鉴权失败时按新规则处理

## 重试行为回归
- [x] 5xx 错误（500/502/503/504）仍然按现有指数退避重试 3 次
- [x] 429 限流错误仍然按现有策略重试，遵守 `Retry-After` 头

## 回归保护
- [x] 使用有效 API Key 时，主 Agent 聊天、深度规划对话、工具调用行为与修复前完全一致
- [x] 代码风格与项目现有模式一致（参照 `fix-reasoning-content-stripping` 等已合并 spec）
- [x] 不修改 `data_guard.py`、`config.py`、`index.html`、前端 JS 等无关文件
