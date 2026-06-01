# 场景驱动全枚举使用审计 V2 Spec

## Why

V1 审计（`scenario-driven-usage-audit`）覆盖了 15 大功能域 ~120 个场景，修复了 35 个任务（58/60 检查点通过）。但 V1 侧重**功能正确性**视角，对以下维度覆盖不足：
- **跨功能交互**：AI ↔ 日程 ↔ 深度规划 ↔ 本地存储之间的数据流一致性
- **UI 交互模式**：键盘导航、焦点管理、事件监听器生命周期
- **性能与内存**：DOM 操作效率、流式渲染 O(n²) 问题、内存泄漏
- **错误恢复**：磁盘满、localStorage 溢出、时区边界、休眠中断

V2 重新枚举所有场景，从这四个新增维度挖掘 V1 遗漏的问题。

## What Changes

本 Spec 按 6 大审计维度枚举 ~80 个新发现的使用场景和潜在问题，标注严重程度和影响范围。

---

## 维度 A：跨功能交互与数据流一致性

### A.1：AI 修改数据 → 本地存储同步断裂

#### 场景 A.1.1：AI 通过提案添加日程后关闭应用
- **WHEN** 用户确认 AI 提案添加日程 → `approveProposal()` → `refreshScheduleData()` → 关闭应用
- **潜在问题**:
  - **P-A1a (🔴 紧急)**: `refreshScheduleData()` [ai-agent.js:L1127](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/ai-agent.js#L1127) 仅更新内存中的 `window.scheduleData`，**不更新 `localStorage`**。下次启动时 `loadDataAndSync()` 优先从 localStorage 加载 → AI 的所有修改丢失
  - **P-A1b (🔴 紧急)**: `collectAll()` [index.html:L8178-L8180](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html#L8178-L8180) 将明文 API Key 混入数据体并上传到 Supabase 云端 → **安全漏洞**

#### 场景 A.1.2：AI 操作与手动编辑并发
- **WHEN** 用户正在手动编辑大任务（`saveBigTasks()` 持有 `_isSaving`），同时 AI 流式响应完成触发 `refreshScheduleData()`
- **潜在问题**:
  - **P-A1c (🔴 紧急)**: 三套独立并发锁（`_isSaving`、`_isApproving`、`_isSending`）之间无协调 → `refreshScheduleData()` 无条件整体替换 `window.scheduleData`，可能覆盖用户未写入磁盘的修改

#### 场景 A.1.3：多路径写同一文件
- **WHEN** Python 后端工具执行写入 + Electron 主进程本地 fallback 写入同时发生
- **潜在问题**:
  - **P-A1d (🟡 高)**: 三条写入路径（Python `os.replace` 原子写入 / Electron `pythonApi` 经后端 / Electron `writeFileSync` 本地直达）操作同一 `data.json`，无跨进程文件锁 → 写入竞争

### A.2：深度规划面板函数覆盖

#### 场景 A.2.1：深度规划完整功能被覆盖
- **WHEN** `index.html` 内联脚本中的同名函数覆盖 `ai-agent.js` 中的完整实现
- **潜在问题**:
  - **P-A2a (🔴 紧急)**: `index.html:L7682` 的 `openDeepPlanningModal()` 覆盖了 `ai-agent.js:L1331` 的 `window.openDeepPlanningModal` → 会话历史加载、localStorage 持久化、用户画像更新全部失效
  - **P-A2b (🔴 紧急)**: `index.html:L7698` 的 `sendDeepPlanningMessage()` 是占位实现（仅显示假消息）→ 深度规划 AI 功能完全不可用

### A.3：SSE 流式通信竞态

#### 场景 A.3.1：快速连发消息时 SSE 监听器竞态
- **WHEN** 用户快速连发两条消息（第一条 SSE 流还在进行中）
- **潜在问题**:
  - **P-A3a (🟡 高)**: `sendAgentMessage()` 中 `removeAllAgentListeners()` 移除前一条消息的监听器 → 前一条的 `doneHandler` 永远不会触发 → `conversationHistory` 丢失一条记录
  - **P-A3b (🟡 高)**: `shouldRefresh` 信号通过 SSE `result` 事件传递 → 如果 SSE 在 `result` 和 `[DONE]` 之间断开 → `shouldRefresh` 丢失 → AI 工具修改了数据但前端不刷新

### A.4：data.json 多点加载不一致

#### 场景 A.4.1：同一数据文件被多处独立加载
- **WHEN** `loadData()`、`refreshScheduleData()`、`DataManager.loadFromFile()` 各自用 `fetch('data.json?' + Date.now())` 加载
- **潜在问题**:
  - **P-A4a (🟡 中)**: 三处独立加载点，各自维护缓存破坏策略 → 可能读到不同版本的数据

### A.5：WordMosaic 单向通信与安全

#### 场景 A.5.1：Web 模式下 API Key 通过 postMessage 传递
- **WHEN** Web 模式下 PlanMosaic 向 WordMosaic iframe 传递 API Key
- **潜在问题**:
  - **P-A5a (🟡 中)**: `postMessage` 使用 `'*'` 目标源 [index.html:L7668](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html#L7668) → 任何页面可接收含 API Key 的消息
  - **P-A5b (🟡 中)**: Electron 模式下从 localStorage 读取的 key 可能是被 mask 过的 → 传给 WordMosaic 的是无效 key

---

## 维度 B：UI 交互模式与可访问性

### B.1：键盘导航

#### 场景 B.1.1：Escape 键多处理器冲突
- **WHEN** 用户按 Escape 键
- **潜在问题**:
  - **P-B1a (🟡 高)**: `ai-agent.js:L77` 和 `index.html` 中分别注册了全局 `keydown` 监听器处理 Escape → 但 `index.html` 中的深层 ESC handler [index.html:L10111](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html#L10111) 会同时关闭**所有**模态框 → 无法精确控制只关闭最顶层模态框
  - **P-B1b (🟡 中)**: 全局 Escape 监听器使用匿名箭头函数 → 永远无法被 `removeEventListener` 移除

#### 场景 B.1.2：模态框焦点陷阱缺失
- **WHEN** 用户打开 AI 面板/设置面板/日程编辑器等模态框后按 Tab 键
- **潜在问题**:
  - **P-B1c (🟡 中)**: 无焦点陷阱（focus trap）→ Tab 键可能将焦点移出模态框到背景元素 → 用户困惑
  - **P-B1d (🟡 中)**: 模态框关闭后焦点不返回触发元素 → 键盘导航流断裂

#### 场景 B.1.3：键盘快捷键冲突
- **WHEN** 用户使用 Ctrl+S 等快捷键
- **潜在问题**:
  - **P-B1e (🟢 低)**: Ctrl+S [index.html:L10120](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html#L10120) 保存操作在输入框聚焦时也可能触发 → 与浏览器原生行为冲突

### B.2：滚动行为

#### 场景 B.2.1：innerHTML 重赋值后滚动位置丢失
- **WHEN** AI 流式回复更新 `contentDiv.innerHTML` 后，用户尝试滚动查看历史消息
- **潜在问题**:
  - **P-B2a (🟡 中)**: 每次流式 chunk 都重新设置整个容器的 innerHTML → 若用户在流式过程中手动滚动，位置会被强制跳回底部
  - **P-B2b (🟡 中)**: `sanitizeHtml` 在每次流式 chunk 中对**全部累积内容**执行 32 次正则替换 → O(n²) 复杂度

### B.3：拖拽交互

#### 场景 B.3.1：深度规划面板拖拽
- **WHEN** 用户拖拽深度规划面板
- **潜在问题**:
  - **P-B3a (🟡 高)**: `initDeepPlanningDrag()` 在 `document` 上注册 `mousemove`/`mouseup` 监听器 → **永不清理** → 每次鼠标移动都触发回调 + 若多次初始化则监听器叠加
  - **P-B3b (🟡 中)**: Agent 面板拖拽（`startDrag`/`stopDrag`）正确成对清理 → 与深度规划面板不一致

### B.4：ResizeObserver 泄漏

#### 场景 B.4.1：Agent 面板 ResizeObserver 未释放
- **WHEN** AI 面板关闭后
- **潜在问题**:
  - **P-B4a (🟡 中)**: `ResizeObserver` [index.html:L7982](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/index.html#L7982) 观察 `agentContent` 元素 → 面板关闭后未调用 `disconnect()` → 持续运行

---

## 维度 C：性能与内存

### C.1：DOM 操作效率

#### 场景 C.1.1：逐字打字动画触发强制回流
- **WHEN** AI 使用打字动画渲染回复（速度 12-15ms/字符）
- **潜在问题**:
  - **P-C1a (🟡 高)**: 每个字符执行 `textContent +=` + 两次 `getElementById` + `scrollTop = scrollHeight` → 1000 字符消息产生 ~3000 次 DOM 操作 → 大量强制布局重算（forced layout）
  - **P-C1b (🟡 中)**: 打字函数中 `container` 引用未缓存 → 每次字符都重复 `getElementById`

#### 场景 C.1.2：sanitizeHtml O(n²) 流式处理
- **WHEN** SSE 流每 50-200ms 推送一个 chunk
- **潜在问题**:
  - **P-C2a (🟡 高)**: 每个 chunk 对**全部累积内容**重新执行完整 `sanitizeHtml`（escapeHtml + 32 次正则）→ n 个 chunk 平均处理 n/2 长度的内容 → O(n²) 复杂度 → 长回复的流式渲染越来越卡

#### 场景 C.1.3：日历渲染中的闭包创建
- **WHEN** 每次 `renderCalendar()` 调用
- **潜在问题**:
  - **P-C3a (🟢 低)**: 每个 day cell 通过 IIFE 创建独立 onclick 闭包 → 月视图 42 个新函数对象 → 可使用事件委托优化

### C.2：内存泄漏

#### 场景 C.2.1：归档对话无限增长
- **WHEN** 用户持续使用超过数月
- **潜在问题**:
  - **P-C4a (🔴 紧急)**: `archivedConversations` [ai-agent.js:L430-L435](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/ai-agent.js#L430-L435) 无上限增长 → 每 100 条归档 50 条 → 数月后数千条 → 每次 `saveHistory()` 全量序列化 → IPC 消息膨胀 + 磁盘写入线性增长

#### 场景 C.2.2：图像压缩后 Canvas 未清理
- **WHEN** 用户上传图片后
- **潜在问题**:
  - **P-C4b (🟡 中)**: Canvas 压缩完成后未显式释放 → `canvas.toDataURL` 后内部持有 2048×2048×4 = 16MB 像素缓冲区 → 连续上传时 GC 未及时回收导致内存峰值 100-200MB

#### 场景 C.2.3：localStorage 配额超限
- **WHEN** 深度规划 sessions 累积或日程数据量大
- **潜在问题**:
  - **P-C4c (🟡 高)**: `saveDeepPlanningData()` 的 `catch` 仅 `console.error` → 无 `QuotaExceededError` 专门处理 → 数据静默丢失
  - **P-C4d (🟡 中)**: `collectAll()` 的 `JSON.parse(JSON.stringify(...))` 对大日期范围数据做深拷贝开销大 + 可能超 localStorage 5-10MB 限制

---

## 维度 D：错误恢复与边界条件

### D.1：存储空间耗尽

#### 场景 D.1.1：磁盘满时写入
- **WHEN** 系统磁盘空间不足
- **潜在问题**:
  - **P-D1a (🟡 高)**: `main.js` 的 `writeScheduleData()` 无 try-catch → ENOSPC 抛未捕获异常 → 可能崩溃渲染进程
  - **P-D1b (🟡 高)**: `server.py` 的 `_write_schedule_data()` 写入失败后内存中的 `schedule_data` 已修改但未持久化 → "已执行但丢失"

### D.2：配置值校验

#### 场景 D.2.1：config.json 包含无效值
- **WHEN** 用户手动编辑或数据损坏导致配置异常
- **潜在问题**:
  - **P-D2a (🟡 高)**: `timeoutMs` 无范围校验 → 负数/零值 → `http.request.setTimeout(负数)` 行为未定义
  - **P-D2b (🟡 高)**: `provider` 无枚举校验 → "openai"/"grok" 等无效值静默生效 → `setCurrentProvider()` 只接受 "deepseek"/"qwen" → 状态不一致
  - **P-D2c (🟡 高)**: `model` 名无白名单校验 → 不存在的模型名 → 所有 API 调用失败

### D.3：API 异常处理

#### 场景 D.3.1：AI 返回畸形 tool call 参数
- **WHEN** AI 模型返回格式错误的函数调用
- **潜在问题**:
  - **P-D3a (🟡 高)**: `arguments` 非合法 JSON → [tool_executor.py:L226-L230](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/tool_executor.py#L226-L230) 静默降级为 `args = {}` → 工具以空参数执行 → 掩盖错误
  - **P-D3b (🟡 中)**: `estimated_minutes` 等字段无类型校验 → AI 返回字符串 "很多" 也静默接受

#### 场景 D.3.2：HTTP 429 限流
- **WHEN** API 提供商返回速率限制
- **潜在问题**:
  - **P-D3c (🟡 高)**: 重试延迟为线性 `retry_delay * (retry_count + 1)` = 1s→2s→3s → 非指数退避 → 可能触发连续 429
  - **P-D3d (🟡 中)**: 不读取 `Retry-After` 响应头 → 忽略服务器指定的等待时间
  - **P-D3e (🟡 中)**: 无随机抖动（jitter）→ 多并发请求失败时同时重试 → 惊群效应

#### 场景 D.3.3：SSE 非 JSON 响应
- **WHEN** API 返回 HTML 错误页或畸形数据
- **潜在问题**:
  - **P-D3f (🟡 中)**: [main.js:L799-L814](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/main.js#L799-L814) 使用空 `catch (e) {}` → JSON 解析失败时所有事件静默丢弃 → 用户看到"卡住"

### D.4：时区与时间

#### 场景 D.4.1：跨时区使用
- **WHEN** 用户在 UTC-5（纽约）使用时区硬编码为 UTC+8 的应用
- **潜在问题**:
  - **P-D4a (🔴 紧急)**: [server.py:L327-L329](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/server.py#L327-L329) 硬编码 `timezone(timedelta(hours=8))` → "今天"始终是北京时间 → 用户旅行时日程日期全部错位
  - **P-D4b (🟡 高)**: [ai-agent.js:L149-L151](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/ai-agent.js#L149-L151) 手动偏移计算 UTC+8 → 问候语判断在非 UTC+8 时区错误
  - **P-D4c (🟡 中)**: 对话时间戳使用 UTC（`toISOString()`）但 system prompt 告诉 AI 北京时间 → 日期理解偏差 8 小时

#### 场景 D.4.2：损坏日期字符串
- **WHEN** 数据文件中存在 `"2024-13-01"` 或空字符串等损坏日期
- **潜在问题**:
  - **P-D4d (🟡 中)**: [tool_executor.py:L1445](file:///d:/Trae%20CN/Projects/PlanMosaic/backend/tool_executor.py#L1445) `datetime.strptime` 无 try-catch → `ValueError` 传播到工具调用层 → 整个操作失败

### D.5：系统事件

#### 场景 D.5.1：计算机休眠中断 AI 流
- **WHEN** 用户在 AI 流式回复期间合上笔记本
- **潜在问题**:
  - **P-D5a (🟡 高)**: heartbeat 使用 `Date.now()` → 休眠 1 小时后唤醒 → `Date.now()` 跳跃 1 小时 → 立即触发 heartbeat 超时 → 显示 "Heartbeat timeout" 错误
  - **P-D5b (🟡 中)**: `saveHistory()` 锁无超时 → 如果某次保存因网络挂起 → 之后所有保存永久阻塞（Promise 链永不 resolve）

#### 场景 D.5.2：多实例启动
- **WHEN** 用户双击打开多个应用实例
- **潜在问题**:
  - **P-D5c (🟡 高)**: 无 `app.requestSingleInstanceLock()` → 多实例同时启动 Python 后端 → 端口 8080 冲突
  - **P-D5d (🟡 中)**: 多窗口 `BrowserWindow.getAllWindows()[0]` 仅通知第一个窗口 → 其他窗口无 Python 状态感知

### D.6：响应大小无界

#### 场景 D.6.1：AI 生成超大响应
- **WHEN** AI 模型异常生成超长输出
- **潜在问题**:
  - **P-D6a (🟡 中)**: `accumulated["content"]` 通过 `+=` 无限累积 → 无最大长度限制 → 可能导致内存膨胀

---

## 维度 E：安全加固

### E.1：API Key 泄露路径

#### 场景 E.1.1：API Key 被写入数据体
- **WHEN** 系统自动保存或同步数据
- **潜在问题**:
  - **P-E1a (🔴 紧急)**: `collectAll()` 将明文 API Key 混入数据体 → 上传到 Supabase → 云端泄露

### E.2：postMessage 安全

#### 场景 E.2.1：Web 模式 iframe 通信
- **WHEN** PlanMosaic 向 WordMosaic 发送消息
- **潜在问题**:
  - **P-E2a (🟡 中)**: `postMessage` 使用 `'*'` 目标源 → 任何页面可接收含 API Key 的消息

---

## 维度 F：代码架构一致性

### F.1：重复函数定义

#### 场景 F.1.1：index.html 覆盖 ai-agent.js 的函数
- **WHEN** 脚本加载顺序导致后者覆盖前者
- **潜在问题**:
  - **P-F1a (🔴 紧急)**: `openDeepPlanningModal`、`closeDeepPlanningModal`、`sendDeepPlanningMessage` 在 index.html 中有精简/占位版本覆盖 ai-agent.js 完整版本
  - **P-F1b (🟡 中)**: 备份清理逻辑在 Electron（`cleanOldBackups`）和 Python（`_clean_old_backups`）中各自实现 → 文件名前缀不同 → 可能无法正确识别对方创建的备份

### F.2：读/写路径不对称

#### 场景 F.2.1：读取与写入走不同代码路径
- **WHEN** Python 崩溃后使用本地 fallback
- **潜在问题**:
  - **P-F2a (🟡 中)**: `get-schedule-data` IPC 走 Python → 失败返回空对象；`get-schedule-data-local` IPC 直接读文件 → 返回实际内容 → 同一错误场景下行为不一致

---

## Impact

- **Affected specs**: `scenario-driven-usage-audit`（V1，本 V2 覆盖其未覆盖的维度）
- **Affected code**:
  - `PlanMosaic Desktop/index.html` — ~20 个问题
  - `PlanMosaic Desktop/ai-agent.js` — ~15 个问题
  - `PlanMosaic Desktop/main.js` — ~10 个问题
  - `backend/server.py` — ~8 个问题
  - `backend/tool_executor.py` — ~5 个问题
  - `PlanMosaic Desktop/preload.js` — ~1 个问题

## ADDED Requirements

### Requirement: AI-modified data MUST sync to localStorage immediately
`refreshScheduleData()` 必须在更新内存数据后同步更新 localStorage，确保重启后数据不丢失。

### Requirement: API Keys MUST NOT be embedded in data payloads
`collectAll()` 和所有数据持久化函数不得将 API Key 混入日程数据体。

### Requirement: Deep Planning functions MUST NOT be overridden by index.html
`openDeepPlanningModal`、`closeDeepPlanningModal` 等函数必须由 ai-agent.js 统一定义，index.html 不得重复定义。

### Requirement: Concurrency locks MUST coordinate across operations
`_isSaving`、`_isApproving`、`_isSending` 三个锁必须有跨操作协调机制，防止数据覆盖。

### Requirement: Archived conversations MUST have a maximum size
`archivedConversations` 必须有上限（如 500 条），超出时删除最旧条目。

### Requirement: Timezone MUST be configurable, NOT hardcoded to UTC+8
系统日期和时间判断必须基于用户可配置的时区，而非硬编码 UTC+8。

### Requirement: config.json values MUST be validated on load
`timeoutMs` 必须 > 0，`provider` 必须在 ["deepseek", "qwen"] 内，`model` 必须在已知模型列表内。

### Requirement: Event listeners MUST be paired with cleanup
所有 `addEventListener` 必须有对应的 `removeEventListener`，特别是全局 document 上的监听器。

### Requirement: Streaming sanitize MUST process incrementally
流式渲染的 HTML 消毒必须只处理增量部分，避免 O(n²) 复杂度。

### Requirement: Heartbeat MUST use monotonic clock for sleep detection
Heartbeat 必须使用 `performance.now()` 而非 `Date.now()`，避免休眠唤醒后误触发。

### Requirement: Retry logic MUST use exponential backoff with jitter
API 重试必须使用指数退避（`base * 2^retry_count`）+ 随机抖动，并读取 `Retry-After` 响应头。

### Requirement: Single instance lock MUST prevent multiple app launches
应用必须使用 `app.requestSingleInstanceLock()` 防止多实例同时运行。