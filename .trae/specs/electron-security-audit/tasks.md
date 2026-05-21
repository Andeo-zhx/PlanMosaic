# Tasks

- [ ] Task 1: 消除 API Key 日志泄露与 SSL 验证漏洞（main.js）
  - [ ] SubTask 1.1: 修改 `testNetworkConnection()` 中 API Key 日志输出，改为仅输出 `configured: true/false` + 长度
  - [ ] SubTask 1.2: 修改流式/非流式 API 调用中错误响应体日志，截断敏感内容至最多 200 字符
  - [ ] SubTask 1.3: 移除 `appSettings.rejectUnauthorized` 从 config.json 读取的逻辑，硬编码为 `true`
  - [ ] SubTask 1.4: 将 `loadSettings()` 中 `config.security?.rejectUnauthorized` 读取代码注释掉或移除
  - [ ] SubTask 1.5: 在所有 `https.request` 调用中统一使用 `rejectUnauthorized: true`
  - **验证**: 启动应用，检查终端日志不含 API Key 字符；修改 config.json 中 security.rejectUnauthorized 为 false 后应用仍使用有效 SSL

- [ ] Task 2: 添加 CSP 内容安全策略（index.html）
  - [ ] SubTask 2.1: 在 `index.html` `<head>` 中添加 `<meta http-equiv="Content-Security-Policy">` 标签
  - [ ] SubTask 2.2: 配置 `default-src 'self'`，`script-src` 允许内联脚本（使用 `'unsafe-inline'` 或 hash），`connect-src` 白名单 DeepSeek/Qwen API 域名 + Supabase 域名
  - [ ] SubTask 2.3: 配置 `img-src` 允许 `data:` 和 `https://fonts.gstatic.com`
  - [ ] SubTask 2.4: 配置 `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`，`font-src https://fonts.gstatic.com`
  - **验证**: 启动应用，所有功能正常；通过 DevTools console 注入 `eval('alert(1)')` 被拒绝

- [ ] Task 3: 修复 innerHTML XSS 风险（index.html）
  - [ ] SubTask 3.1: 创建 `escapeHtml(str)` 工具函数，转义 `<` `>` `&` `"` `'`
  - [ ] SubTask 3.2: 将 **纯文本内容** 的 `innerHTML` 赋值（如日期文本、活动名称、任务名称等）全部替换为 `textContent`
  - [ ] SubTask 3.3: 将 **Markdown/AI 回复** 的 `innerHTML` 赋值替换为：先通过 Markdown 渲染器生成 HTML，再用 DOMPurify 或自定义消毒函数过滤危险标签/属性
  - [ ] SubTask 3.4: 将 **编辑表单（createEditForm）** 中用户数据拼接改为安全 DOM API（createElement + textContent）
  - **验证**: 在日程标题中输入 `<img src=x onerror=alert(1)>`，保存后在界面渲染不触发 alert；AI 回复含 `<script>` 标签不被执行

- [ ] Task 4: 修复 webview API Key 注入漏洞（index.html）
  - [ ] SubTask 4.1: 在 `main.js` 中新增 IPC handler `get-wordmosaic-api-key`，返回脱敏或完整的 API Key（通过 IPC 安全传递）
  - [ ] SubTask 4.2: 修改 `_injectWordMosaicKeyWebview()` 函数：不再使用 `executeJavaScript` 直接拼接 Key 字符串
  - [ ] SubTask 4.3: 改用 `webview.send('set-api-key', { key })` 方式传递，WordMosaic 内部通过 `ipcRenderer.on` 接收
  - [ ] SubTask 4.4: 如果 WordMosaic 不支持 IPC 接收，则在 `main.js` 进程内通过 `webview.executeJavaScript` 仅传递加密后的 Key 到 sessionStorage，WordMosaic 通过预定义的解密函数获取
  - **验证**: 搜索 `index.html` 中不再出现 `${apiKey}` 或 `${key}` 拼入 `executeJavaScript` 字符串的模式

- [ ] Task 5: 修复路径穿越漏洞（paths.js + main.js）
  - [ ] SubTask 5.1: 在 `paths.js` 中添加 `sanitizeUsername(username)` 函数，过滤 `..` `/` `\` 及控制字符，仅允许 `[\w\u4e00-\u9fff\-_]+`
  - [ ] SubTask 5.2: 在 `setActiveUsername()` 函数中调用 `sanitizeUsername()`，对无效输入抛出或返回 false
  - [ ] SubTask 5.3: 在 `main.js` 的 `set-active-user` IPC handler 中校验返回值，拒绝无效用户名
  - **验证**: 测试 `setActiveUser('../../evil')` 被拒绝；`setActiveUser('正常用户_2024')` 正常创建目录

- [ ] Task 6: 添加 IPC 参数校验（main.js）
  - [ ] SubTask 6.1: 为 `set-api-key` 添加 provider 校验（仅允许 'deepseek' | 'qwen'）和 key 格式校验（非空、长度 ≥ 20）
  - [ ] SubTask 6.2: 为 `set-agent-provider` 添加 provider 校验
  - [ ] SubTask 6.3: 为 `agent-approve` 添加 proposal 对象基本结构校验（必须有 type 字段）
  - [ ] SubTask 6.4: 为 `save-schedule-data` 添加 data 对象基本结构校验
  - [ ] SubTask 6.5: 为 `save-agent-history` 添加 data 对象基本结构校验
  - **验证**: 调用 `setApiKey('invalid', '')` 返回错误；正常调用不受影响

- [ ] Task 7: 加固 shell.openExternal 安全性（main.js）
  - [ ] SubTask 7.1: 创建 `ALLOWED_EXTERNAL_URLS` 白名单（仅允许 `https://platform.deepseek.com` 和 `https://dashscope.console.aliyun.com`）
  - [ ] SubTask 7.2: 在 `open-api-key-url` handler 中校验 URL 在白名单内
  - [ ] SubTask 7.3: 创建通用 `safeOpenExternal(url)` 函数，校验协议为 `https:` 后才调用 `shell.openExternal`
  - **验证**: 正常点击"获取 API Key"可打开浏览器；尝试通过 IPC 打开 `javascript:alert(1)` 被拒绝

- [ ] Task 8: 修复 WordMosaic 子应用安全配置（WordMosaic/main.js）
  - [ ] SubTask 8.1: 将 `webSecurity: false` 改为 `webSecurity: true`
  - [ ] SubTask 8.2: 添加 `contextIsolation: true` 和 `nodeIntegration: false`（如果缺失）
  - [ ] SubTask 8.3: 添加 preload 脚本（如需要跨域资源，通过 preload 暴露安全 API）
  - **验证**: WordMosaic 子应用正常加载且功能可用

- [ ] Task 9: 添加 AI Agent 工具调用总超时（main.js）
  - [ ] SubTask 9.1: 在 `callDeepseekAPIMessages()` 函数开头记录开始时间 `const startTime = Date.now()`
  - [ ] SubTask 9.2: 在每轮迭代前检查 `Date.now() - startTime > 120000`，超时则抛出错误并返回友好提示
  - [ ] SubTask 9.3: 在流式和非流式两个分支中均添加超时检查
  - **验证**: 模拟异常循环场景（可通过临时降低超时为 5 秒测试），确认超时后 UI 显示"请求超时，请重试"

- [ ] Task 10: 修复桌面快捷方式 PowerShell 命令注入风险（main.js）
  - [ ] SubTask 10.1: 对 `exePath` 和 `desktop` 路径中的单引号进行转义（`'` → `''`）
  - [ ] SubTask 10.2: 将 PowerShell 命令中的路径变量用单引号包裹（`'${escapedPath}'`）
  - [ ] SubTask 10.3: 添加路径合法性检查（路径中无不安全字符如 `;` `|` `&`）
  - **验证**: 模拟含单引号的安装路径，快捷方式正常创建

- [ ] Task 11: 升级 Electron 版本（package.json）
  - [ ] SubTask 11.1: 修改 `package.json` 中 `electron` 版本至最新 LTS（当前 v33.4.x）
  - [ ] SubTask 11.2: 执行 `npm install` 安装新版 Electron
  - [ ] SubTask 11.3: 测试 `npm start` 启动应用，逐一验证所有 IPC 调用正常
  - [ ] SubTask 11.4: 测试 `npm run build` 构建便携版 EXE 成功
  - [ ] SubTask 11.5: 更新 `electron-builder` 至兼容版本
  - **验证**: `npm start` 正常启动，日程 CRUD、AI 对话、WordMosaic 均正常；`npm run build` 成功生成 EXE

# Task Dependencies

- Task 1 ~ Task 8 可并行执行（无相互依赖）
- Task 9 依赖 Task 6（共用一个文件修改区域）
- Task 11（Electron 升级）应在其他所有任务完成后执行，因为升级可能导致 API 变更
- Task 2（CSP）和 Task 3（innerHTML）完成后应联合验证 XSS 防护有效性
- Task 4（webview）和 Task 8（WordMosaic webSecurity）完成后应联合验证 WordMosaic 功能