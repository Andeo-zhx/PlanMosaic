# Electron 桌面端安全审计与漏洞修复 Spec

## Why

前两轮审计（`code-vulnerability-audit` / `code-vulnerability-audit-v2`）覆盖了 Android 和 Uni-app 端的安全缺陷，但**未覆盖 Electron 桌面端**（`main.js` ~3300行 / `index.html` ~10000行 / `preload.js` / `ai-agent.js`）。经过对 Electron 端交互逻辑的全面挖掘，发现**多项严重安全漏洞**，包括：CSP 完全缺失、大量 `innerHTML` 未消毒注入 AI 生成内容、webview 中 API Key 通过 `executeJavaScript` 明文注入、路径穿越风险、日志泄露 API Key 前缀、WordMosaic 子应用 `webSecurity: false`、SSL 证书验证可被配置关闭等。这些漏洞可导致 XSS 攻击、凭据泄露、远程代码执行等严重后果。

## What Changes

### 🔴 严重安全漏洞（Priority: CRITICAL）

- **CSP（内容安全策略）完全缺失** `index.html`：无 `<meta>` CSP 标签，无 HTTP 响应头。浏览器/webview 对 XSS 零防护，攻击者可通过 `innerHTML` 注入任意脚本执行。
- **56 处 `innerHTML` 直接赋值未消毒** `index.html`：AI 回复内容、提案卡片、用户日程数据等全部通过 `innerHTML` 渲染。若 AI 返回恶意 HTML（prompt injection），或用户日程标题含 `<script>`，将触发 XSS。
- **webview 中 API Key 通过 `executeJavaScript` 明文注入** `index.html:6573-6584`：将用户的 API Key 拼入 JS 字符串后注入 WordMosaic webview 的 `localStorage`。若 WordMosaic 页面存在 XSS（且其 CSP/沙箱不保护），Key 直接泄露。
- **WordMosaic 子应用 `webSecurity: false`** `WordMosaic/main.js:11`：关闭同源策略和 web 安全限制，该子应用完全无防护。
- **`shell.openExternal` 无 URL 白名单校验** `main.js:3124`：虽然当前仅打开 `API_KEY_INFO` 中硬编码的 URL，但如果未来通过 IPC 参数传入 URL，可打开任意恶意链接（file://、javascript: 等）。
- **API Key 前缀泄露到终端日志** `main.js:404`：`DEEPSEEK_API_KEY.substring(0, 10) + '...'` 暴露 Key 前 10 个字符，满足一定条件下可辅助暴力破解。
- **错误响应体全文打印到控制台** `main.js:465, L2022`：API 错误返回的完整 HTTP body（含可能的敏感信息）直接 `console.error`。
- **SSL 证书验证可被配置文件关闭** `main.js:88-90`：`appSettings.rejectUnauthorized` 可以从 `config.json` 读取并设为 `false`，关闭所有 HTTPS 证书验证，导致中间人攻击风险。

### 🟠 高风险缺陷（Priority: HIGH）

- **路径穿越风险** `paths.js:48-54` + `main.js:2876`：`setActiveUser` 通过 IPC 接收 username 并拼入文件路径（`rootDir/username/`），未过滤 `..` 或 `/` `\`。攻击者可设置 username 为 `../../evil` 写入任意目录。
- **`webviewTag: true` + `sandbox: false`** `main.js:3263-3266`：启用 webview 但禁用 sandbox，webview 内的恶意内容可能影响主进程。
- **IPC 参数零校验** `main.js:2870-3153`：所有 IPC handler 参数直接从渲染进程取用，无类型/范围/格式校验。尤其 `set-api-key` 接受任意字符串写入配置文件。
- **无速率限制**：IPC handler 无调用频率限制，可被恶意前端脚本洪水攻击导致文件系统 IO 饱和。
- **AI Agent 工具调用无限循环风险** `main.js:1638`：`maxIterations = 10` 且工具调用结果可能触发新一轮 API 调用，无总超时限制，API 费用可被放大。
- **日程数据全量明文存储在 AppData** `paths.js`：`data.json`、`config.json`（含 API Key）以明文 JSON 存储，任何有文件系统访问权限的进程均可读取。
- **Electron 版本过旧（v13.6.9）** `package.json:20`：Electron 13 已于 2022 年停止维护，存在数百个已知 CVE，包括任意代码执行漏洞。当前最新稳定版为 v28+。

### 🟡 中风险问题（Priority: MEDIUM）

- **webview `partition="persist:wordmosaic"` 无 isolation** `index.html:6447`：webview 使用持久化 partition 但未设置 `allowtransparency`、`disablewebsecurity` 等关键安全属性。
- **`Node.js integration` 已关闭但 `contextIsolation` 的正确性依赖 preload.js 无缺陷**：当前 preload.js 较简洁，但新增 IPC 通道时可能引入绕过风险。
- **`ai-agent.js` 在 Web 模式下走 HTTP fetch**（`ai-agent.js:57`）：若非 Electron 环境，AI 对话走明文 HTTP，存在中间人拦截风险。
- **无自动更新机制**：Electron 13 不再接收安全补丁，应用无法自动更新到安全版本。
- **`createDesktopShortcut` 使用 PowerShell 拼接字符串** `main.js:12-27`：路径字符串直接拼入 PowerShell 命令，若 `exePath` 或 `desktop` 路径含特殊字符（如单引号），可导致命令注入。

## Impact

- **Affected specs**: `code-vulnerability-audit` / `code-vulnerability-audit-v2`（补充 Electron 端审计）
- **Affected code**:
  - `index.html` — 添加 CSP meta 标签、消毒所有 `innerHTML` 赋值（56 处）
  - `main.js` — 修复日志泄露、添加 IPC 参数校验、修复路径穿越、升级 API 调用安全
  - `preload.js` — 审查并加固 IPC 通道白名单
  - `paths.js` — 添加 username 路径穿越过滤
  - `WordMosaic/main.js` — 启用 `webSecurity: true`，添加安全配置
  - `ai-agent.js` — Web 模式强制 HTTPS
  - `package.json` — 升级 Electron 版本

## ADDED Requirements

### Requirement: CSP MUST be enforced on all renderer pages
系统 SHALL 在 `index.html` 中添加严格的 Content-Security-Policy meta 标签，限制脚本来源、禁止 inline script 执行（或使用 nonce/hash）、限制 connect-src 仅允许必要的 API 域名。

#### Scenario: XSS 注入被 CSP 阻止
- **WHEN** 攻击者通过 AI prompt injection 使回复内容包含 `<script>alert(1)</script>`
- **THEN** 浏览器拒绝执行该脚本，控制台显示 CSP 违规报告

#### Scenario: 合法脚本正常执行
- **WHEN** 应用加载并执行正常的日程管理、AI 对话功能
- **THEN** 所有功能正常运行，无 CSP 误报阻断

### Requirement: All innerHTML assignments MUST use safe DOM APIs
所有 `innerHTML` 赋值必须替换为 `textContent` 或经过 HTML 转义的安全 DOM 操作。AI 回复中的 Markdown 渲染必须先经过消毒（sanitize）再插入 DOM。

#### Scenario: AI 回复含 HTML 标签不被执行
- **WHEN** AI 回复内容包含 `<img src=x onerror=alert(1)>`
- **THEN** 渲染结果仅显示纯文本或转义后的 HTML 源码，不触发 onerror

### Requirement: API Key MUST NOT be injected via executeJavaScript into webview
WordMosaic webview 的 API Key 传递不得使用 `executeJavaScript` 拼接字符串。必须使用 IPC 通道或 `webview.send()` 安全传递。

#### Scenario: WordMosaic 子应用可正常访问 API
- **WHEN** 用户打开 WordMosaic 词汇学习功能
- **THEN** WordMosaic 正常获取到 API Key 并能调用 AI 服务，但 Key 不经过 `executeJavaScript` 字符串拼接

### Requirement: WordMosaic sub-app MUST re-enable webSecurity
`WordMosaic/main.js` 中 `webSecurity: false` 必须移除或设为 `true`。如因跨域资源加载需要，应通过 CSP 或自定义协议处理，而非全局关闭安全策略。

#### Scenario: WordMosaic 正常加载
- **WHEN** 用户打开 WordMosaic 子应用
- **THEN** 所有资源正常加载，且 `webSecurity` 为 `true`

### Requirement: shell.openExternal MUST validate URL against whitelist
`shell.openExternal()` 调用前必须校验 URL 协议为 `https:` 且域名为已知白名单（`platform.deepseek.com`、`dashscope.console.aliyun.com`）。拒绝 `file:`、`javascript:` 等危险协议。

#### Scenario: 合法 API Key 获取链接可打开
- **WHEN** 用户点击"获取 API Key"按钮
- **THEN** 系统浏览器打开白名单中的合法 HTTPS URL

#### Scenario: 恶意 URL 被拒绝
- **WHEN** 渲染进程尝试通过 IPC 打开 `file:///C:/Windows/System32/cmd.exe` 或 `javascript:alert(1)`
- **THEN** shell.openExternal 拒绝打开，记录安全警告日志

### Requirement: API Key MUST NOT be partially exposed in logs
日志输出不得包含 API Key 的任何部分（包括前缀）。Key 存在性检查仅输出布尔值（hasKey: true/false）。

#### Scenario: 启动时日志不含 Key 信息
- **WHEN** 应用启动并加载配置
- **THEN** 终端日志仅显示 `[Config] DeepSeek API key: configured (length=35)`，不含任何 Key 字符

### Requirement: SSL certificate validation MUST NOT be user-configurable to disable
`rejectUnauthorized` 配置项不得从 `config.json` 读取。该值必须在内置常量中硬编码为 `true`，禁止用户通过任何方式关闭 TLS 证书验证。

#### Scenario: 自签名证书环境不可 MitM 攻击
- **WHEN** 攻击者使用代理工具拦截 HTTPS 流量
- **THEN** 应用拒绝连接并报 SSL 错误，不会将 API Key 明文发送给攻击者

### Requirement: Username-based path isolation MUST filter traversal sequences
`setActiveUser` 接受的 username 参数必须过滤 `..`、`/`、`\` 等路径穿越字符。只允许字母、数字、下划线、连字符和中文字符。

#### Scenario: 合法用户名正常使用
- **WHEN** 用户设置用户名为 "张三_2024"
- **THEN** 数据目录创建在 `%APPDATA%/PlanMosaic/张三_2024/` 下

#### Scenario: 路径穿越攻击被阻止
- **WHEN** 渲染进程传入 username = `../../evil`
- **THEN** 主进程拒绝该用户名，不创建目录，记录安全警告

### Requirement: All IPC handler parameters MUST be validated
每个 IPC handler 必须校验输入参数的类型、范围和格式（如日期格式 YYYY-MM-DD、API Key 非空且长度合理、provider 仅为 'deepseek' 或 'qwen'）。

#### Scenario: set-api-key 拒绝无效 provider
- **WHEN** 渲染进程调用 `setApiKey('evil_provider', 'sk-xxx')`
- **THEN** 返回 `{ success: false, error: 'Invalid provider' }`

### Requirement: Electron MUST be upgraded to a supported version
Electron 版本必须从 v13.6.9 升级到最新 LTS 版本（当前 v33+），以修复数百个已知 CVE。

#### Scenario: 应用正常启动和运行
- **WHEN** 升级 Electron 后启动应用
- **THEN** 所有现有功能（日程管理、AI 对话、WordMosaic、构建打包）正常运作

### Requirement: Desktop shortcut creation MUST use safe API instead of PowerShell string concatenation
创建桌面快捷方式不得使用字符串拼接 PowerShell 命令。应使用 Electron `app.setUserTasks()` 或 Node.js 原生方式，或对路径参数进行严格转义。

#### Scenario: 特殊路径不触发命令注入
- **WHEN** 应用安装在路径含单引号的目录（如 `C:\Users\O'Brien\PlanMosaic`）
- **THEN** 快捷方式正常创建，无 PowerShell 语法错误或命令注入

### Requirement: AI Agent tool-call loop MUST have total timeout
Agent 工具调用循环必须在总时间超时后强制终止（建议 120 秒），防止 API 费用无限放大。

#### Scenario: 复杂多步骤操作正常完成
- **WHEN** Agent 需要 3-5 轮工具调用来规划日程
- **THEN** 120 秒内正常完成

#### Scenario: 异常循环被超时中断
- **WHEN** Agent 因 API 返回格式异常导致无限工具调用循环
- **THEN** 120 秒后强制终止，UI 显示"请求超时，请重试"友好提示

## MODIFIED Requirements

### MODIFIED: ai-agent.js Web mode MUST use HTTPS
`ai-agent.js` 中非 Electron 环境下的 `fetch('/api/agent-history')` 和 `fetch('data.json?' + Date.now())` 必须使用 HTTPS 协议，而非相对路径 HTTP。

#### Scenario: Web 模式安全通信
- **WHEN** 用户在 Web 浏览器中打开应用
- **THEN** 所有 API 请求通过 HTTPS 发送，无明文传输