# CLI & UI Bridge 问题修复 Spec

## Why
上一轮实现了完整的 CLI 操作端和 CLI-UI 桥接（HTTP 控制服务器），但交叉审计发现了 6 个真实 bug 和质量问题，涉及端口冲突、异步未处理、资源泄漏等，需要修复以保证系统稳定可靠。

## What Changes
- 修复 `cli/server.js` 中 `startServer()` 端口 8080 与 Python 后端冲突
- 修复 `main.js` 中 `/ui/theme` 端点缺少 `.catch()` 导致请求可能挂起
- 修复 `main.js` 中控制服务器在应用退出时未关闭（资源泄漏）
- 修复 `cli/server.js` 中 `startServer()` 函数内冗余 `require`
- 修复 `cli/agent.js` 中 `clearHistory()` 用错存储函数
- 修复 `main.js` 中 `/ui/chat` 端点响应先于实际执行返回

## Impact
- Affected specs: none (新功能修复)
- Affected code: `main.js`, `cli/server.js`, `cli/agent.js`

## MODIFIED Requirements

### Requirement: CLI 服务器端口隔离
The `node cli.js server start --http` 命令 SHALL NOT 与 Python 后端端口 8080 冲突。独立 HTTP 服务应使用独立端口。

#### Scenario: 启动 HTTP 服务不冲突
- **WHEN** Python 后端运行在 8080 且用户执行 `node cli.js server start --http`
- **THEN** HTTP 服务启动在 8081 端口，不会 EADDRINUSE

#### Scenario: 端口占用友好提示
- **WHEN** 目标端口已被占用
- **THEN** 显示明确错误信息并建议更换端口

### Requirement: 控制服务器优雅关闭
The 桌面应用退出时 SHALL 关闭 CLI 控制 HTTP 服务器以释放端口。

#### Scenario: 窗口关闭时释放端口
- **WHEN** 所有窗口关闭
- **THEN** `controlServer.close()` 被调用，端口 5199 释放

#### Scenario: 退出前释放端口
- **WHEN** Electron 触发 `before-quit`
- **THEN** 控制服务器已关闭

### Requirement: 异步端点错误处理完整
All HTTP endpoints using `executeJavaScript()` SHALL 包含 `.catch()` 处理，防止请求挂起。

#### Scenario: JS 执行失败时有响应
- **WHEN** `/ui/theme` 的 `executeJavaScript()` 执行失败
- **THEN** 客户端收到 `{success: false, error: ...}` 而非请求挂起

### Requirement: ui chat 端点在消息发送完成后才响应
The `/ui/chat` endpoint SHALL 等待渲染进程确认收到消息后再响应客户端。

#### Scenario: 消息确认后响应
- **WHEN** `/ui/chat` 收到消息
- **THEN** 向渲染进程发送消息并等待确认后返回 `{success: true}`
- **OR** 在 `webContents.send()` 后立即响应并注明 `ack: "pending"`

### Requirement: agent clearHistory 使用正确的存储路径
The `node cli.js agent clear` 命令 SHALL 将清空后的数据写入正确的 agent log 文件。

#### Scenario: 清空对话记录
- **WHEN** 用户执行 `node cli.js agent clear`
- **THEN** agent log 文件被正确更新，对话列表为空

### Requirement: 冗余代码清理
The `startServer()` 函数 SHALL NOT 在函数体内冗余 `require` 顶层已导入的模块。

#### Scenario: 代码无冗余导入
- **WHEN** 审查 `cli/server.js`
- **THEN** 不再有函数内部的 `const http = require('http')` 等顶层重复导入