# Checklist

## Task 1: 消除 API Key 日志泄露与 SSL 验证漏洞
- [ ] `testNetworkConnection()` 中不再输出 API Key 前 10 个字符（仅 `configured: true/false, length=N`）
- [ ] 流式/非流式 API 调用错误日志中响应体截断至 ≤200 字符
- [ ] `appSettings.rejectUnauthorized` 不再从 `config.json` 读取
- [ ] 所有 `https.request` 调用统一使用 `rejectUnauthorized: true`
- [ ] `loadSettings()` 中不再有 `config.security?.rejectUnauthorized` 读取逻辑

## Task 2: 添加 CSP 内容安全策略
- [ ] `index.html` `<head>` 中存在 `<meta http-equiv="Content-Security-Policy">` 标签
- [ ] CSP 配置正确：`default-src 'self'`，`connect-src` 包含必要 API 域名
- [ ] 应用所有功能（AI 对话、日程管理、日历渲染、WordMosaic 加载）正常
- [ ] DevTools 中 `eval('alert(1)')` 被 CSP 拒绝

## Task 3: 修复 innerHTML XSS 风险
- [ ] `escapeHtml()` 工具函数存在且正确转义 `<` `>` `&` `"` `'`
- [ ] 纯文本内容 `innerHTML` 已替换为 `textContent`（日期、活动名、任务名等）
- [ ] AI 回复/Markdown 渲染内容经过消毒后再插入 DOM
- [ ] 日程标题含 `<img src=x onerror=alert(1)>` 时渲染不触发 alert
- [ ] AI 回复含 `<script>alert(1)</script>` 时不被执行
- [ ] 编辑表单（createEditForm）中用户数据使用安全 DOM API 构建

## Task 4: 修复 webview API Key 注入漏洞
- [ ] `_injectWordMosaicKeyWebview()` 不再使用 `executeJavaScript` 拼接 API Key 字符串
- [ ] 全局搜索 `executeJavaScript` 中不出现 `${apiKey}` 或 `${key}` 模板字符串
- [ ] WordMosaic 子应用能正常获取 API Key 并调用 AI 服务

## Task 5: 修复路径穿越漏洞
- [ ] `paths.js` 中存在 `sanitizeUsername()` 过滤函数
- [ ] `sanitizeUsername()` 拒绝 `..` `/` `\` 及控制字符
- [ ] `setActiveUser('../../evil')` 返回错误，不创建目录
- [ ] `setActiveUser('正常用户_2024')` 正常创建隔离数据目录

## Task 6: 添加 IPC 参数校验
- [ ] `set-api-key` 拒绝无效 provider 和空 key
- [ ] `set-agent-provider` 拒绝非 'deepseek'/'qwen' 的值
- [ ] `agent-approve` 拒绝无 type 字段的 proposal
- [ ] `save-schedule-data` 拒绝非对象 data
- [ ] `save-agent-history` 拒绝非对象 data

## Task 7: 加固 shell.openExternal 安全性
- [ ] `ALLOWED_EXTERNAL_URLS` 白名单存在
- [ ] `safeOpenExternal()` 函数校验协议为 `https:` + 域名在白名单
- [ ] 正常点击"获取 API Key"可在浏览器打开正确链接
- [ ] `shell.openExternal('javascript:alert(1)')` 被拒绝并记日志

## Task 8: 修复 WordMosaic 子应用安全配置
- [ ] `WordMosaic/main.js` 中 `webSecurity` 为 `true`
- [ ] `WordMosaic/main.js` 中 `contextIsolation` 为 `true`
- [ ] `WordMosaic/main.js` 中 `nodeIntegration` 为 `false`
- [ ] WordMosaic 子应用正常加载且所有功能可用

## Task 9: 添加 AI Agent 工具调用总超时
- [ ] `callDeepseekAPIMessages()` 开头记录开始时间
- [ ] 每轮迭代前检查 120 秒总超时
- [ ] 流式分支和非流式分支均有超时检查
- [ ] 超时后 UI 显示"请求超时，请重试"友好提示

## Task 10: 修复桌面快捷方式 PowerShell 命令注入风险
- [ ] `exePath` 和 `desktop` 路径中单引号已转义
- [ ] PowerShell 命令中路径变量用单引号包裹
- [ ] 含单引号的安装路径能正常创建快捷方式

## Task 11: 升级 Electron 版本
- [ ] `package.json` 中 `electron` 版本 ≥ v33
- [ ] `npm start` 正常启动应用
- [ ] 日程 CRUD 功能正常
- [ ] AI 对话（流式+非流式）正常
- [ ] WordMosaic 子应用正常加载和运行
- [ ] `npm run build` 成功生成便携版 EXE
- [ ] `electron-builder` 版本与新版 Electron 兼容