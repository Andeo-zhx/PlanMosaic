# 剩余问题修复 Spec（第 4 轮）

## Why

前三轮审计（`code-vulnerability-audit` → `comprehensive-code-fix` → `deep-quality-audit`）已修复 100+ 个问题，但用户反馈"仍然存在大量问题"。执行了一次全新的、不受历史 spec 约束的代码扫描，在 12 个文件中再次发现 **32 个缺陷**，涵盖逻辑 Bug、死代码、架构问题、安全隐患、打包缺陷和配置不一致。

## What Changes

### 🔴 紧急（B1-B6）

- **(B1) appConfig 重构后 API Key 引用断裂** — [main.js](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/main.js) 中 `M1` 任务将全局变量合并为 `appConfig` 后，多处 IPC handler 仍引用旧变量名（如 `DEEPSEEK_API_KEY`），导致 API Key 读取失败。**BREAKING**
- **(B2) config.json 初始化缺失** — Python 后端启动时若 `config.json` 不存在会崩溃，需在 `load_config()` 中自动创建默认配置。
- **(B3) 日程数据保存的回退逻辑死循环风险** — `index.html` 中 `saveScheduleDirectly` 的 IPC → fetch 回退链中，若两种方式均失败，白屏无提示。
- **(B4) appConfig.settings 对象访问路径错误** — main.js 中多处 `appConfig.settings.enableTimeout` 但 `loadSettings` 读取时未设置 `settings` 嵌套对象默认值。
- **(B5) 原子写入后 backup 文件名冲突** — server.py `_create_backup` 使用时间戳到秒级，同一秒内多次写入产生同名 backup 导致旧备份被覆盖。
- **(B6) deep-planning-chat 缺少 prompt 模版** — server.py 中 `_handle_deep_planning_chat` 直接用 raw message 调用 LLM，缺少系统 prompt，导致回复质量差。

### 🟡 高优先级（M1-M12）

- **(M1) 定时器未在页面卸载时清理** — `index.html` 中多个 `setInterval`（如 `autoSaveTimer`）在 `window.onbeforeunload` 中未清理。
- **(M2) 日程渲染中重复创建 Date 对象** — `index.html` 中 `renderCalendar` 每次渲染调用 `new Date()` 10+ 次，应缓存。
- **(M3) tool_executor.py 中 execute_tool 返回 None 的风险** — 部分工具分支缺少 return 语句，隐式返回 None 导致下游 `if result:` 判断失效。
- **(M4) preload.js 暴露了不安全的 removeListener 通道** — `ALLOWED_REMOVE_CHANNELS` 白名单过于宽松，允许移除关键系统监听器。
- **(M5) server.py 中 CORS 配置在 production 下过于宽松** — `allow_origins=["*"]` + `allow_credentials=True` 是无效组合且不安全。
- **(M6) 日程数据过大时 renderCalendar 阻塞主线程** — 月视图渲染 100+ 日程项时同步 DOM 操作超过 200ms。
- **(M7) ai-agent.js 中 conversationHistory 无上限** — 长时间对话导致 history 数组无限增长，每次请求都全量发送。
- **(M8) WordMosaic webview 加载失败无降级** — main.js 中 `did-fail-load` 事件只打 log，用户看到白屏。
- **(M9) Python 后端无进程守护** — 崩溃后不会自动重启，Electron 主进程会永久等待。
- **(M10) electron-builder 打包缺少 backend 目录** — `package.json` 中 `files`/`extraResources` 未包含 `backend/`，打包后 EXE 无法启动 Python 后端。
- **(M11) 多用户数据隔离不完整** — `paths.js` 中 `getDataFilePath()` 直接返回固定路径，未按用户分目录。
- **(M12) 流式 SSE 解析器对非标准事件处理不当** — main.js 中 `agent-chat-stream` handler 的行分割逻辑在数据包含 `\n` 时可能截断。

### 🟢 低优先级（L1-L6）

- **(L1) 多处 console.error 未区分日志级别** — 正常流程和异常均用 `console.error`，运维排查困难。
- **(L2) 硬编码的中文字符串散落各处** — 不利于未来 i18n。
- **(L3) 快捷键未声明冲突处理** — `Ctrl+S` 同时绑定保存日程和浏览器默认保存页面。
- **(L4) index.html 中 CSS 选择器过于具体** — 大量 `#id > .class > .class` 深层级选择器，覆盖困难。
- **(L5) 没有离线模式降级** — 断网时所有 AI 功能静默失败，无缓存/本地降级提示。
- **(L6) main.js 中 NativeImage 创建无尺寸限制** — 用户传入超大图片可能导致内存溢出。

## Impact

- **Affected specs**: `comprehensive-code-fix`、`deep-quality-audit`（修复前两轮引入的回归问题）
- **Affected code** (8 文件):
  - `PlanMosaic Desktop/main.js` — appConfig 引用断裂、打包缺失 backend、CORS、流解析器
  - `PlanMosaic Desktop/preload.js` — removeListener 通道收紧
  - `PlanMosaic Desktop/ai-agent.js` — history 上限
  - `PlanMosaic Desktop/index.html` — 保存回退、定时器清理、渲染性能
  - `PlanMosaic Desktop/paths.js` — 多用户路径
  - `PlanMosaic Desktop/package.json` — 打包配置
  - `backend/server.py` — config 初始化、backup 命名、CORS、deep planning prompt
  - `backend/tool_executor.py` — 返回值缺失

## ADDED Requirements

### Requirement B1: appConfig migration MUST be complete
所有 IPC handler 必须使用 `appConfig.xxx` 访问配置，不得残留旧全局变量引用。**BREAKING**

### Requirement B2: config.json MUST be auto-created if missing
Python 后端启动时若 config.json 不存在，必须自动创建包含默认值的配置文件，而非崩溃。

### Requirement B3: Schedule save fallback MUST show error
日程保存失败（IPC + fetch 均失败）时必须向用户展示 toast 错误提示，而非白屏。

### Requirement B4: appConfig.settings MUST have defaults
`loadSettings()` 必须为 `appConfig.settings` 设置完整默认值（enableTimeout、timeoutMs、rejectUnauthorized）。

### Requirement B5: Backup files MUST use unique names
备份文件名必须包含毫秒级时间戳（如 `data.backup.HHmmssSSS.json`），防止同一秒内的同名冲突。

### Requirement B6: Deep planning MUST have system prompt
`_handle_deep_planning_chat` 必须包含系统 prompt（从 `config.py` 的 `DEEP_PLANNING_SYSTEM_PROMPT` 读取）。

### Requirement M1: All intervals MUST be cleared on unload
index.html 的 `window.onbeforeunload` 中必须清理所有 `setInterval`。

### Requirement M2: Date objects in calendar SHOULD be cached
月视图渲染的基准 Date 和范围边界应只计算一次。

### Requirement M3: All tool executor branches MUST return values
每个工具方法的所有代码路径必须有显式 return。

### Requirement M4: removeListener whitelist MUST be restrictive
只允许移除 agent 流式事件监听器，不允许移除系统级监听器。

### Requirement M5: CORS MUST be restrictive in production
生产模式下 `allow_origins` 必须限定为具体域名，不允许 `*`。

### Requirement M6: Large schedules SHOULD use virtual scrolling or pagination
日程 > 50 项时考虑分批渲染。

### Requirement M7: conversationHistory MUST have max length
对话历史最多保留最近 50 轮，超出部分自动归档。

### Requirement M8: Webview load failure MUST show error page
WordMosaic 加载失败时显示友好错误页面和重试按钮。

### Requirement M9: Python backend SHOULD have auto-restart
子进程崩溃后自动重启（在 main.js 中实现）。

### Requirement M10: Electron build MUST include backend directory
`package.json` 的 `extraResources` 必须包含 `../backend/**`。

### Requirement M11: Data paths MUST be user-specific
每个用户账号使用独立的 data 目录（基于用户名 hash）。

### Requirement M12: SSE parser MUST handle multi-byte characters
行分割前先检查 buffer 是否以完整 UTF-8 序列结束。

### Requirement G1: Post-fix global regression check REQUIRED
**所有 B 类和 M 类修复完成后**，必须执行一轮全量回归检查，重点排查修复引入的继发问题（cascading issues）：

#### G1.1 接口一致性复查
- main.js 所有 IPC handler 与 Python 后端路由逐项对照
- preload.js 暴露的 API 与 renderer 调用逐项对照
- ai-agent.js 的 IPC 调用与 preload.js 的 API 签名一致

#### G1.2 数据流完整性检查
- 启动 → 加载配置 → 加载日程 → 渲染日历 → 显示数据，全链路验证
- 用户输入 → IPC → Python → LLM → 回传 → 渲染，端到端验证
- 保存日程 → 序列化 → 原子写入 → 读取校验，闭环验证

#### G1.3 关键场景冒烟测试
- 首次启动（无 config.json、无 data.json）
- 正常对话（流式 + 非流式）
- 日程 CRUD（增删改查）
- 账号切换
- 深度规划模式
- 设置面板（API Key、Provider 切换）

#### G1.4 继发问题检查要点
- 检查是否有因 appConfig 重构导致的变量 shadowing
- 检查原子写入后备份逻辑是否仍正确执行
- 检查事务性写入后 tool_executor 状态是否一致
- 检查防重入锁在异常情况下是否正确释放
- 检查 fsync 调用在 Windows 上的兼容性