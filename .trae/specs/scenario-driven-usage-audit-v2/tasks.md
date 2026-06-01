# 场景驱动审计 V2 - 任务列表

## 🔴 紧急修复（P0 — 数据安全与功能阻断）

- [x] **Task 1**: 修复深度规划函数被 index.html 覆盖 (P-A2a, P-A2b, P-F1a)
  - [x] 1.1 删除 `index.html:L7682-L7721` 中的 `openDeepPlanningModal`、`closeDeepPlanningModal`、`sendDeepPlanningMessage` 重复定义
  - [x] 1.2 确保 `ai-agent.js` 中的 `window.openDeepPlanningModal` 等完整实现不被覆盖
  - [x] 1.3 验证深度规划面板的会话加载、持久化、画像更新功能正常
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 2**: 修复 AI 修改数据后 localStorage 不同步 (P-A1a)
  - [x] 2.1 `refreshScheduleData()` 在更新 `window.scheduleData` 后调用 `DataManager.saveLocal()` 同步到 localStorage
  - [x] 2.2 确保 `DataManager` 在 Electron 模式下也可用（或使用等效 IPC）
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`, `PlanMosaic Desktop/index.html`

- [x] **Task 3**: 修复 API Key 泄露到数据体 (P-A1b, P-E1a)
  - [x] 3.1 从 `collectAll()` 的数据体中移除 `apiKeys` 字段 [index.html:L8178-L8180]
  - [x] 3.2 检查所有数据持久化路径，确保 API Key 不混入日程/对话数据
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 4**: 修复归档对话无限增长 (P-C4a)
  - [x] 4.1 `archivedConversations` 添加上限（推荐 500 条），超出时删除最旧条目
  - [x] 4.2 归档触发时（`conversationHistory.length >= 100`）检查总归档量
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 5**: 修复硬编码 UTC+8 时区 (P-D4a, P-D4b, P-D4c)
  - [x] 5.1 `server.py:_build_system_prompt()` 使用系统本地时区替代 `timezone(timedelta(hours=8))`
  - [x] 5.2 `ai-agent.js:performStartupScan()` 使用 `Intl.DateTimeFormat` 获取本地时间替代手动 UTC+8 偏移
  - [x] 5.3 system prompt 中传递实际系统时区信息给 AI
  - [ ] 涉及文件: `backend/server.py`, `PlanMosaic Desktop/ai-agent.js`

## 🟡 高优先级（P1 — 并发安全与数据一致性）

- [x] **Task 6**: 修复三套并发锁无协调 (P-A1c)
  - [x] 6.1 `refreshScheduleData()` 开始前检查 `_isSaving` 和 `_isApproving` 标志
  - [x] 6.2 如果检测到正在保存，延迟 500ms 后重试一次，最多重试 3 次
  - [x] 6.3 添加全局 `_isDataWriting` 锁，所有数据写入操作必须获取此锁
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`, `PlanMosaic Desktop/index.html`

- [x] **Task 7**: 修复多路径文件写入竞争 (P-A1d)
  - [x] 7.1 Electron 主进程添加文件锁（使用 `.lock` 文件机制）
  - [x] 7.2 Python 后端写入前检查 `.lock` 文件
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `backend/tool_executor.py`

- [x] **Task 8**: 修复 SSE 流监听器竞态 (P-A3a, P-A3b)
  - [x] 8.1 `removeAllAgentListeners()` 调用前检查是否有前一个流正在进行 → 等待其完成
  - [x] 8.2 SSE `result` 事件的 `shouldRefresh` 信号在 `doneHandler` 中二次确认
  - [x] 8.3 流被中断时，如果 `result` 事件已收到（`shouldRefresh: true`），仍触发刷新
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`, `PlanMosaic Desktop/main.js`

- [x] **Task 9**: 修复 Event 监听器泄漏 (P-B3a, P-B4a, P-B1b)
  - [x] 9.1 `initDeepPlanningDrag()` 的 mousemove/mouseup 监听器改为具名函数 + 在 `closeDeepPlanningModal` 中移除
  - [x] 9.2 ResizeObserver 在 agent 面板关闭时调用 `disconnect()`
  - [x] 9.3 全局 Escape 监听器改为具名函数，允许在不需要时移除
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`, `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 10**: 修复 config.json 值无校验 (P-D2a, P-D2b, P-D2c)
  - [x] 10.1 `loadSettings()` 中对 `timeoutMs` 添加 `> 0` 校验 → 无效时使用默认值
  - [x] 10.2 `loadSettings()` 中对 `provider` 添加枚举校验 → 仅允许 "deepseek"/"qwen"
  - [x] 10.3 `loadSettings()` 中对 `model` 添加白名单校验（至少检查非空字符串）
  - [x] 10.4 `config.py:_load_from_config_json()` 同步添加相同校验
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `backend/config.py`

- [x] **Task 11**: 修复 AI 工具调用参数无校验 (P-D3a, P-D3b)
  - [x] 11.1 `execute_tool_call()` JSON 解析失败时返回明确错误而非 `args = {}`
  - [x] 11.2 关键数值字段（`estimated_minutes`、`hours` 等）添加类型校验
  - [ ] 涉及文件: `backend/tool_executor.py`

- [x] **Task 12**: 修复磁盘满时写入异常 (P-D1a, P-D1b)
  - [x] 12.1 `main.js:writeScheduleData()` 添加 try-catch → ENOSPC 时 toast 提示
  - [x] 12.2 `server.py:_write_schedule_data()` 写入失败时回滚内存中 `schedule_data`
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `backend/server.py`

- [x] **Task 13**: 修复 heartbeat 休眠误触发 (P-D5a)
  - [x] 13.1 使用 `performance.now()` 替代 `Date.now()` 作为 heartbeat 计时基准
  - [x] 13.2 添加 `visibilitychange` 事件监听 → 页面隐藏时暂停 heartbeat → 恢复时重置计时器
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`

- [x] **Task 14**: 修复历史保存锁无超时 (P-D5b)
  - [x] 14.1 `saveHistory()` 的 `_saveHistoryLock` Promise 添加 30 秒超时
  - [x] 14.2 超时后 reject → 后续调用可以继续
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

## 🟡 中等优先级（P2 — 性能与体验优化）

- [x] **Task 15**: 修复流式 sanitizeHtml O(n²) 问题 (P-C2a, P-B2b)
  - [x] 15.1 流式渲染时仅对增量内容执行 sanitize + format，追加而非全量替换 innerHTML
  - [x] 15.2 或改为流式过程中使用 `textContent`（纯文本），流结束后一次性 format+innerHTML
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 16**: 修复逐字打字强制回流 (P-C1a, P-C1b)
  - [x] 16.1 缓存 container 引用，避免每次字符重复 `getElementById`
  - [x] 16.2 使用 `requestAnimationFrame` 合并滚动更新（每 100ms 滚动一次）
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 17**: 修复图像压缩后 Canvas 未清理 (P-C4b)
  - [x] 17.1 压缩完成后显式设置 `canvas.width = 0; canvas.height = 0` + `canvas.remove()`
  - [x] 17.2 `img.onload` 回调末尾释放 Image 对象的 src 引用
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 18**: 修复 localStorage 配额超限无处理 (P-C4c, P-C4d)
  - [x] 18.1 `saveDeepPlanningData()` 检测 `QuotaExceededError` → 清理最旧 session 后重试
  - [x] 18.2 Web 模式 `archiveConversations()` 同样添加配额超限处理
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 19**: 修复 HTTP 429 重试策略 (P-D3c, P-D3d, P-D3e)
  - [x] 19.1 重试延迟改为指数退避：`base_delay * 2^retry_count + random(0, base_delay)`
  - [x] 19.2 读取 `Retry-After` 响应头并优先使用该值
  - [x] 19.3 流式和非流式路径统一使用相同的重试策略
  - [ ] 涉及文件: `backend/server.py`

- [x] **Task 20**: 修复 SSE 非 JSON 响应静默丢弃 (P-D3f)
  - [x] 20.1 空 `catch (e) {}` 中添加 `console.warn` 记录解析失败
  - [x] 20.2 连续 5 次解析失败后向前端发送错误通知
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`

- [x] **Task 21**: 修复日历渲染闭包优化 (P-C3a)
  - [x] 21.1 `renderCalendar()` 改用事件委托模式（在 `calendarGrid` 上统一监听 click）
  - [x] 21.2 通过 `e.target.closest('.day-cell').dataset.dateStr` 获取日期
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 22**: 修复 WordMosaic postMessage 安全 (P-A5a)
  - [x] 22.1 `postMessage` 的 `targetOrigin` 从 `'*'` 改为具体的 WordMosaic 源
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 23**: 修复 AI 响应累积无上限 (P-D6a)
  - [x] 23.1 `accumulated["content"]` 添加最大长度限制（如 50000 字符）
  - [x] 23.2 超限后截断并发送警告事件
  - [ ] 涉及文件: `backend/server.py`, `PlanMosaic Desktop/main.js`

## 🟢 低优先级（P3 — 长期优化与完善）

- [x] **Task 24**: 修复损坏日期字符串导致崩溃 (P-D4d)
  - [x] 24.1 所有 `datetime.strptime(date, '%Y-%m-%d')` 调用添加 try-catch
  - [x] 24.2 跳过损坏日期并记录警告日志
  - [ ] 涉及文件: `backend/tool_executor.py`

- [x] **Task 25**: 修复多实例启动问题 (P-D5c, P-D5d)
  - [x] 25.1 添加 `app.requestSingleInstanceLock()` 限制单实例
  - [x] 25.2 第二实例时聚焦已有窗口
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`

- [x] **Task 26**: 修复读/写 IPC 路径不对称 (P-F2a)
  - [x] 26.1 `get-schedule-data` IPC 的本地 fallback 已验证返回一致的空数据格式
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`

- [x] **Task 27**: 修复 Escape 键模块化关闭 (P-B1a)
  - [x] 27.1 ESC handler 改为栈式管理，先关闭最顶层模态框
  - [x] 27.2 维护 `window._modalStack` 模态框栈
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 28**: 修复 Ctrl+S 在输入框中触发 (P-B1e)
  - [x] 28.1 Ctrl+S 处理中添加 `document.activeElement` 检查（INPUT/TEXTAREA/contentEditable）
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 29**: 修复备份清理逻辑重复 (P-F1b)
  - [x] 29.1 统一 Electron 和 Python 的备份文件命名格式为 `YYYYMMDD_HHMMSS_microseconds`
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `backend/tool_executor.py`

# Task Dependencies

- Task 1 (DP 函数覆盖) → 无依赖，可独立执行
- Task 2 (localStorage 同步) → 无依赖
- Task 3 (API Key 泄露) → 无依赖，可独立执行
- Task 4 (归档上限) → 无依赖
- Task 5 (时区修复) → 无依赖
- Task 6 (并发锁协调) → 可能依赖 Task 2（共享刷新逻辑）
- Task 7 (文件锁) → 无依赖
- Task 8 (SSE 竞态) → 无依赖
- Task 9 (监听器泄漏) → 无依赖
- Task 10 (config 校验) → 无依赖
- Task 11 (工具参数校验) → 无依赖
- Task 12 (磁盘满处理) → 无依赖
- Task 13 (heartbeat 休眠) → 无依赖
- Task 14 (保存锁超时) → 无依赖
- Task 15 (sanitize O(n²)) → 无依赖
- Task 16 (打字回流) → 无依赖
- Task 17 (Canvas 清理) → 无依赖
- Task 18 (配额超限) → 无依赖
- Task 19 (429 重试) → 无依赖
- Task 20 (SSE 解析失败) → 无依赖
- Task 21 (日历事件委托) → 无依赖
- Task 22 (postMessage 安全) → 无依赖
- Task 23 (响应截断) → 无依赖
- Task 24-29 → 均可独立执行

**推荐执行顺序**: Task 1→5（紧急修复）→ Task 6→14（高优先级）→ Task 15→29（中低优先级）