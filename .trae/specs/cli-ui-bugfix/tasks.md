# Tasks

- [x] Task 1: 修复 `cli/server.js` 端口冲突和冗余代码
  - [x] 将 `startServer()` 端口从 8080 改为 8081
  - [x] 移除函数内冗余的 `const http = require('http')` 和 `const fs = require('fs')`
  - [x] 添加端口占用的 try-catch 友好提示
  - **验证**: ✅ 端口改为 8081，server.on('error') 处理 EADDRINUSE

- [x] Task 2: 修复 `main.js` 控制服务器资源泄漏
  - [x] 在 `window-all-closed` 和 `before-quit` 中添加 `controlServer.close()`
  - [x] 添加空值检查 `if (controlServer)`
  - **验证**: ✅ L1914-L1917 和 L1933-L1936 均有 close + null 置空

- [x] Task 3: 修复 `main.js` `/ui/theme` 端点缺少 `.catch()`
  - [x] 为 `executeJavaScript()` 添加 `.catch()` 返回错误 JSON
  - **验证**: ✅ L1559-L1562 添加了 catch(err => { res.writeHead(200); res.end({success:false, error}) })

- [x] Task 4: 修复 `main.js` `/ui/chat` 端点响应时机
  - [x] 在 `webContents.send()` 后立即响应，注明 `ack` 状态
  - **验证**: ✅ L1590-L1592 响应中包含 `ack: 'sent'` 和 hint 字段

- [x] Task 5: 修复 `cli/agent.js` `clearHistory()` 写入错误
  - [x] 使用 `fs.writeFileSync(logFile, ...)` 替代错误的 `h.saveConfig()`
  - **验证**: ✅ L156 使用 fs.writeFileSync + try-catch，移除错误的 saveConfig 调用

# Task Dependencies
- Task 1, 2, 3, 4, 5 互不依赖，可并行执行