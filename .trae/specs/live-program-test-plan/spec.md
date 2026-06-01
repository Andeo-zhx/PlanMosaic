# Live Program Test Plan Spec

## Why
当前项目缺乏在程序实际运行状态下的端到端测试。之前的代码审计发现了大量 IPC 不一致、前后端配置断裂、流式响应重复等只有在运行时才会暴露的问题。需要一个自动化 CLI 测试方案，在程序打开的情况下系统性地验证核心链路。

## What Changes
- 搭建 CLI 自动化测试脚手架（test-harness），能启动/连接运行中的应用并发送测试指令
- 编写核心链路测试：API Key 配置流、AI 对话流、工具执行流、配置热重载、模型切换
- 编写异常恢复测试：后端崩溃恢复、超时重试、空响应处理
- 编写 UI 基础渲染测试：消息气泡、思考链折叠、侧边栏交互
- 所有测试要求在程序实际运行状态下执行

## Impact
- Affected specs: 无（新建测试基础设施）
- Affected code: 新建 `test/` 目录，对 main.js/preload.js 增加测试 IPC 通道

## ADDED Requirements

### Requirement: CLI Test Harness
系统 SHALL 提供一个命令行测试运行器，能够启动 Electron 应用并注入测试代码到主进程和渲染进程，收集测试结果并生成报告。

#### Scenario: 启动测试模式
- **GIVEN** 执行 `node test/runner.js`
- **WHEN** 测试运行器启动
- **THEN** Electron 应用以测试模式启动，Python 后端自动启动，测试通道就绪
- **AND** 所有测试按顺序执行并输出 PASS/FAIL 结果

#### Scenario: 连接已运行的应用
- **GIVEN** 应用已在运行且测试通道已打开
- **WHEN** 执行 `node test/runner.js --attach`
- **THEN** 测试运行器连接到现有实例，不重复启动应用

### Requirement: API Key 配置流测试
系统 SHALL 验证从"设置 API Key"到"后端可用"的完整链路。

#### Scenario: 设置 API Key 后后端立即可用
- **WHEN** 通过测试通道调用 `set-api-key` IPC（设置有效的 DeepSeek API Key）
- **THEN** config.json 被写入正确的格式
- **AND** Python 后端 `/api/config` 被调用，`config.load()` 更新了内存变量
- **AND** 立即调用 `/api/agent-chat` 不返回 "AI服务未配置" 错误

#### Scenario: API Key 为无效格式时给出明确提示
- **WHEN** 通过测试通道调用 `set-api-key` 设置 `YOUR_DEEPSEEK_API_KEY_HERE`
- **THEN** 后端 `/api/agent-chat` 返回包含 "未配置" 的错误信息

### Requirement: AI 对话流测试
系统 SHALL 验证用户消息发送、流式响应接收、消息渲染的完整链路。

#### Scenario: 发送消息收到流式响应
- **WHEN** 通过测试通道发送消息 "今天天气怎么样"
- **THEN** 后端调用 DeepSeek API（含正确模型名 `deepseek-v4-flash` 或 `deepseek-v4-pro`）
- **AND** 流式 SSE 数据正确转发到前端
- **AND** 前端收到 `agent-stream-done` 恰好一次（不重复）

#### Scenario: 工具调用循环正确执行
- **WHEN** 发送需要工具调用的消息（如 "帮我添加明天下午3点的会议"）
- **THEN** 后端正确调用日程创建工具
- **AND** 工具结果回传给 AI 时 `reasoning_content` 被正确保留（v4-pro 模型）
- **AND** 最终响应包含日程确认信息

#### Scenario: 对话历史在后续请求中被保留
- **GIVEN** 已发送过一次消息 "我叫张三"
- **WHEN** 发送消息 "我叫什么名字"
- **THEN** AI 响应包含 "张三"（证明上下文被保留）

### Requirement: 配置热重载测试
系统 SHALL 验证在不重启应用的情况下切换配置能立即生效。

#### Scenario: 运行时切换模型
- **GIVEN** 当前使用 Flash 模型
- **WHEN** 通过设置切换为 Pro 模型
- **THEN** config.json 更新为 `"model": "deepseek-v4-pro"`
- **AND** 后端 `app_config.deepseek_model` 已更新
- **AND** 下一次对话请求使用 Pro 模型

#### Scenario: 运行时更新 API Key
- **GIVEN** 已配置有效 Key A
- **WHEN** 更新为 Key B
- **THEN** 下一次对话请求使用 Key B（而非缓存的 Key A）

### Requirement: 错误恢复测试
系统 SHALL 在异常情况下优雅降级并提供可恢复的路径。

#### Scenario: Python 后端崩溃后自动重启
- **GIVEN** 应用正常运行
- **WHEN** Python 后端进程被终止
- **THEN** 主进程在 3 秒内检测到并尝试重启
- **AND** 前端显示 "正在重连..." 而非空白或崩溃

#### Scenario: API 请求超时时前端有提示
- **WHEN** DeepSeek API 响应时间超过超时限制
- **THEN** 前端显示超时错误信息而非永久 loading
- **AND** 用户可以重新发送消息

### Requirement: UI 基础渲染测试
系统 SHALL 验证前端界面的关键渲染路径。

#### Scenario: 用户消息渲染为聊天气泡
- **WHEN** 通过测试通道注入一条用户消息到聊天容器
- **THEN** 消息渲染为 `.agent-message.user` 元素
- **AND** 消息内容区有背景色（非透明/黑色胶囊）

#### Scenario: AI 思考链不重复渲染
- **WHEN** 流式响应结束并触发 doneHandler
- **THEN** 每条 AI 消息下 `.thinking-process` 元素不超过 1 个

#### Scenario: 侧边栏按钮标签可读
- **WHEN** 右侧边栏渲染完成
- **THEN** `.right-panel-btn-label` 文字为横向排列（非竖排）
- **AND** 文字颜色不为 `var(--text-disabled)` 浅色

### Requirement: 模型选择功能测试
系统 SHALL 验证 Flash/Pro 模型选择功能的完整性。

#### Scenario: 选择 Pro 模型后使用正确模型名
- **WHEN** 测试通道执行 `set-deepseek-model('pro')`
- **THEN** config.json 写入 `"model": "deepseek-v4-pro"`
- **AND** `get-deepseek-model` 返回 `{ model: 'pro', fullName: 'deepseek-v4-pro' }`

#### Scenario: Pro 模型的 reasoning_content 被正确回传
- **GIVEN** 已选择 Pro 模型
- **WHEN** 执行需要工具调用的对话
- **THEN** 工具调用后的 follow-up 请求包含 `reasoning_content`
- **AND** 不出现 HTTP 400 错误