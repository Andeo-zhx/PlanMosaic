# Tasks

- [x] Task 1: 在 main.js 的 executeToolCall 中新增 web_search_evaluate case
  - [x] 将 `executeToolCall` 函数声明改为 `async function executeToolCall(toolCall, scheduleData)`
  - [x] 在 `case 'manage_templates':` 之前新增 `case 'web_search_evaluate':` 
  - [x] 使用 Node.js 原生 `https` 模块调用 DuckDuckGo Instant Answer API
  - [x] 实现 8 秒超时保护（`req.on('timeout')`）
  - [x] 解析返回的 JSON，提取 AbstractText 和 RelatedTopics
  - [x] 返回与 `server.js` 一致格式的 JSON 结果
  - [x] 添加 try/catch 错误处理，网络错误时返回 fallback 信息

- [x] Task 2: 修复 async 调用点
  - [x] 两处 `executeToolCall(tc, scheduleData)` 调用前加 `await`
  - [x] `.then()` 回调改为 `async () => {...}`
  - [x] 确保 `try/catch` 能正确捕获 `await` 抛出的 Promise rejection

- [x] Task 3: 验证修复
  - [x] `node --check` 语法检查通过
  - [x] 确认所有 `executeToolCall` 调用点均已添加 `await`
  - [x] 确认工具在深度规划白名单中已存在（`DEEP_PLANNING_TOOL_WHITELIST` 中已包含）

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2