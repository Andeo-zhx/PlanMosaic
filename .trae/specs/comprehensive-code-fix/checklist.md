# Checklist

## Task C1: 添加 CSP 内容安全策略
- [x] `index.html` `<head>` 中存在 `<meta http-equiv="Content-Security-Policy">` 标签
- [x] CSP `default-src` 设为 `'self'`
- [x] CSP `script-src` 包含 `'self' 'unsafe-inline'`
- [x] CSP `connect-src` 白名单包含 `https://api.deepseek.com` `https://dashscope.aliyuncs.com` 和 Supabase 域名
- [x] CSP `img-src` 允许 `data:` 和 `https://fonts.gstatic.com`
- [x] CSP `style-src` 允许 `https://fonts.googleapis.com`
- [x] CSP `font-src` 允许 `https://fonts.gstatic.com`
- [x] DevTools 中 `eval('alert(1)')` 被 CSP 拒绝并显示错误
- [x] AI 对话（流式+非流式）功能正常
- [x] 日程管理 CRUD 功能正常
- [x] 日历渲染正常
- [x] WordMosaic 子应用加载正常

## Task C2: 消除 API Key 日志泄露
- [x] `main.js` 中不再出现 `DEEPSEEK_API_KEY.substring(0,10)` 或类似 Key 部分输出
- [x] `testNetworkConnection()` 日志仅输出 Key 配置状态：`configured: true/false, length=N`
- [x] 全局搜索 `console.(log|error)` 不再出现 API Key 变量直接输出
- [x] 终端启动日志中无任何 API Key 字符泄露

## Task C3: 锁定 SSL 验证不可配置
- [x] `main.js` 中不再有 `config.security?.rejectUnauthorized` 读取逻辑
- [x] `loadSettings()` 中不再设置 `appSettings.rejectUnauthorized`
- [x] 所有 5 处 `https.request` 调用统一硬编码 `rejectUnauthorized: true`
- [x] 修改 `config.json` 中 `security.rejectUnauthorized: false` 后，应用仍正常进行 HTTPS 请求
- [x] AI API 调用（DeepSeek/Qwen）HTTPS 连接正常

## Task C4: 修复 WordMosaic webSecurity
- [x] `WordMosaic/main.js` 中 `webSecurity` 为 `true`（非 `false`）
- [x] `WordMosaic/main.js` 中 `contextIsolation` 为 `true`
- [x] `WordMosaic/main.js` 中 `nodeIntegration` 为 `false`
- [x] `sandbox: true` 已启用
- [x] WordMosaic 子应用在父应用 webview 中正常加载
- [x] WordMosaic 子应用所有功能可用

## Task C5: 修复路径穿越漏洞
- [x] `paths.js` 中存在 `sanitizeUsername()` 函数
- [x] `sanitizeUsername()` 使用正则过滤，拒绝 `..` `/` `\` 及控制字符
- [x] `setActiveUsername()` 调用 `sanitizeUsername()`，非法输入返回 `null`
- [x] `getAppDataDir()` 中有 `path.resolve()` + `startsWith(rootDir)` 纵深防御
- [x] `setActiveUser('../../evil')` 被拒绝，不创建目录
- [x] `setActiveUser('正常用户_2024')` 正常创建隔离数据目录
- [x] `setActiveUser('test/escape')` 被拒绝

## Task C6: 移除 webview API Key 注入
- [x] `index.html` 中 `_injectWordMosaicKeyWebview()` 不再使用 `executeJavaScript` 拼接 `${apiKey}` 模板字符串
- [x] 全局搜索 `executeJavaScript` 中不再出现 `${apiKey}` 或 `${key}` 拼接
- [x] `main.js` 中存在 `get-wordmosaic-api-key` IPC handler
- [x] 渲染进程通过 `window.electronAPI` 安全获取 Key
- [x] WordMosaic 子应用能正常获取 API Key 并调用 AI 服务

## Task C7: 升级 Electron 到 LTS 版本
- [x] `package.json` 中 `electron` 版本 ≥ `33.0.0`（实际 v33.4.11）
- [x] `electron-builder` 版本与新版 Electron 兼容（^24.13.3）
- [x] `npm start` 正常启动应用
- [x] 日程 CRUD 功能正常
- [x] AI 对话（流式+非流式）正常
- [x] WordMosaic 子应用正常加载和运行
- [ ] `npm run build` 成功生成便携版 EXE（需在本地构建环境测试）

## Task H1: 修复 preload.js event 对象泄露
- [x] `onAgentStreamChunk` 回调签名改为 `callback(chunk)`（移除 `event` 参数）
- [x] `onAgentStreamStatus` 回调签名改为 `callback(status)`（移除 `event` 参数）
- [x] `index.html` 中所有 stream chunk listener 回调签名已同步更新
- [x] `ai-agent.js` 中所有 stream status listener 回调签名已同步更新
- [x] 流式对话功能正常（chunk 和 status 事件均正常触发）

## Task H2: preload.js removeListener 白名单
- [x] `preload.js` 中存在 `ALLOWED_REMOVE_CHANNELS` 常量
- [x] `removeListener` handler 校验 `channel` 在白名单内
- [x] 尝试移除非法 channel（如 `get-schedule-data`）被忽略/拒绝
- [x] 正常流式 channel 可正常移除监听器

## Task H3: IPC 参数校验
- [x] `set-api-key` 拒绝空 key（长度 <20）
- [x] `set-api-key` 拒绝无效 provider（非 `deepseek`/`qwen`）
- [x] `set-agent-provider` 拒绝无效 provider
- [x] `agent-approve` 拒绝无 `type` 字段的 proposal
- [x] `save-schedule-data` 拒绝非对象 `data`
- [x] `save-agent-history` 拒绝非对象 `data`
- [x] `set-active-user` 拒绝空字符串 username
- [x] 非法参数返回 `{success: false, error: '...'}` 结构化错误

## Task H4: 消毒所有 innerHTML 赋值
- [x] `index.html` 中存在 `escapeHtml()` 工具函数
- [x] `escapeHtml()` 正确转义 `&` `<` `>` `"` `'`
- [x] 纯文本内容使用 `textContent` 赋值（日期、活动名、任务名）
- [x] AI Markdown 回复渲染后经消毒再插入 DOM
- [x] 编辑表单用户输入使用 `createElement` + `textContent` 构建
- [x] 日程标题含 `<img src=x onerror=alert(1)>` 不触发 alert
- [x] AI 回复含 `<script>alert(1)</script>` 不被执行

## Task H5: shell.openExternal 协议白名单
- [x] `main.js` 中存在 `ALLOWED_EXTERNAL_URLS` 常量
- [x] `main.js` 中存在 `safeOpenExternal(url)` 函数
- [x] `safeOpenExternal` 校验 `new URL(url).protocol === 'https:'`
- [x] `safeOpenExternal` 校验 URL 域名在白名单内
- [x] `open-api-key-url` handler 使用 `safeOpenExternal`
- [x] 正常 DeepSeek/Qwen API Key 获取链接可打开浏览器
- [x] `javascript:alert(1)` 被拒绝并记日志
- [x] `file:///C:/windows/system.ini` 被拒绝并记日志

## Task H6: 截断错误响应体日志
- [x] `main.js:465` 附近 `console.error('Response Body:', body)` 截断至 200 字符
- [x] `main.js:L2022` 附近类似日志截断至 200 字符
- [x] 全局搜索，所有 API 响应体日志均截断
- [x] 触发 API 错误时日志不打印完整响应体

## Task H7: webview 安全加固
- [x] `main.js` 中 webview 相关配置存在安全约束
- [x] `will-attach-webview` 事件处理器限制了 webview 权限
- [x] webview 加载前校验 URL 为本应用本地文件
- [x] 尝试通过 webview 加载外部恶意 URL 被拦截

## Task H8: 日程数据存储基础加固
- [ ] 数据写入关键路径有注释标记"明文存储"（低优先级，未来迭代）
- [x] API Key 不完整暴露给渲染进程（仅主进程持有）
- [x] 渲染进程通过 IPC 获取脱敏 Key 信息（`configured: true/false`）

## Task H9: 修复 PowerShell 命令注入
- [x] `createDesktopShortcut` 中 `exePath` 单引号已转义
- [x] `createDesktopShortcut` 中 `desktop` 路径单引号已转义
- [x] PowerShell 命令中路径变量用单引号包裹
- [x] 路径含不安全字符（`;` `|` `&` `$` `` ` ``）时被拒绝或安全处理
- [x] 含特殊字符的安装路径能正常创建快捷方式

## Task M1: preload.js getApiKeys 风险控制
- [x] `getApiKeys` 返回 `{provider, configured: true/false}` 而非完整 key
- [x] 渲染进程无法通过 `window.electronAPI.getApiKeys()` 获取完整 key 字符串
- [x] 设置页面仍能正确显示 API Key 配置状态

## Task M2: paths.js 关键函数 try/catch
- [x] `ensureAppDataDir()` 包裹 try/catch
- [x] `getBackupDir()` 包裹 try/catch
- [x] 失败时函数返回 `false` 而非抛出异常
- [x] 失败时 UI 显示 toast 提示而非崩溃

## Task M3: paths.js 纵深防御
- [x] `getAppDataDir()` 在 `path.join` 后有 `path.resolve`
- [x] 解析后路径经 `startsWith(rootDir)` 验证
- [x] 路径验证失败时返回错误而非继续

## Task M4: AI Agent 总超时
- [x] `callDeepseekAPIMessages()` 开头有 `startTime` 记录
- [x] 每轮迭代前有 120 秒超时检查
- [x] 流式分支有超时检查
- [x] 非流式分支有超时检查
- [x] 超时后 UI 显示"请求超时，请重试"

## Task M5: ai-agent.js 图片 URL 内存泄漏
- [x] 存在 `_activeBlobUrls` 数组追踪 blob URL
- [x] 组件卸载时调用 `revokeObjectURL()` 释放所有 blob URL
- [x] 清除对话时调用 `revokeObjectURL()` 释放
- [x] 多次上传/清除后内存中无残留 blob URL

## Task M6: ai-agent.js saveHistory await
- [x] 所有 `saveHistory()` 调用使用 `await`
- [x] 调用链上的函数签名改为 `async`
- [x] 保存操作按调用顺序执行

## Task M7: ai-agent.js Electron 路径 try/catch
- [x] `clearConversations()` Electron 路径有 try/catch
- [x] 深度规划 Electron 路径有 try/catch
- [x] 失败时回退到纯前端实现
- [x] Web 模式功能不受影响

## Task M8: WordMosaic 补全安全配置
- [x] WordMosaic 有 preload 脚本引用或最小化 preload
- [x] `sandbox: true` 已启用
- [x] webview `will-attach-webview` 限制了 `allowpopups` 等权限

## Task L1: paths.js TOCTOU 竞态修复
- [x] `ensureAppDataDir` 改用 `mkdirSync({recursive: true})` + try/catch
- [x] 无 `existsSync` → `mkdirSync` 竞态窗口

## Task L2: paths.js 清理函数错误处理
- [x] L100-101 写操作有 try/catch
- [x] L131 写操作有 try/catch
- [x] 失败时有 `console.warn` 记录

## Task L3: ai-agent.js 双重历史写入
- [x] 普通消息和提案消息共用统一写入入口
- [x] 同一消息不会在 history 中出现两次

## Task L4: ai-agent.js 画像生成计数
- [x] 所有画像生成路径统一使用 `_profileGenFailCount`
- [x] 成功时重置计数，失败时递增
- [x] 连续失败 3 次后不再触发生成