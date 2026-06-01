# CLI & UI Bridge 问题修复 Checklist

- [x] `cli/server.js` `startServer()` 端口已改为 8081
- [x] `cli/server.js` `startServer()` 无函数内冗余 require
- [x] `cli/server.js` `startServer()` 端口冲突时有友好提示
- [x] `main.js` `window-all-closed` 中调用了 `controlServer.close()`
- [x] `main.js` `before-quit` 中调用了 `controlServer.close()`
- [x] `main.js` `/ui/theme` 端点 `executeJavaScript()` 有 `.catch()` 错误处理
- [x] `main.js` `/ui/chat` 端点响应时机已修正
- [x] `cli/agent.js` `clearHistory()` 使用正确的文件写入方式
- [x] 所有修复通过 `node cli.js --help` 无异常