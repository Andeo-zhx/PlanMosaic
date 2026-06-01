# 场景驱动全枚举使用审计 Spec

## Why

前几轮审计（`deep-quality-audit`、`comprehensive-code-fix`、`code-vulnerability-audit-v2`）已覆盖安全漏洞和代码健壮性问题，但采用的是**缺陷视角**（先发现 bug 再修复）。本审计采用**场景视角**：先穷举所有用户使用场景，然后在每个场景中挖掘可能出现的实际问题（包括未覆盖的边界条件、交互断裂、数据一致性风险、静默失败等），补足前几轮审计的盲区。

## What Changes

本 Spec 按 15 大功能域枚举 ~120 个使用场景，在每个场景下列出潜在问题，标注严重程度和影响范围。

---

## 场景枚举与问题挖掘

### 功能域 1：应用启动与初始化

#### 场景 1.1：首次启动（无任何本地数据）
- **WHEN** 用户首次安装并启动 PlanMosaic
- **潜在问题**:
  - **P1-1a (🟡 中等)**: `config.json` 不存在时，`loadSettings()` 不报错但所有 API Key 为空，AI 功能静默不可用——用户看到 Mosa 回复"AI服务未配置"但不理解原因 → 应在初始化时检测并引导用户配置 API Key
  - **P1-1b (🟡 中等)**: `data.json` 不存在时，`readScheduleData()` 返回空壳对象 `{startDate:'',endDate:'',schedules:{}}`，日历渲染空白——用户体验为"空白应用"，无引导 → 首次启动应展示 onboarding 引导
  - **P1-1c (🟢 低)**: `settings.json` 不存在时 `loadSettings()` 静默跳过，超时配置等使用默认值，用户不可见

#### 场景 1.2：非首次启动（已有数据）
- **WHEN** 用户再次启动应用，已有日程和历史对话
- **潜在问题**:
  - **P1-2a (🔴 紧急)**: `data.json` 文件被手动编辑损坏（JSON 格式错误）→ `_read_schedule_data()` catch 返回空对象，所有历史日程**静默丢失**且无任何用户提示 → 应检测到 JSON 解析失败时备份损坏文件 + toast 警告用户
  - **P1-2b (🔴 紧急)**: 同上，`agent_log.json` 损坏 → 对话历史**静默丢失**

#### 场景 1.3：打包版（Portable EXE）首次启动
- **WHEN** 用户运行 `PlanMosaic1.1.0-Portable.exe`
- **潜在问题**:
  - **P1-3a (🟡 中等)**: `cleanLegacyDataForPackagedApp()` 和 `migrateFromLegacyDir()` 在 `loadSettings()` 之前调用，迁移后文件路径可能变化但 settings 已加载旧路径 → 时序依赖脆弱
  - **P1-3b (🟡 中等)**: 打包版 `extraResources` 中 `WordMosaic/` 路径下若无 `index.html`，`get-wordmosaic-path` 返回 `null` → WordMosaic 功能静默不可用

#### 场景 1.4：Python 后端不可用
- **WHEN** Python 未安装或 `backend` 模块缺失
- **潜在问题**:
  - **P1-4a (🔴 紧急)**: `startPythonBackend()` 中 `spawn('python', ...)` 可能因 'python' 不在 PATH 而直接抛异常 → `reject(err)` 后主进程继续运行但所有 AI 功能静默不可用，重启计数 `pythonRestartCount` 虽然 ≤3 但不阻止后续操作
  - **P1-4b (🟡 中等)**: `testNetworkConnection()` 检测到后端不可达后仅 `console.log` 警告，不通知渲染进程 → 用户看到 Mosa 无响应但不知道原因
  - **P1-4c (🟡 中等)**: Python 后端在运行中 crash 后自动重启成功，但 `pythonRestartCount` 未重置为 0（仅在 `resolve` 后重置）→ 如果重启成功但在健康检查完成前又 crash，计数器可能错误累积

#### 场景 1.5：主题初始化闪烁
- **WHEN** 用户上次使用深色主题，再次启动应用
- **潜在问题**:
  - **P1-5a (🟢 低)**: `createWindow()` 中读取 `data.json` 的 `settings.theme` 来判断背景色——但这依赖 data.json 路径解析正确，如果路径因账号切换而变化，可能读取到错误的主题色 → 启动时短暂闪烁

---

### 功能域 2：用户认证与账号管理

#### 场景 2.1：本地账号登录
- **WHEN** 用户在登录页输入用户名和密码，点击登录
- **潜在问题**:
  - **P2-1a (🟡 中等)**: 登录验证后的用户数据（schedule、settings）从 localStorage 加载 → 若 localStorage 数据被浏览器清理，用户登录成功但看到空白数据，以为是 bug
  - **P2-1b (🟡 中等)**: `setActiveUsername()` 调用后触发 `loadSettings()` 重新加载 config.json，但此时 config.json 可能尚未包含新用户的 API Key → AI 配置停留在上一个用户的设置

#### 场景 2.2：账号注册
- **WHEN** 新用户注册本地账号
- **潜在问题**:
  - **P2-2a (🟡 中等)**: 注册成功后用户数据保存到 localStorage，但未创建对应的 AppData 目录结构 → 首次使用 AI 功能时才创建目录，若此时无写入权限则静默失败

#### 场景 2.3：账号切换
- **WHEN** 用户从账号 A 切换到账号 B
- **潜在问题**:
  - **P2-3a (🔴 紧急)**: 切换账号时 `setActiveUsername()` 改变数据目录路径，但渲染进程中 `window.scheduleData` 和 `conversationHistory` 等内存变量**未清空** → 短暂显示旧账号数据，若此时自动保存触发会写入错误目录
  - **P2-3b (🟡 中等)**: 切换后需重新调用 `loadData()` 和 `performStartupScan()`，但当前代码中切换账号和刷新 UI 的时序未明确保证 → 可能看到混合数据
  - **P2-3c (🟡 中等)**: Electron 侧 `appConfig`（API Key、provider）是模块级全局变量，切换账号后不会自动重载 → 新用户可能使用旧用户的 API Key 发送请求
  - **P2-3d (🟡 中等)**: 深度规划模式的 `localStorage` 数据（`mosa-deep-planning-data`）未按账号隔离 → 账号 A 的深度规划对话可能被账号 B 看到

#### 场景 2.4：Supabase 云同步登录
- **WHEN** 用户通过 Supabase 第三方登录
- **潜在问题**:
  - **P2-4a (🟡 中等)**: Supabase 登录失败时（网络问题、token 过期），错误信息直接显示给用户可能暴露内部细节
  - **P2-4b (🟡 中等)**: `restoreSession` 恢复会话后若未调用 `loadCloud()`，云端日程不会合并到本地 → 用户以为数据丢失

---

### 功能域 3：日程管理

#### 场景 3.1：查看日历
- **WHEN** 用户打开日历视图，浏览不同月份
- **潜在问题**:
  - **P3-1a (🟡 中等)**: `renderCalendar()` 依赖 `window.scheduleData`，若数据未加载完成（异步竞态）→ 日历渲染空白或报错
  - **P3-1b (🟢 低)**: 跨月浏览时日期计算可能受时区影响（UTC+8 vs 本地时区不一致）

#### 场景 3.2：手动添加日程（单日）
- **WHEN** 用户通过右侧面板手动添加时间槽
- **潜在问题**:
  - **P3-2a (🟡 中等)**: 添加日程后直接 `saveScheduleData()` 写盘 + 更新 UI → 如果渲染和写盘之间存在竞态（用户快速连续添加），可能丢失中间状态
  - **P3-2b (🟡 中等)**: 时间格式输入无客户端即时校验 → `parseTimeRange('abc-def')` 直接抛异常崩溃
  - **P3-2c (🟡 中等)**: 无冲突检测：手动添加时不会像 AI 工具那样检测时间冲突 → 用户可以手动创建重叠日程

#### 场景 3.3：AI 辅助添加日程
- **WHEN** 用户对 Mosa 说"帮我明天下午3点到5点安排学数学"
- **潜在问题**:
  - **P3-3a (🟡 中等)**: AI 调用 `add_schedule` 工具后，`shouldRefresh=true` 触发前端 `refreshScheduleData()` → 但刷新是异步的，如果用户在刷新完成前再次操作可能看到旧数据
  - **P3-3b (🟡 中等)**: AI 添加的日程可能存在冲突但未被检测（取决于 AI 是否先调用了 `check_conflicts`）

#### 场景 3.4：周期性添加日程
- **WHEN** AI 或用户添加每周重复的课程
- **潜在问题**:
  - **P3-4a (🟡 中等)**: `add_recurring_schedule` 中 `repeat_pattern='weekly'` 时，若 `target_weekdays` 为空列表 → 循环仍执行但不添加任何日期，`successCount=0` 静默返回成功
  - **P3-4b (🟡 中等)**: 当 end_date 不为空时，日期范围可能极大（如 start=2024-01-01, end=2026-12-31）→ 生成 ~1000+ 天数据，导致文件膨胀和循环卡顿
  - **P3-4c (🟡 中等)**: 周期添加的每个日期都会检测冲突并可能跳过 → 如果某天有冲突就静默跳过，用户不知道哪些日期被跳过了

#### 场景 3.5：修改日程
- **WHEN** 用户或 AI 修改已有日程
- **潜在问题**:
  - **P3-5a (🟡 中等)**: `modify_schedule` 的批量操作（`batch_modify_schedules`）可能修改大量日期 → 如果 criteria 匹配到所有日程，可能意外全量修改
  - **P3-5b (🟡 中等)**: 修改操作中 `propose_schedule_change` 生成 proposal → 如果 proposal 的 `originalDetail` 在生成后、用户确认前数据已变更，批准时会基于过期数据执行

#### 场景 3.6：删除日程（单个/批量）
- **WHEN** 用户确认删除日程提案
- **潜在问题**:
  - **P3-6a (🔴 紧急)**: `batch_delete_schedule` 批量删除多个日期 → 如果 `dates` 数组包含不存在的日期，静默跳过 → 但如果 `dates` 为空数组，所有操作都跳过，用户看到"已批量删除日程"但实际什么都没删
  - **P3-6b (🟡 中等)**: 删除是**不可逆操作**：当前备份机制在写入前触发，但删除后原数据就没了 → 如果备份清理策略已删除旧备份，用户无法恢复

#### 场景 3.7：搜索日程
- **WHEN** 用户在搜索框输入关键词搜索日程
- **潜在问题**:
  - **P3-7a (🟡 中等)**: 搜索无防抖（每次按键触发完整 DOM 遍历）→ 输入速度快时造成 UI 卡顿
  - **P3-7b (🟡 中等)**: 搜索大小写敏感（取决于实现）→ 用户输入"数学"搜不到"数学课"

#### 场景 3.8：日程冲突检测
- **WHEN** AI 检测用户日程中的时间冲突
- **潜在问题**:
  - **P3-8a (🟡 中等)**: `check_conflicts` 仅检测 `timeSlots` 中的时间重叠，不检测 tasks 和 big_tasks 的 DDL 冲突 → 用户可能在同一时段有任务 DDL
  - **P3-8b (🟢 低)**: 冲突检测仅在同一日期内进行，不跨日期检测 → "从1月1日到1月5日每天8:00-10:00"和"1月3日9:00-11:00"之间不会检测到重叠

---

### 功能域 4：任务管理 (Tasks)

#### 场景 4.1：添加任务
- **WHEN** 用户添加日常任务到指定日期
- **潜在问题**:
  - **P4-1a (🟡 中等)**: 任务添加到不存在的日期 → `schedules[date]` 未初始化 → 创建空 schedule 对象 → 但该日期可能本不存在，创建了空壳后日历上显示空白条目
  - **P4-1b (🟢 低)**: `estimated` 字段（预计分钟数）无上限 → 用户可输入 999999 分钟

#### 场景 4.2：完成任务
- **WHEN** 用户标记任务为已完成
- **潜在问题**:
  - **P4-2a (🟡 中等)**: `complete_task` 需要 `actual_minutes` 参数 → AI 可能不传此参数 → 完成操作失败或记录不完整
  - **P4-2b (🟢 低)**: 已完成任务仍显示在原列表中（取决于前端渲染逻辑），无"已完成"视觉区分

#### 场景 4.3：批量删除任务
- **WHEN** AI 提议批量删除任务，用户确认
- **潜在问题**:
  - **P4-3a (🟡 中等)**: `batch_delete_tasks` 按任务名匹配删除 → 如果多个日期有同名任务，可能全部被删除（预期可能是只删某个日期的）
  - **P4-3b (🟡 中等)**: 任务名包含特殊字符时 `sanitize_str` 过滤 → 可能导致匹配失败

---

### 功能域 5：大任务管理 (Big Tasks)

#### 场景 5.1：大任务拆解
- **WHEN** 用户将一个大任务拆解为多个子任务
- **潜在问题**:
  - **P5-1a (🟡 中等)**: `break_down_big_task` 拆解后子任务以 JSON 字符串存入 → 如果 subtasks 数组为空 → 拆解无效果但返回成功
  - **P5-1b (🟡 中等)**: 拆解后的子任务未自动分配日期 → 仍然需要用户手动安排

#### 场景 5.2：DDL 状态检查
- **WHEN** 用户查询所有大任务的截止日期状态
- **潜在问题**:
  - **P5-2a (🟡 中等)**: `check_ddl_status` 依赖 `deadline` 字段 → 如果用户创建大任务时未设置 DDL，此任务被静默跳过 → 用户以为所有任务都在检查范围内

---

### 功能域 6：课程管理 (Courses)

#### 场景 6.1：创建课程表
- **WHEN** 用户通过 AI 创建学期课程表
- **潜在问题**:
  - **P6-1a (🟡 中等)**: `create_course_schedule` 接收 `courses` 数组 → 如果数组包含 20+ 门课程，每门课程都有多天时间槽 → 可能一次性生成大量日程数据 → 文件膨胀
  - **P6-1b (🟡 中等)**: 课程的 `weekday` 参数使用 0-6（周日-周六）→ 如果 AI 误用 1-7 → 课程出现在错误的日期

#### 场景 6.2：导入/导出课程表
- **WHEN** 用户导出课程表为文件或从文件导入
- **潜在问题**:
  - **P6-2a (🟡 中等)**: `export_course_schedule` 返回课程数据的 JSON → 但导出格式实际是内存中的数据，没有触发文件下载 → 用户以为导出了文件但实际没有
  - **P6-2b (🟡 中等)**: `import_course_schedule` 接收课程数据 → 无格式校验 → 导入格式错误的 JSON 导致数据损坏

#### 场景 6.3：课程负荷分析
- **WHEN** AI 分析用户某学期的课程负担
- **潜在问题**:
  - **P6-3a (🟢 低)**: `analyze_course_load` 仅统计课程数量和学分 → 不考虑课程难度、实验课时等 → 分析结果可能不准确

---

### 功能域 7：AI 助手 (Mosa) 对话

#### 场景 7.1：打开 AI 面板
- **WHEN** 用户点击 Mosa 图标打开对话面板
- **潜在问题**:
  - **P7-1a (🟡 中等)**: `openAgentModal()` 中若 `container.children.length === 0` 显示"在。"→ 但如果对话历史已加载，第一次打开面板时容器为空，会显示重复问候
  - **P7-1b (🟡 中等)**: ESC 键关闭面板 → 但若用户在输入框中按 ESC 取消了输入法，面板也会关闭

#### 场景 7.2：发送消息（纯文本）
- **WHEN** 用户输入文本并按 Enter 发送
- **潜在问题**:
  - **P7-2a (🔴 紧急)**: `sendAgentMessage()` 中防重入锁 `window._isSending` → 但在 `finally` 中释放 → 如果在 stream 回调中抛异常，`_isSending` 可能保持 `true`，后续消息永远无法发送
  - **P7-2b (🔴 紧急)**: 错误路径中 `window._isSending = false` 在 catch 块中设置 → 但如果 `finally` 也设置了，没有问题；但如果 catch 抛异常，finally 中的移除监听器会执行，但 `_isSending` 可能未重置
  - **P7-2c (🟡 中等)**: `Shift+Enter` 换行正常，但纯 Enter 发送时如果用户在输入法组合键中按 Enter → 会意外发送未完成的消息
  - **P7-2d (🟡 中等)**: 发送按钮 disabled 后若请求失败，在 catch 中重新 enable → 但 `throw new Error('Invalid response format')` 等非网络异常不会被正确展示为友好错误

#### 场景 7.3：发送消息（带图片）
- **WHEN** 用户上传图片并发送
- **潜在问题**:
  - **P7-3a (🔴 紧急)**: 图片通过 `FileReader.readAsDataURL()` 转为 base64 → 大图可能生成 **几十 MB** 的 base64 字符串 → 传入 API 请求体导致超时或 413 错误
  - **P7-3b (🟡 中等)**: `handleImageUpload` 中 `file.size > 5MB` 检查在客户端 → 但 base64 编码后体积膨胀约 33% → 5MB 图片编码后约 6.7MB
  - **P7-3c (🟡 中等)**: 多图上传时 `uploadedImages` 数组累积 → 如果用户上传 5 张图且不发消息，占用的 blob URL 和 base64 字符串一直存在于内存中
  - **P7-3d (🟡 中等)**: 图片 blob URL 在 `removeUploadedImage` 中 revoke → 但如果用户直接关闭面板而不移除图片 → blob URL 泄漏

#### 场景 7.4：流式接收 AI 回复
- **WHEN** AI 通过 SSE 流式返回回复内容
- **潜在问题**:
  - **P7-4a (🔴 紧急)**: `streamHandler` 回调中直接修改 `contentDiv.innerHTML` 并进行 Markdown 解析 → 如果 AI 回复中包含不完整的 HTML 标签（如 `<div>未闭合`）→ 渲染破坏整个消息气泡的布局
  - **P7-4b (🟡 中等)**: `doneHandler` 中 `div._doneHandled` 检查防止重复 → 但如果 SSE 发送了两个 `[DONE]` 事件 → 第二个 DONE 被忽略但第一个已经 resolve
  - **P7-4c (🟡 中等)**: 流式接收时用户切换面板或关闭窗口 → `removeAllAgentListeners` 移除监听 → 但 SSE 请求仍在后端运行，资源未释放
  - **P7-4d (🟡 中等)**: `retry` 类型事件清空 `streamedContent` 重新开始 → 但已渲染的内容被清空 → 用户体验为"闪烁"

#### 场景 7.5：审批日程修改提案
- **WHEN** Mosa 返回日程修改建议，用户点击"确认执行"
- **潜在问题**:
  - **P7-5a (🔴 紧急)**: `approveProposal()` 中 `conversationHistory[conversationHistory.length - 1]` 获取最后一个条目 → 但如果在 proposal 返回后、用户点击确认前，又有新消息添加到 history → 取到的不是正确的 proposal
  - **P7-5b (🟡 中等)**: 提案确认后按钮变为"已执行 ✓" → 但如果用户点击"取消"后刷新页面 → 提案按钮重新可用，用户可以重新确认一个已取消的提案
  - **P7-5c (🟡 中等)**: 提案确认后调 `refreshScheduleData()` → 但刷新可能在提案写入完成前执行 → 短暂显示旧数据

#### 场景 7.6：归档对话
- **WHEN** 用户选择归档当前对话
- **潜在问题**:
  - **P7-6a (🟡 中等)**: `archiveConversations()` 在 Electron 下调用后端 API 归档 → 但随后手动设置 `conversationHistory = []` 和 `archivedConversations = []`，并调用 `loadData()` → 时序问题：后端归档可能还未完成
  - **P7-6b (🟡 中等)**: Web 模式下归档数据存到 localStorage `mosaique-archived-conversations` → 长期累积可能超出 localStorage 5MB 限制

#### 场景 7.7：清空对话
- **WHEN** 用户清空所有对话历史
- **潜在问题**:
  - **P7-7a (🟡 中等)**: `clearConversations()` 清空后调用 `resetConversationState()` → 其中又添加一条"对话已清空。需要帮你规划什么呢？✨" → 这条消息被加入 history → 清空后 history 不为空
  - **P7-7b (🟡 中等)**: 清空后 container.innerHTML 置空 → 但如果深度规划面板也存在对话 → 深度规划的 DOM 未被清理

#### 场景 7.8：启动扫描（开机问候）
- **WHEN** 应用加载完成后自动扫描今日日程和昨日未完成任务
- **潜在问题**:
  - **P7-8a (🟡 中等)**: `performStartupScan()` 在 `setTimeout(..., 500)` 中延迟执行 → 如果用户在 500ms 内打开 AI 面板 → 容器已有内容，扫描结果不会显示
  - **P7-8b (🟡 中等)**: 扫描同时向 `agentChatContainer` 和 `agentMainChatContainer` 添加消息 → 如果用户在主面板和模态面板之间切换，可能看到重复问候
  - **P7-8c (🟡 中等)**: `yesterdayIncompleteTasks` 的检测依赖后端 → 如果后端不可用，错误被静默捕获，用户只看到通用问候

#### 场景 7.9：用户画像生成
- **WHEN** 对话轮数达到阈值（10轮），自动生成用户画像
- **潜在问题**:
  - **P7-9a (🟡 中等)**: `generateUserProfile()` 使用 `conversationHistory.slice(-30)` 提取最近对话 → 但对话可能包含大量 Markdown 和工具调用结果 → 画像提示可能超长
  - **P7-9b (🟡 中等)**: 画像生成调用 LLM API → 如果 API Key 未配置 → 失败后 `_profileGenFailCount++` → 3 次失败后永久停止画像生成 → 即使后来配置了 API Key 也不会恢复
  - **P7-9c (🟡 中等)**: 画像保存在 `_mosaProfileText` 变量中 → 页面刷新后丢失 → 每次都重新生成

#### 场景 7.10：对话历史自动归档
- **WHEN** 对话超过 100 条
- **潜在问题**:
  - **P7-10a (🟡 中等)**: `addToHistory()` 中 `conversationHistory.length >= 100` 时 splice 前 50 条到 archived → 但前 50 条可能是最旧的，而非最不重要的 → 简单按时间截断缺乏语义理解
  - **P7-10b (🟡 中等)**: 后端 `_archive_and_compress()` 压缩对话为 5% → 极端压缩可能丢失关键上下文 → AI 后续回答质量下降

---

### 功能域 8：深度规划模式

#### 场景 8.1：进入深度规划模式
- **WHEN** 用户切换到"深度规划" Tab
- **潜在问题**:
  - **P8-1a (🟡 中等)**: `loadDeepPlanningHistory()` 从 localStorage 加载 → 如果 localStorage 数据损坏（JSON 解析失败）→ catch 后 `deepPlanningHistory = []` → 历史对话静默丢失
  - **P8-1b (🟡 中等)**: 如果 localStorage 中的 `sessions` 数组包含大量历史会话 → 每次加载都解析全量数据 → 性能问题

#### 场景 8.2：深度规划对话
- **WHEN** 用户在深度规划模式下与 Mosa 交流
- **潜在问题**:
  - **P8-2a (🟡 中等)**: 深度规划使用独立的 `deepPlanningHistory` 而非共享的 `conversationHistory` → 深度规划中的对话不会触发用户画像生成
  - **P8-2b (🟡 中等)**: `saveDeepPlanningData()` 在每次发消息后调用 → 但如果用户快速连续发消息 → 多次写 localStorage 可能触发竞态
  - **P8-2c (🔴 紧急)**: 深度规划模式下 AI 工具白名单（`DEEP_PLANNING_TOOL_WHITELIST`）包括 `view_schedule` → AI 可以查看用户日程 → 但如果 AI 在"阶段一（信息收集）"就调用 `view_schedule`，违背了"慢热"原则
  - **P8-2d (🟡 中等)**: 深度规划流式接收使用 `typeDPText` 模拟打字效果 → 12ms/字符 → 长回复（500+ 字）需要 6 秒渲染 → 用户等待时间长

#### 场景 8.3：战略分析工具
- **WHEN** AI 调用 SWOT 分析、决策矩阵、ROI 计算等工具
- **潜在问题**:
  - **P8-3a (🟡 中等)**: `_execute_web_search` 当前是占位实现（返回"联网搜索功能暂未开放"）→ 但 AI 仍可能在 tool_choice=auto 时调用它 → 浪费一次工具调用轮次
  - **P8-3b (🟡 中等)**: `_execute_value_monetization` 中若用户输入为空 → 返回错误但 AI 可能继续对话 → 用户看到分析结果为空

---

### 功能域 9：设置管理

#### 场景 9.1：配置 API Key
- **WHEN** 用户在设置面板输入 DeepSeek/Qwen 的 API Key
- **潜在问题**:
  - **P9-1a (🔴 紧急)**: API Key 通过 IPC `set-api-key` 发送到主进程 → 主进程中明文写入 `config.json` → 任何能访问 AppData 目录的程序都能读取
  - **P9-1b (🟡 中等)**: `set-api-key` 校验 `key.length < 20` → 拒绝过短 key → 但某些合法的短 key 或测试 key 会被拒绝
  - **P9-1c (🟡 中等)**: API Key 设置后尝试 `pythonApi('POST', '/api/config', ...)` 热加载到后端 → 如果后端不可用，仅打 warning → 新 Key 在下一次后端重启时生效 → 用户以为配置成功但实际未生效

#### 场景 9.2：验证 API Key
- **WHEN** 用户点击"验证"按钮测试 API Key 有效性
- **潜在问题**:
  - **P9-2a (🟡 中等)**: `validate-api-key` 发送 `max_tokens=1` 的测试请求 → 消耗 token（虽然很少）→ 反复验证会累积费用
  - **P9-2b (🟡 中等)**: `testApiKeyConnection` 无超时 → 网络不通时挂起 10 秒后 `req.setTimeout(10000)` 才超时 → 用户等待 10 秒

#### 场景 9.3：切换 AI 提供商
- **WHEN** 用户在 DeepSeek 和 Qwen 之间切换
- **潜在问题**:
  - **P9-3a (🟡 中等)**: 切换提供商后 `setCurrentProvider()` 更新内存中的 `appConfig.provider` → 但如果 `config.json` 写入失败（磁盘满）→ 下次启动回退到旧提供商
  - **P9-3b (🟡 中等)**: 切换提供商的时机如果在对话中 → 当前流式请求可能仍使用旧提供商

#### 场景 9.4：切换模型（flash / pro）
- **WHEN** 用户在 DeepSeek 的 flash 和 pro 模型间切换
- **潜在问题**:
  - **P9-4a (🟡 中等)**: 切换到 pro（reasoner）模型后，`_is_reasoner_model()` 返回 `true` → 不传 `temperature` 参数 → 但如果 API 需要 temperature 参数则报错
  - **P9-4b (🟡 中等)**: reasoner 模型返回的 content 可能包含 `</think` 标签 → `cleanReasonerContent` 尝试移除 → 正则可能匹配不完整（如 DeepSeek V4 返回非标准格式）

#### 场景 9.5：主题切换
- **WHEN** 用户切换浅色/深色主题
- **潜在问题**:
  - **P9-5a (🟡 中等)**: 主题切换通过 `document.documentElement.setAttribute('data-theme', theme)` 实现 → CSS 变量切换 → 但如果有 JS 直接操作的颜色值（非 CSS 变量），不会更新
  - **P9-5b (🟢 低)**: 主题保存到 localStorage 同时也尝试写到 `data.json` 的 `settings.theme` → 两处存储可能不一致

---

### 功能域 10：数据持久化与备份

#### 场景 10.1：日程数据保存
- **WHEN** 系统自动或手动保存日程数据
- **潜在问题**:
  - **P10-1a (🔴 紧急)**: Electron 主进程 `writeScheduleData()` 直接 `fs.writeFileSync` 覆盖 → 写入中途系统崩溃 → 数据文件损坏（Python 后端已修复为原子写入，但主进程代码未同步修复！）
  - **P10-1b (🟡 中等)**: `tool_executor.py` 中 `_write_schedule_data` 有 5MB 大小限制 → 但 `server.py` 中的 `_write_schedule_data` 无此限制 → 行为不一致
  - **P10-1c (🟡 中等)**: 保存频率过高（每次 AI 工具调用、每次手动编辑）→ 频繁 fsync 可能影响 SSD 寿命

#### 场景 10.2：备份创建与清理
- **WHEN** 每次写入数据前自动创建备份
- **潜在问题**:
  - **P10-2a (🟡 中等)**: `createBackup()` 按时间戳命名 → 同一秒内多次保存会产生同名备份 → `copyFileSync` 覆盖 → 丢失中间版本
  - **P10-2b (🟡 中等)**: `cleanOldBackups()` 仅保留 10 个且按 `mtime` 排序 → 如果系统时间被回拨 → 旧备份可能被认为是最新的 → 有用的备份被删除
  - **P10-2c (🟡 中等)**: 备份目录无限增长（仅按数量限制，无总大小限制）→ 在 tool_executor.py 中已修复（50MB 总大小限制），但 main.js 中未同步

#### 场景 10.3：数据迁移
- **WHEN** 从旧版本升级或切换数据目录
- **潜在问题**:
  - **P10-3a (🟡 中等)**: `migrateFromLegacyDir()` 迁移旧数据 → 如果目标目录已存在同名文件 → 静默跳过（不覆盖）→ 用户以为迁移成功但实际使用的是旧数据
  - **P10-3b (🟡 中等)**: `cleanLegacyDataForPackagedApp()` 删除全局旧数据 → 如果用户在打包版和开发版之间切换 → 可能误删开发版数据

---

### 功能域 11：WordMosaic 子应用

#### 场景 11.1：打开 WordMosaic
- **WHEN** 用户点击进入 WordMosaic（单词/书籍学习）
- **潜在问题**:
  - **P11-1a (🟡 中等)**: WordMosaic 作为 webview 加载 → `contextIsolation: true` 但 `nodeIntegration: false` → 如果 webview 内容需要访问 Node API → 功能受限
  - **P11-1b (🟡 中等)**: `will-attach-webview` 中阻止非 `file://` 的 URL → 但如果 webview 内部尝试加载外部资源（如字体、CDN）→ 被阻止 → 渲染异常

#### 场景 11.2：书籍数据加载
- **WHEN** WordMosaic 加载书籍 JSON 数据
- **潜在问题**:
  - **P11-2a (🟡 中等)**: 书籍 JSON 文件（college1.json 等）可能很大 → webview 中 `fetch()` 读取 file:// 协议有限制 → 大文件加载失败
  - **P11-2b (🟡 中等)**: 书籍数据与 agent 交互 → 如果 agent API 不可用 → WordMosaic 核心功能不可用

---

### 功能域 12：CLI 工具

#### 场景 12.1：命令行查看日程
- **WHEN** 用户在终端运行 `node cli.js` 或 `python -m backend.cli`
- **潜在问题**:
  - **P12-1a (🟢 低)**: CLI 直接读取 data.json → 如果格式不兼容（新字段、新结构）→ JSON 解析不报错但显示异常
  - **P12-1b (🟢 低)**: CLI 使用 `console.log` 输出 → 如果有 Unicode 日程内容 → Windows CMD 可能乱码

---

### 功能域 13：ReAct 日志

#### 场景 13.1：导出 ReAct 日志
- **WHEN** 用户通过 Electron 原生对话框保存 ReAct 日志
- **潜在问题**:
  - **P13-1a (🟡 中等)**: `save-react-file` 弹出原生保存对话框 → 如果用户取消 → `cancelled: true` → 前端应正确处理取消状态
  - **P13-1b (🟡 中等)**: 日志内容可能很大（多轮 ReAct 循环）→ 如果包含二进制或特殊字符 → `fs.writeFileSync` 可能抛异常

---

### 功能域 14：桌面快捷方式

#### 场景 14.1：创建快捷方式
- **WHEN** 应用首次在 Windows 上运行时自动创建桌面快捷方式
- **潜在问题**:
  - **P14-1a (🟡 中等)**: PowerShell 命令中的路径拼接 → 已被转义（单引号双重化、反斜杠双重化）→ 但如果路径包含其他特殊字符（如 `$` 或 `"`）→ 仍可能注入或出错
  - **P14-1b (🟡 中等)**: `iconPath` 使用硬编码的 `image4.ico` → 打包版中图标路径在 `resources/app/image4.ico` → 如果目录结构与预期不同 → 快捷方式无图标

---

### 功能域 15：错误处理与边界情况

#### 场景 15.1：网络离线
- **WHEN** 用户设备断开网络连接
- **潜在问题**:
  - **P15-1a (🟡 中等)**: `sendAgentMessage()` 检查 `navigator.onLine` → 但 `navigator.onLine` 在 Electron 中不完全可靠（仅检测本地网络接口状态）→ 即使返回 `true` 仍可能无法访问 API
  - **P15-1b (🟡 中等)**: 离线时日程管理功能（纯本地操作）应仍可用 → 但某些操作可能依赖 `pythonApi()` 调用 → 离线时本地操作可能也不可用

#### 场景 15.2：API 超时
- **WHEN** LLM API 响应时间过长
- **潜在问题**:
  - **P15-2a (🟡 中等)**: 主进程 SSE 连接 `timeout: 120000`（2分钟）→ 但 heartbeat 每 15 秒检查一次，45 秒无数据就断连 → 如果 API 在处理长推理（pro 模型可能超过 45 秒才返回第一个 token）→ heartbeat 误杀正常请求
  - **P15-2b (🟡 中等)**: API 超时后返回友好错误消息 → 但错误消息中包含 `error_msg`（技术错误码）→ 可能暴露 API 提供商信息

#### 场景 15.3：Python 后端崩溃与恢复
- **WHEN** Python 进程意外退出
- **潜在问题**:
  - **P15-3a (🟡 中等)**: `pythonProcess.on('exit')` 中 `code !== 0` 时重启 → 但如果 `code === null`（被信号杀死）→ 条件 `code !== 0` 为 `true` → 正常重启
  - **P15-3b (🟡 中等)**: 重启过程中前端发送请求 → `pythonApi()` 因连接拒绝而失败 → 返回错误给前端 → 前端显示"请求失败" → 用户体验差，应提示"服务正在重启"

#### 场景 15.4：并发操作竞态
- **WHEN** 用户快速执行多个操作
- **潜在问题**:
  - **P15-4a (🔴 紧急)**: `saveHistory()` 和 `sendAgentMessage()` 中的 `saveHistory()` 可能并发执行 → 两次保存可能使用不同版本的 `conversationHistory` → 后保存的覆盖先保存的 → 丢失对话
  - **P15-4b (🟡 中等)**: `approveProposal()` 中的 `conversationHistory[conversationHistory.length - 1]` 依赖数组顺序 → 如果 AI 回复还在流式输出中就点击确认 → proposal 可能不完整

#### 场景 15.5：超大输入
- **WHEN** 用户粘贴超长文本或上传超大图片
- **潜在问题**:
  - **P15-5a (🟡 中等)**: 用户消息长度无限制 → 粘贴整本书的内容作为消息 → API 请求体过大 → 400 错误
  - **P15-5b (🟡 中等)**: `conversationHistory` 无总 token 估算 → 如果对话持续数小时，history 累计数百条 → API 请求超出上下文窗口 → 截断逻辑可能丢失关键上下文

#### 场景 15.6：窗口关闭/最小化行为
- **WHEN** 用户关闭窗口（但不退出应用）或最小化
- **潜在问题**:
  - **P15-6a (🟡 中等)**: 流式接收中关闭窗口 → SSE 连接可能未正确关闭 → 后端继续生成 token → 浪费 API 费用
  - **P15-6b (🟡 中等)**: 窗口关闭时未保存对话历史 → 下次打开丢失未保存的对话

#### 场景 15.7：特殊字符输入
- **WHEN** 用户输入包含 emoji、Unicode 代理对、特殊符号的文本
- **潜在问题**:
  - **P15-7a (🟡 中等)**: `sanitizeStr` 和 `safeJsonStringify` 处理代理对 → 但 `JSON.stringify` 本身也可能因代理对抛异常 → 已有 safeJsonStringify 防御
  - **P15-7b (🟡 中等)**: `cleanReasonerContent` 使用正则 `<think[^>]*>[\s\S]*?</think>` → `/think` 标签如果跨越多行数据块可能匹配不到

## Impact

- **Affected specs**: `deep-quality-audit`（本审计覆盖其未覆盖的场景级问题）、`comprehensive-code-fix`（进一步修复其遗漏的用户场景缺陷）
- **Affected code**:
  - `PlanMosaic Desktop/main.js` — 14 个问题（P1-4a, P3-6a, P7-2a, P9-1a, P10-1a, P15-2a, ...）
  - `PlanMosaic Desktop/ai-agent.js` — 12 个问题（P7-2b, P7-3a, P7-4a, P7-5a, P7-9b, ...）
  - `PlanMosaic Desktop/index.html` — 11 个问题（P2-3a, P3-2b, P3-7a, P9-5a, ...）
  - `PlanMosaic Desktop/preload.js` — 1 个问题
  - `backend/server.py` — 8 个问题（P1-4a, P3-3a, P7-8c, P8-2c, P9-1c, ...）
  - `backend/tool_executor.py` — 7 个问题（P3-4b, P4-3a, P5-1a, P6-1b, P8-3a, ...）
  - `backend/paths.py` — 2 个问题
  - `PlanMosaic Desktop/paths.js` — 2 个问题

## ADDED Requirements

### Requirement: Corrupted data files MUST trigger user-visible warning
当 data.json 或 agent_log.json JSON 解析失败时，系统必须备份损坏文件并 toast 警告用户，不得静默返回空数据。

### Requirement: Account switch MUST fully reset all in-memory state
切换账号时，`window.scheduleData`、`conversationHistory`、`deepPlanningHistory`、`_mosaProfileText` 等所有内存状态必须完全清空并重新加载。深度规划的 localStorage 数据必须按账号隔离。

### Requirement: Send message MUST have robust re-entrancy guard
`sendAgentMessage()` 的 `_isSending` 锁必须在所有异常路径（包括 stream 回调异常）中可靠释放，不得导致后续消息永久锁定。

### Requirement: Image upload MUST compress before sending to API
发送到 AI API 的图片必须在 base64 编码前压缩至合理大小（≤1MB 或 ≤2048px），避免请求体过大。

### Requirement: Stream message rendering MUST be resilient to malformed HTML
流式渲染 AI 回复时，必须对不完整的 HTML/特殊字符做防护处理，Markdown 渲染失败时 fallback 到 `textContent`。

### Requirement: Proposal approval MUST be keyed, not index-based
`approveProposal()` 必须基于 proposal ID 而非 `conversationHistory[last]` 索引来获取待批准的提案，防止并发场景下取错提案。

### Requirement: Offline mode MUST preserve local-only operations
网络离线时，纯本地操作（查看/编辑日程、管理任务）必须仍可用，不应因 `pythonApi()` 调用失败而阻断所有功能。

### Requirement: File write in Electron main process MUST be atomic
Electron 主进程中的 `writeScheduleData()` 和 `writeAgentHistory()` 必须改为先写临时文件、再 `fs.rename` 的原子写入模式，与 Python 后端保持一致。

### Requirement: Depth planning localStorage sessions MUST have size limit
深度规划模式 localStorage 中的 sessions 数量必须有限制（如最多 10 个会话），超过时自动清理最旧的。

### Requirement: Conversation history MUST have total token estimation
在发送 AI 请求前，必须估算对话历史的总 token 数，超过上下文窗口 80% 时进行智能截断（而非简单按数量截断）。

### Requirement: Heartbeat timeout MUST account for reasoner model latency
SSE 心跳超时阈值必须根据模型类型动态调整——reasoner 模型（如 DeepSeek Pro）可能需要 60 秒以上才返回第一个 token。

### Requirement: First-run experience MUST guide user to configure API Key
首次启动时检测无 API Key → 在 AI 面板中引导用户前往设置页面配置 API Key，而非仅显示"AI服务未配置"。