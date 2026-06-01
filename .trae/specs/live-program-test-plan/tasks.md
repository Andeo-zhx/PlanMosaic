# Tasks

## Phase 1: CLI 测试脚手架

- [x] **Task 1: 搭建 test-harness 基础框架**
  - 在项目根目录创建 `test/` 目录
  - 创建 `test/runner.js`：测试入口，支持 `--attach` 参数
  - 创建 `test/harness.js`：测试脚手架核心，负责启动 Electron 应用或连接现有实例
  - 测试模式启动时通过环境变量 `PLANMOSAIC_TEST_MODE=1` 标识
  - 输出格式：`[PASS]` / `[FAIL]` + 测试名称 + 耗时

- [x] **Task 2: 在 main.js 中添加测试 IPC 通道**
  - 当 `process.env.PLANMOSAIC_TEST_MODE` 存在时注册 `test:*` 通道
  - 添加 `test-exec` IPC handler：接收命令名和参数，执行对应的内部操作并返回结果
  - 添加 `test-query` IPC handler：查询应用状态（config、backend、messages 等）
  - 在 preload.js 中添加对应的 `electronAPI.testExec()` 和 `electronAPI.testQuery()` 暴露方法
  - **安全注意**：测试通道仅在测试模式下启用，生产构建不包含

- [x] **Task 3: 实现 harness 与应用的通信协议**
  - harness 通过 Electron IPC 向主进程发送测试命令
  - 支持的命令：`set-api-key`、`set-deepseek-model`、`send-message`、`get-config`、`get-messages`、`kill-backend`、`query-dom`
  - harness 同时支持直接 HTTP 调用 Python 后端（端口从配置读取）
  - 每个命令返回 `{ success, data, error, elapsed }` 结构

## Phase 2: 核心链路测试

- [x] **Task 4: API Key 配置流测试**
  - `test/cases/api-key-flow.js`
  - 测试 1：调用 `set-api-key` 设置有效 Key，验证后端 `/api/agent-chat` 不再返回 "未配置"
  - 测试 2：调用 `set-api-key` 设置占位 Key，验证后端返回 "未配置" 错误
  - 测试 3：验证 config.json 写入格式正确（嵌套 `api.deepseek.key` 结构）

- [x] **Task 5: AI 对话流测试**
  - `test/cases/chat-flow.js`
  - 测试 1：发送简单消息，验证 SSE 流式数据到达、done 事件仅触发一次
  - 测试 2：验证 doneSent 标志正常工作（res.on('end') 不重复发送 done）
  - 测试 3：验证响应的 model 名字段包含 `deepseek-v4-flash`

- [x] **Task 6: 工具调用与 reasoning_content 回传测试**
  - `test/cases/tool-call-flow.js`
  - 测试 1：发送日程创建消息，验证工具调用成功执行
  - 测试 2：切换到 Pro 模型，发送消息后验证 follow-up 请求不出现 400 错误
  - 测试 3：验证 `_is_reasoner_model('deepseek-v4-pro')` 返回 true

- [x] **Task 7: 对话历史保留测试**
  - `test/cases/context-retention.js`
  - 测试 1：发送 "我叫测试用户"，再发送 "我叫什么"，验证响应包含 "测试用户"
  - 测试 2：连续发送 3 条消息后，验证 conversationHistory 包含全部消息

## Phase 3: 配置与模型测试

- [x] **Task 8: 配置热重载测试**
  - `test/cases/config-hot-reload.js`
  - 测试 1：调用 `set-deepseek-model('pro')`，读取 config.json 验证 model 字段为 `deepseek-v4-pro`
  - 测试 2：验证后端 `/api/config` GET 返回的 model 已更新
  - 测试 3：调用 `set-api-key` 更新 Key，验证后端立即使用新 Key

- [x] **Task 9: 模型选择功能测试**
  - `test/cases/model-selection.js`
  - 测试 1：`get-deepseek-model` 返回 `{ model: 'flash', fullName: 'deepseek-v4-flash' }`（默认）
  - 测试 2：切换为 Pro 后 `get-deepseek-model` 返回 `{ model: 'pro', ... }`
  - 测试 3：验证 `set-deepseek-model('invalid')` 返回错误

## Phase 4: 异常恢复测试

- [x] **Task 10: 后端崩溃恢复测试**
  - `test/cases/backend-recovery.js`
  - 测试 1：通过 harness 终止 Python 后端进程，验证主进程检测到退出并在 5 秒内重启
  - 测试 2：重启后调用 `/api/agent-chat` 验证后端响应正常

- [x] **Task 11: 错误边界测试**
  - `test/cases/error-boundary.js`
  - 测试 1：发送空消息，验证不会崩溃且返回合理提示
  - 测试 2：断网环境下发送消息，验证前端显示错误提示（非永久 loading）
  - 测试 3：发送超长消息（10000 字符），验证不会被截断或崩溃

## Phase 5: UI 渲染验证

- [x] **Task 12: 消息渲染测试**
  - `test/cases/ui-message-render.js`
  - 测试 1：通过 `query-dom` 查询 `.agent-message.user .message-content`，验证 background 非 transparent
  - 测试 2：注入流式完成事件后，查询 `.thinking-process` 数量 ≤ 1
  - 测试 3：验证 `.right-panel-btn-label` 的 CSS `white-space` 为 `nowrap`

## Phase 6: 汇总与报告

- [x] **Task 13: 测试报告生成**
  - 测试报告已集成在 `test/runner.js` 中
  - 汇总所有测试结果，输出通过率统计
  - 失败的测试输出详细错误信息
  - 在终端中输出彩色 PASS/FAIL
  - 可选：生成 JSON 格式报告文件（`test/report.json`）

# Task Dependencies

- Task 2 依赖 Task 1（先搭架子再注册通道）
- Task 3 依赖 Task 2（通道就绪后才能通信）
- Task 4-12 依赖 Task 3（通信协议就绪后才能写测试用例）
- Task 4-12 之间无依赖，可并行开发
- Task 13 依赖 Task 4-12 全部完成