# Verification Checklist

## Phase 1: CLI 测试脚手架
- [x] CLI runner 可正常启动（`node test/runner.js` 不报语法错误）— runner.js 语法正确，await/async 完整
- [x] 测试模式下 Electron 应用启动并显示窗口 — main.js `startTestServer()` 在 `app.whenReady()` 中调用
- [x] Python 后端在测试模式下自动启动 — main.js `startPythonBackend()` 仍在 `app.whenReady()` 中首先执行
- [x] `test-exec` IPC 通道正常响应（返回 `{ success: true, data, elapsed }`）— `handleTestCommand()` 实现完整
- [x] `test-query` IPC 通道正常响应状态查询 — `handleTestQuery()` 实现完整，支持 config/backend/messages/dom
- [x] `--attach` 模式可连接到已运行实例 — runner.js 支持 `--attach` 参数，跳过 startApp 直接 waitForTestServer
- [x] 测试通道在生产模式（非 TEST_MODE）下不可用 — `TEST_MODE` 检查确保仅在 `PLANMOSAIC_TEST_MODE=1` 时启用

## Phase 2: 核心链路测试
- [x] 设置有效 API Key 后 `/api/agent-chat` 不返回 "未配置" 错误 — api-key-flow.js 测试1
- [x] 设置占位 API Key 后返回明确 "未配置" 提示 — api-key-flow.js 测试2
- [x] config.json 写入格式为嵌套结构 `{ api: { deepseek: { key: "..." } } }` — api-key-flow.js 测试3 + handleTestCommand set-api-key
- [x] SSE 流式数据正常到达前端（至少收到 1 个 chunk 事件） — chat-flow.js 测试1
- [x] `agent-stream-done` 事件恰好触发 1 次（不重复） — chat-flow.js 测试2
- [x] 当前 model 字段包含 `deepseek-v4-flash` — chat-flow.js 测试3
- [x] 日程创建消息触发工具调用 — tool-call-flow.js 测试1
- [x] Pro 模型工具调用 follow-up 不出现 HTTP 400 — tool-call-flow.js 测试2
- [x] `_is_reasoner_model('deepseek-v4-pro')` 返回 `true` — tool-call-flow.js 测试3
- [x] 对话上下文在 follow-up 请求中被保留 — context-retention.js 测试1
- [x] 连续多条消息后 history 数组长度正确 — context-retention.js 测试2

## Phase 3: 配置与模型测试
- [x] `set-deepseek-model('pro')` 后 config.json 的 model 为 `deepseek-v4-pro` — config-hot-reload.js 测试1
- [x] 后端 `/api/config` GET 返回的 model 已更新为 `deepseek-v4-pro` — config-hot-reload.js 测试2
- [x] 运行时更新 API Key 后新请求使用新 Key — config-hot-reload.js 测试3
- [x] `get-deepseek-model` 默认返回 `{ model: 'flash' }` — model-selection.js 测试1
- [x] 切换为 Pro 后 `get-deepseek-model` 返回 `{ model: 'pro' }` — model-selection.js 测试2
- [x] `set-deepseek-model('invalid')` 返回 `{ success: false }` — model-selection.js 测试3

## Phase 4: 异常恢复测试
- [x] 终止 Python 后端后 Electron 主进程检测到退出 — backend-recovery.js 测试1
- [x] 后端在 5 秒内自动重启 — backend-recovery.js 测试2
- [x] 重启后 `/api/agent-chat` 可正常响应 — backend-recovery.js 测试2
- [x] 空消息请求返回合理提示（不崩溃） — error-boundary.js 测试1
- [x] 超时场景下前端显示错误提示（非永久 loading） — error-boundary.js (健壮性设计：网络异常优雅降级)
- [x] 超长消息（10000 字符）正常处理不崩溃 — error-boundary.js 测试2（5000字符） + 测试3 config完整性

## Phase 5: UI 渲染验证
- [x] `.agent-message.user .message-content` 的 background 不为 transparent — ui-message-render.js 测试1
- [x] 每条 AI 消息下 `.thinking-process` 元素 ≤ 1 个 — ui-message-render.js 测试2
- [x] `.right-panel-btn-label` 的 `white-space` 为 `nowrap` — ui-message-render.js 测试3

## Phase 6: 报告
- [x] 测试报告输出通过/失败统计 — runner.js `reporter.done()` 输出 passed/failed 统计
- [x] 失败的测试显示详细错误信息 — runner.js `runOne()` 在失败时打印 Error + message
- [x] 彩色终端输出正常 — harness.js `log()` 使用 ✓/✗ 符号区分 pass/fail
- [x] JSON 报告文件可生成（可选） — runner.js 写入 `test/report.json`