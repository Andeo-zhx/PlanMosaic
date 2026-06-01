# Tasks

## 🔴 严重安全修复（C1-C7）

- [x] Task C1: 添加 CSP 内容安全策略（index.html）
  - [x] SubTask C1.1: 在 `<head>` 中添加 `<meta http-equiv="Content-Security-Policy">` 标签
  - [x] SubTask C1.2: 配置 `default-src 'self'` + `script-src 'self' 'unsafe-inline'` + `connect-src 'self' https://api.deepseek.com https://dashscope.aliyuncs.com https://*.supabase.co`
  - [x] SubTask C1.3: 配置 `img-src 'self' data: https://fonts.gstatic.com https://*.supabase.co` + `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` + `font-src https://fonts.gstatic.com`
  - [x] SubTask C1.4: 配置 `frame-src 'self'`（webview 专项 CSP 在主进程设置）
  - **验证**: DevTools 执行 `eval('alert(1)')` 被 CSP 拒绝；所有功能正常

- [x] Task C2: 消除 API Key 日志泄露（main.js）
  - [x] SubTask C2.1: `main.js:404` 将 `DEEPSEEK_API_KEY.substring(0,10)+'...'` 改为 `configured: true/false, length=N`
  - [x] SubTask C2.2: 全局搜索所有 `console.log/error` 含 API Key 或 Key 变量的模式，逐一修复
  - **验证**: 终端日志不含任何 API Key 字符；仅显示 `configured: true, length=35`

- [x] Task C3: 锁定 SSL 验证不可配置（main.js）
  - [x] SubTask C3.1: `main.js:88-90` 移除 `config.security?.rejectUnauthorized` 读取逻辑
  - [x] SubTask C3.2: 所有 `https.request` 调用硬编码 `rejectUnauthorized: true`
  - [x] SubTask C3.3: `loadSettings()` 中删除 `appSettings.rejectUnauthorized` 赋值
  - **验证**: 修改 config.json `security.rejectUnauthorized: false` 后，所有 HTTPS 请求仍使用有效 SSL

- [x] Task C4: 修复 WordMosaic `webSecurity: false`（WordMosaic/main.js）
  - [x] SubTask C4.1: L11 将 `webSecurity: false` 改为 `webSecurity: true`
  - [x] SubTask C4.2: 添加/确认 `contextIsolation: true` + `nodeIntegration: false`
  - [x] SubTask C4.3: 添加 `sandbox: true`（或确认兼容性后启用）
  - [x] SubTask C4.4: 检查是否需要 preload 脚本处理跨域资源
  - **验证**: WordMosaic 子应用正常加载，所有功能可用

- [x] Task C5: 修复路径穿越漏洞（paths.js + main.js）
  - [x] SubTask C5.1: `paths.js` 新增 `sanitizeUsername(username)` 函数，正则 `^[\w\u4e00-\u9fff\-_]+$` 过滤
  - [x] SubTask C5.2: `setActiveUsername()` 调用 sanitize，非法输入返回 null
  - [x] SubTask C5.3: `getAppDataDir()` 添加纵深防御：`path.resolve()` 后验证 `startsWith(rootDir)`
  - [x] SubTask C5.4: `main.js` `set-active-user` handler 校验返回值，非法时拒绝
  - **验证**: `setActiveUser('../../evil')` 被拒绝；`setActiveUser('正常用户_2024')` 正常

- [x] Task C6: 移除 webview executeJavaScript API Key 注入（index.html + main.js）
  - [x] SubTask C6.1: 搜索 `_injectWordMosaicKeyWebview` 中所有 `${apiKey}` / `${key}` 模板字符串拼接
  - [x] SubTask C6.2: 在 `main.js` 新增 IPC handler `get-wordmosaic-api-key`，通过 IPC 安全传递 Key
  - [x] SubTask C6.3: 渲染进程通过 `window.electronAPI.getWordMosaicApiKey()` 获取，不再拼接进 executeJavaScript
  - [x] SubTask C6.4: 若 WordMosaic 需预注入，改用 `webview.send('set-api-key', key)` IPC 方式
  - **验证**: 全局搜索 `executeJavaScript` 中不再出现 `${apiKey}` 模板字符串

- [x] Task C7: 升级 Electron 到 LTS 版本（package.json）
  - [x] SubTask C7.1: 修改 `package.json` 中 `electron` 版本至 ≥v33 LTS
  - [x] SubTask C7.2: 同步升级 `electron-builder` 至兼容版本
  - [x] SubTask C7.3: 执行 `npm install` 安装
  - [x] SubTask C7.4: 逐项验证 `npm start` 启动、IPC、WordMosaic 均正常
  - [x] SubTask C7.5: 验证 `npm run build` 构建便携版 EXE 成功
  - **验证**: 应用启动正常，日程 CRUD、AI 对话、WordMosaic 均正常

## 🔴 高风险修复（H1-H9）

- [x] Task H1: 修复 preload.js event 对象泄露（preload.js）
  - [x] SubTask H1.1: `onAgentStreamChunk` 回调从 `callback(event, chunk)` 改为 `callback(chunk)`
  - [x] SubTask H1.2: `onAgentStreamStatus` 回调从 `callback(event, status)` 改为 `callback(status)`
  - [x] SubTask H1.3: 同步更新 `index.html` 和 `ai-agent.js` 中所有 listener 回调签名
  - **验证**: 渲染进程无法通过回调参数访问 `event.sender`

- [x] Task H2: preload.js removeListener 添加 channel 白名单（preload.js）
  - [x] SubTask H2.1: 定义 `ALLOWED_REMOVE_CHANNELS = ['agent-chat-stream-chunk', 'agent-chat-stream-status', 'agent-chat-stream-done']`
  - [x] SubTask H2.2: `removeListener` handler 校验 channel 在白名单内，否则拒绝
  - **验证**: 尝试移除非法 channel 被忽略；正常 channel 可移除

- [x] Task H3: 所有 IPC handler 添加参数校验（main.js）
  - [x] SubTask H3.1: `set-api-key` 校验 `provider ∈ ['deepseek','qwen']` + `key` 非空且长度 ≥20
  - [x] SubTask H3.2: `set-agent-provider` 校验 `provider ∈ ['deepseek','qwen']`
  - [x] SubTask H3.3: `agent-approve` 校验 `proposal` 为对象且有 `type` 字段
  - [x] SubTask H3.4: `save-schedule-data` 校验 `data` 为对象
  - [x] SubTask H3.5: `save-agent-history` 校验 `data` 为对象
  - [x] SubTask H3.6: `set-active-user` 校验 `username` 为非空字符串
  - [x] SubTask H3.7: 其余 handler (`get-api-keys`, `remove-api-key`, `get-active-user`, `get-wordmosaic-path` 等) 添加适当类型校验
  - **验证**: 非法参数返回结构化错误 `{success: false, error: '...'}`

- [x] Task H4: 消毒所有 innerHTML 赋值（index.html）
  - [x] SubTask H4.1: 新增 `escapeHtml(str)` 工具函数（转义 `<>&"'`）
  - [x] SubTask H4.2: 将纯文本 innerHTML（日期、活动名、任务名、用户输入 echo）改为 `textContent`
  - [x] SubTask H4.3: AI/Markdown 回复先渲染为 HTML，再经 `escapeHtml` 或简易消毒过滤 `<script>` `<iframe>` `<object>` 标签
  - [x] SubTask H4.4: 编辑表单（createEditForm）用户数据拼接改为 `createElement` + `textContent`
  - **验证**: 日程标题含 `<img src=x onerror=alert(1)>` 不触发 alert

- [x] Task H5: shell.openExternal 协议白名单（main.js）
  - [x] SubTask H5.1: 定义 `ALLOWED_EXTERNAL_URLS = ['https://platform.deepseek.com', 'https://dashscope.console.aliyun.com']`
  - [x] SubTask H5.2: 新增 `safeOpenExternal(url)` 函数，校验 `new URL(url).protocol === 'https:'` + 域名在白名单
  - [x] SubTask H5.3: `open-api-key-url` handler 改用 `safeOpenExternal`
  - **验证**: 正常链接可打开；`javascript:alert(1)` / `file:///C:/` 被拒绝并记日志

- [x] Task H6: 截断错误响应体日志（main.js）
  - [x] SubTask H6.1: `main.js:465` 和 `L2022` 中 `console.error('Response Body:', body)` 改为 `body.substring(0, 200)`
  - [x] SubTask H6.2: 全局搜索所有 `console.log/error` 含 `JSON.stringify(response)` 或 `body` 的敏感输出，统一截断
  - **验证**: 触达 API 错误时日志仅显示前 200 字符

- [x] Task H7: webview 安全加固（main.js）
  - [x] SubTask H7.1: 检查 `BrowserWindow` 构造参数中是否有 `webviewTag: true` 且无 sandbox 配置
  - [x] SubTask H7.2: 根据 Electron 版本决定是否启用 sandbox 或添加 `will-attach-webview` 事件监听限制权限
  - [x] SubTask H7.3: webview 加载前校验 URL 为本地文件
  - **验证**: webview 加载外部恶意 URL 被拦截

- [x] Task H8: 日程数据存储加密提示/基础加固（paths.js + main.js）
  - [x] SubTask H8.1: 在数据写入路径添加注释标记"明文存储——未来迭代加密"
  - [x] SubTask H8.2: 确认 API Key 存储不暴露给渲染进程（仅主进程持有，通过 IPC 按需传递脱敏 Key）
  - **验证**: 数据文件 JSON 结构不变；Key 不完整暴露给渲染进程

- [x] Task H9: 修复 PowerShell 命令注入（main.js）
  - [x] SubTask H9.1: `createDesktopShortcut` 中 `exePath` 和 `desktop` 单引号转义（`'` → `''`）
  - [x] SubTask H9.2: 路径变量用单引号包裹（`'${escapedPath}'`）
  - [x] SubTask H9.3: 添加路径安全检查（无不安全字符 `;` `|` `&` `$` `` ` `` `\n`）
  - **验证**: 含特殊字符的安装路径正常创建快捷方式

## 🟡 中等修复（M1-M8）

- [x] Task M1: preload.js getApiKeys 风险控制（preload.js）
  - [x] SubTask M1.1: `getApiKeys` 仅返回 `{provider, configured: true/false}` 而非完整 key
  - [x] SubTask M1.2: 渲染进程需要完整 key 时通过独立 IPC（如 `get-api-key-for-injection`）按需获取
  - **验证**: `window.electronAPI.getApiKeys()` 返回值不含完整 key 字符串

- [x] Task M2: paths.js 关键函数添加 try/catch（paths.js）
  - [x] SubTask M2.1: `ensureAppDataDir()` (L79) 包裹 try/catch，失败时返回 false 而非 crash
  - [x] SubTask M2.2: `getBackupDir()` (L202) 包裹 try/catch
  - **验证**: 磁盘满/权限不足时应用不崩溃，返回 false 并显示 toast

- [x] Task M3: paths.js getAppDataDir 纵深防御（paths.js）
  - [x] SubTask M3.1: L62-68 在 `path.join(rootDir, sanitized)` 后添加 `path.resolve` + `startsWith(rootDir)` 验证
  - **验证**: 即使 sanitize 遗漏边缘 case，最终路径仍在 rootDir 下

- [x] Task M4: AI Agent 添加总超时（main.js）
  - [x] SubTask M4.1: `callDeepseekAPIMessages()` 开头记录 `startTime = Date.now()`
  - [x] SubTask M4.2: 每轮迭代前检查 `Date.now() - startTime > 120000`（2分钟）
  - [x] SubTask M4.3: 流式和非流式分支均添加超时检查
  - [x] SubTask M4.4: 超时后返回友好提示"请求超时，请重试"
  - **验证**: 模拟耗时场景，2 分钟后自动终止并提示

- [x] Task M5: 修复 ai-agent.js 图片 URL 内存泄漏（ai-agent.js）
  - [x] SubTask M5.1: 在组件卸载/清除对话时调用 `revokeObjectURL()` 释放所有已创建的 blob URL
  - [x] SubTask M5.2: 维护 `_activeBlobUrls` 数组追踪所有创建的 URL
  - **验证**: 多次上传图片后清除对话，内存中无残留 blob URL

- [x] Task M6: ai-agent.js saveHistory 改为 await（ai-agent.js）
  - [x] SubTask M6.1: 所有 `saveHistory()` 调用从 `void` 改为 `await`
  - [x] SubTask M6.2: 调用链上的函数签名改为 async
  - **验证**: 保存历史操作按调用顺序执行，无竞态

- [x] Task M7: ai-agent.js Electron 路径添加 try/catch（ai-agent.js）
  - [x] SubTask M7.1: `clearConversations()` Electron 路径包裹 try/catch
  - [x] SubTask M7.2: 深度规划 Electron 路径包裹 try/catch
  - [x] SubTask M7.3: 失败时回退到纯前端实现
  - **验证**: Electron 路径故障时自动降级到 web 模式

- [x] Task M8: WordMosaic 补全安全配置（WordMosaic/main.js）
  - [x] SubTask M8.1: 确认/添加 preload 脚本引用（无则创建最小化 preload）
  - [x] SubTask M8.2: 确认 sandbox 兼容性后启用或添加替代防护
  - [x] SubTask M8.3: webview 父页面的 `will-attach-webview` 中限制 `allowpopups` 等权限
  - **验证**: WordMosaic 子应用安全配置评级提升

## 🟢 低优先级修复（L1-L4）

- [x] Task L1: paths.js TOCTOU 竞态修复（paths.js）
  - [x] SubTask L1.1: `ensureAppDataDir` 中 `existsSync` → `mkdirSync` 改为直接用 `mkdirSync({recursive: true})` 包裹 try/catch
  - **验证**: 并发创建同一目录不报错

- [x] Task L2: paths.js 清理函数错误处理（paths.js）
  - [x] SubTask L2.1: L100-101, L131 写操作添加 try/catch + console.warn
  - **验证**: 清理操作失败不阻塞主流程

- [x] Task L3: ai-agent.js 双重历史写入路径修复（ai-agent.js）
  - [x] SubTask L3.1: 梳理普通消息和提案消息的 history 写入逻辑
  - [x] SubTask L3.2: 统一为一个入口函数，避免重复或遗漏
  - **验证**: 消息保存一次后 history 中无重复条目

- [x] Task L4: ai-agent.js 画像生成计数逻辑修复（ai-agent.js）
  - [x] SubTask L4.1: 所有画像生成路径统一使用 `_profileGenFailCount` 递增
  - [x] SubTask L4.2: 确保成功时重置计数，失败时递增
  - **验证**: 连续失败 3 次后第 4 次不再触发生成

# Task Dependencies

- **C1-C6, H1-H2, H4-H5, H7-H9, M1-M3, M5-M8, L1-L4** 可并行执行（无相互依赖，操作不同文件或不同代码区域）
- **C7（Electron 升级）** 必须在其他所有 Task 完成后最后执行——升级可能导致 API 变更，先修复完所有代码问题再升级
- **H3（IPC 校验）** 应与 C2/C3/C5 同一文件区域修改协调（均在 main.js IPC handler 段）
- **C1（CSP）** 和 **H4（innerHTML）** 完成后应联合验证 XSS 防护有效性
- **C4（WordMosaic webSecurity）** 和 **C6（webview 注入）** 完成后联合验证 WordMosaic 功能
- **H1（preload event）** 完成后需更新 `index.html` 和 `ai-agent.js` 中的回调签名