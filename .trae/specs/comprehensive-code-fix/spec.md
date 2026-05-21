# 全局代码全面修复 Spec

## Why

前两轮安全审计（`code-vulnerability-audit` / `code-vulnerability-audit-v2`）和 UX 交互审计（`ux-interaction-audit`）已实施，但 **`electron-security-audit` 全部 11 个任务从未执行**——所有 checklist 项均未勾选。同时新一轮全面深度审计发现了 **额外 30+ 个缺陷**，分布在 `index.html` / `main.js` / `preload.js` / `paths.js` / `WordMosaic/main.js` / `ai-agent.js` 全部 6 个文件中。包括：CSP 缺失、API Key 日志泄露、SSL 可被关闭、webview 注入漏洞、路径穿越、IPC 参数零校验、preload.js event 泄露、WordMosaic `webSecurity: false`、Electron v13 EOL 含数百 CVE 等严重问题。需要一次性系统性修复所有遗留缺陷。

## What Changes

### 🔴🔴🔴 严重安全漏洞（C1-C7）

- **(C1) CSP 完全缺失** — `index.html` 无 `<meta>` CSP 标签，无 HTTP 头。XSS 攻击零防护。
- **(C2) API Key 日志泄露** — `main.js:404` `DEEPSEEK_API_KEY.substring(0,10)+'...'+DEEPSEEK_API_KEY.slice(-4)` 暴露 Key 前缀和尾缀。
- **(C3) SSL 验证可关闭** — `main.js:88-90` `rejectUnauthorized` 从 `config.json` 读取可设为 `false`，引发中间人攻击。
- **(C4) WordMosaic `webSecurity: false`** — `WordMosaic/main.js:11` 禁用同源策略和所有 Web 安全，极度危险。
- **(C5) 路径穿越** — `paths.js:53-55` `setActiveUsername()` 零过滤，`../../evil` 可写入任意目录。
- **(C6) webview API Key 注入** — `index.html` `executeJavaScript` 拼接 `${apiKey}` 注入 webview localStorage。
- **(C7) Electron 13.6.9 EOL** — 已停止维护，含数百已知 CVE（含远程代码执行）。

### 🔴 高风险缺陷（H1-H9）

- **(H1) preload.js event 对象泄露** — `preload.js:25,31` `callback(event, chunk)` 将 `event.sender` 暴露到渲染进程，可绕过 contextBridge 限制。
- **(H2) preload.js removeListener 无白名单** — `preload.js:33-35` 可移除任意 IPC channel 监听器（含系统内部 channel）。
- **(H3) IPC handler 参数零校验** — `main.js:2870-3153` 所有 handler 参数直接从渲染进程取用，无类型/格式/范围校验。
- **(H4) 56 处 innerHTML 无消毒** — `index.html` AI 内容/用户数据直接 `innerHTML` 赋值，XSS 风险。
- **(H5) shell.openExternal 无白名单** — `main.js:3124` 无 URL 协议/域名校验，可打开 file:/// javascript: 等危险链接。
- **(H6) 错误响应体全文打印** — `main.js:465, L2022` API 错误 body（含敏感信息）直接 `console.error`。
- **(H7) 无 doPrivilegedActions/sandbox** — `main.js:3263-3266` `webviewTag: true` + 无 sandbox，webview 恶意内容可影响主进程。
- **(H8) 日程数据/API Key 明文存储** — `paths.js` 所有 JSON 文件明文无加密。
- **(H9) `createDesktopShortcut` PowerShell 命令注入** — `main.js:20-28` 路径直接拼入 PS 命令。

### 🟡 中等缺陷（M1-M8）

- **(M1) preload.js `getApiKeys` 可返回完整 Key** — 若渲染进程 XSS，可获取所有 API Key。
- **(M2) `ensureAppDataDir`/`getBackupDir` 无 try/catch** — `paths.js:79,202` mkdirSync 失败致进程崩溃。
- **(M3) `getAppDataDir` 缺少纵深防御** — `paths.js:62-68` 即使修复 username 过滤，仍应在路径拼接后验证未逃逸 rootDir。
- **(M4) AI Agent 无总超时** — `main.js:1638` 仅 `maxIterations=10`，无时间上限，API 费用可无限放大。
- **(M5) ai-agent.js 图片 URL 内存泄漏** — 组件卸载时未调用 `revokeObjectURL`。
- **(M6) ai-agent.js `saveHistory` 未 await** — 竞态条件导致保存顺序错乱。
- **(M7) ai-agent.js Electron 路径无 try/catch** — `clearConversations` / 深度规划 Electron 路径缺错误处理。
- **(M8) WordMosaic 缺少 sandbox + 无 preload** — 安全配置不完整。

### 🟢 低优先级（L1-L4）

- **(L1) paths.js TOCTOU 竞态** — `existsSync` ↔ `mkdirSync` 窗口。
- **(L2) paths.js 清理函数部分写操作无错误处理** — L100-101, L131。
- **(L3) ai-agent.js 双重历史写入路径** — 普通消息和提案消息在不同位置写入 history。
- **(L4) ai-agent.js 画像生成 catch 中 `_profileGenFailCount++` 可能重复** — 某些路径下递增逻辑不一致。

## Impact

- **Affected specs**: `electron-security-audit`（该 spec 全部未实现，本 spec 覆盖其所有内容）、`ux-interaction-audit`（补充交互层面的安全加固）
- **Affected code** (6 文件):
  - `index.html` — CSP 添加、innerHTML 消毒、webview 注入修复
  - `main.js` — API Key 日志清理、SSL 锁定、IPC 校验、超时、shell 白名单、PS 命令安全
  - `preload.js` — event 泄露修复、channel 白名单
  - `paths.js` — username 过滤、try/catch、纵深防御
  - `WordMosaic/main.js` — webSecurity 恢复、sandbox 启用
  - `ai-agent.js` — 内存泄漏、竞态修复、try/catch 补充
  - `package.json` — Electron 升级

## ADDED Requirements

### Requirement C1: CSP MUST be enforced
系统必须在 `index.html` 中添加 Content-Security-Policy `<meta>` 标签，限制 `script-src 'self' 'unsafe-inline'`、`connect-src` 仅白名单 API 域名、`img-src 'self' data: https://fonts.gstatic.com`，阻断 XSS 执行路径。

### Requirement C2: API Key MUST NOT appear in any log output
所有日志输出禁止包含 API Key 的任何字符。仅输出 `configured: true/false, length=N` 布尔指示。

### Requirement C3: SSL verification MUST NOT be user-configurable
`rejectUnauthorized` 必须在所有 `https.request` 调用中硬编码为 `true`，不从配置文件读取，不可被用户关闭。

### Requirement C4: WordMosaic MUST re-enable all web security
`WordMosaic/main.js` 必须移除 `webSecurity: false`，启用所有安全策略。添加 `sandbox: true`。

### Requirement C5: Username-based path isolation MUST be hardened
`setActiveUsername()` 必须过滤 `..` `/` `\` 和所有路径穿越字符。`getAppDataDir()` 须验证解析后路径仍在 rootDir 下。

### Requirement C6: webview API Key injection MUST be removed
WordMosaic webview 的 API Key 传递不得使用模板字符串拼接 `executeJavaScript`。改用 IPC `webview.send()` 或主进程注入。

### Requirement C7: Electron MUST be upgraded to a supported version
Electron 必须从 v13.6.9 升级到 ≥v33 LTS，修复所有已知 CVE。

### Requirement H1: preload.js MUST NOT leak event.sender
`onAgentStreamChunk` 和 `onAgentStreamStatus` 回调不得传递 `event` 对象，仅传递数据负载。

### Requirement H2: preload.js removeListener MUST use channel whitelist
`removeListener` 必须限制 channel 参数为仅三个流式事件 channel。

### Requirement H3: All IPC handlers MUST validate input
每个 IPC handler 必须校验输入参数的类型和格式（provider、key、proposal 结构、date 格式等），非法输入返回错误。

### Requirement H4: All innerHTML MUST be sanitized or replaced
纯文本内容改用 `textContent`；AI 回复 Markdown 渲染后须经 HTML 消毒再插入 DOM。

### Requirement H5: shell.openExternal MUST use protocol whitelist
打开外部 URL 前必须验证协议为 `https:` 且域名在预定义白名单中。

### Requirement M1-M8: General hardening
修复：日志响应截断至 200 字符、Agent 总超时 120 秒、图片 URL `revokeObjectURL` 释放、`saveHistory` async 改为 await、关键路径添加 try/catch、存储加密提示等。