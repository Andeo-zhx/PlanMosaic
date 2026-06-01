# 场景驱动审计 - 任务列表

## 🔴 紧急修复（P0 — 数据安全与可用性阻断）

- [x] **Task 1**: 修复损坏数据文件静默丢失问题 (P1-2a, P1-2b)
  - [x] 1.1 `_read_schedule_data()` / `_read_agent_history()` / `readScheduleData()` / `readAgentHistory()` 中 JSON 解析失败时，先将损坏文件备份（加 `.corrupted` 后缀），再 toast 警告用户
  - [ ] 1.2 前端 `loadData()` 中接收到空数据时，检查原始文件状态并给出对应提示
  - [ ] 涉及文件: `backend/server.py`, `PlanMosaic Desktop/main.js`, `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 2**: 修复 Electron 主进程文件写入非原子操作 (P10-1a)
  - [x] 2.1 `writeScheduleData()` 改为 `tmp + fs.rename` 原子写入模式
  - [ ] 2.2 `writeAgentHistory()` 同上改为原子写入
  - [ ] 2.3 同步 `createBackup()` 和 `cleanOldBackups()` 的总大小限制逻辑（与 tool_executor.py 一致）
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`

- [x] **Task 3**: 修复 sendAgentMessage 防重入锁泄漏 (P7-2a, P7-2b)
  - [x] 3.1 将所有 `window._isSending = false` 统一到 `finally` 块
  - [ ] 3.2 移除 catch 块中重复的 `_isSending = false`
  - [ ] 3.3 stream 回调内部异常影响 `_isSending` 时也通过 finally 保证释放
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 4**: 修复 Proposal 审批基于索引而非 ID 的并发风险 (P7-5a)
  - [x] 4.1 为每个 proposal 生成唯一 ID，存储在消息条目中
  - [ ] 4.2 `approveProposal()` 通过 proposal ID 匹配而非 `conversationHistory[last]`
  - [ ] 4.3 添加 proposal 生命周期状态（pending → approved/rejected），防止重复操作
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 5**: 修复账号切换时内存状态未清空 (P2-3a, P2-3b, P2-3c, P2-3d)
  - [x] 5.1 切换账号时清空 `window.scheduleData`、`conversationHistory`、`archivedConversations` 等所有内存变量
  - [ ] 5.2 切换后强制重新 `loadData()` 和 `performStartupScan()`
  - [ ] 5.3 深度规划 localStorage key 改为包含用户名前缀（`mosa-deep-planning-data-{username}`）
  - [ ] 5.4 确保 `appConfig`（API Key、provider）在切换时重载为当前用户的配置
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `PlanMosaic Desktop/ai-agent.js`, `PlanMosaic Desktop/index.html`

- [x] **Task 6**: 修复 saveHistory 并发竞态导致对话丢失 (P15-4a)
  - [x] 6.1 在 `saveHistory()` 入口添加互斥锁（Promise chain 或 flag）
  - [ ] 6.2 确保 `sendAgentMessage()` 中的 `saveHistory()` 和用户触发的 `saveHistory()` 串行化
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 7**: 修复流式渲染时 malformed HTML 破坏布局 (P7-4a)
  - [x] 7.1 流式 content 渲染前先用 `sanitizeHtml()` 过滤危险标签
  - [ ] 7.2 Markdown 转 HTML 后进行完整性校验，发现不完整标签时 fallback 到 `textContent`
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

## 🟡 高优先级（P1 — 用户体验断裂与功能缺陷）

- [x] **Task 8**: 首次启动引导用户配置 API Key (P1-1a, P1-1b)
  - [x] 8.1 首次启动检测：config.json 不存在或无任何 API Key → 在 AI 面板显示引导卡片
  - [x] 8.2 引导卡片包含"去设置"按钮，点击打开设置面板并高亮 API Key 配置区域
  - [x] 8.3 首次启动时显示欢迎 onboarding 提示（非空白日历）
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`, `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 9**: 修复 Python 后端不可用时缺乏用户提示 (P1-4a, P1-4b, P15-3b)
  - [x] 9.1 Python 启动失败时，通过 IPC 通知渲染进程显示持续 banner "AI 服务未启动"
  - [x] 9.2 重启过程中前端发送请求时，返回"服务正在重启，请稍候"而非"请求失败"
  - [x] 9.3 自动重启成功/失败时发送状态更新通知
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `PlanMosaic Desktop/index.html`, `PlanMosaic Desktop/preload.js`

- [x] **Task 10**: 修复图片上传未压缩导致请求过大 (P7-3a, P7-3b)
  - [x] 10.1 在 `handleImageUpload` 中，使用 Canvas 压缩图片至 max 2048px 宽/高
  - [x] 10.2 压缩后再转为 base64，确保编码后 ≤ 2MB
  - [x] 10.3 更新 `file.size > 5MB` 检查为压缩后大小检查
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 11**: 修复流式接收中关闭窗口/面板资源未释放 (P7-4c, P15-6a)
  - [x] 11.1 关闭 AI 面板时调用 `removeAllAgentListeners` 移除 SSE 监听
  - [x] 11.2 窗口关闭前通过 IPC 通知主进程取消正在进行的 SSE 流
  - [x] 11.3 主进程侧在渲染进程断开时销毁对应的 `req`
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`, `PlanMosaic Desktop/main.js`

- [x] **Task 12**: 修复对话历史无 Token 估算导致上下文溢出 (P15-5b)
  - [x] 12.1 在发送 AI 请求前，粗略估算 history 的 token 数（中文 ~2 char/token，英文 ~4 char/token）
  - [x] 12.2 超过模型上下文窗口 80% 时，按时间从旧到新截断 + 保留 system prompt
  - [x] 12.3 截断后给出 toast 提示"对话较长，已截断部分历史"
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`, `backend/server.py`

- [x] **Task 13**: 修复 Heartbeat 超时误杀 reasoner 模型请求 (P15-2a)
  - [x] 13.1 根据模型类型动态设置 heartbeat 超时：flash 模型 45 秒，pro/reasoner 模型 90 秒
  - [x] 13.2 通过前端传递的 model 信息在 stream-handler 中动态调整
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`

- [x] **Task 14**: 修复离线模式阻断本地操作 (P15-1b)
  - [x] 14.1 区分纯本地操作（日程读写、历史读写）和需要 AI 的操作
  - [x] 14.2 离线时纯本地操作直接使用主进程的 `readScheduleData`/`writeScheduleData` fallback
  - [x] 14.3 AI 操作在离线时给出明确提示"该功能需要网络连接"
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `PlanMosaic Desktop/index.html`

## 🟡 中等优先级（P2 — 功能健壮性与边界条件）

- [x] **Task 15**: 修复周期性日程无限日期范围 (P3-4b)
  - [x] 15.1 `add_recurring_schedule` 中限制最多生成 365 天数据
  - [x] 15.2 超出时返回警告信息
  - [ ] 涉及文件: `backend/tool_executor.py`

- [x] **Task 16**: 修复批量删除操作空数组问题 (P3-6a)
  - [x] 16.1 批量删除前校验 dates/tasks 数组非空
  - [x] 16.2 空数组时返回明确错误而非静默成功
  - [ ] 涉及文件: `backend/tool_executor.py`

- [ ] **Task 17**: 修复搜索无防抖 + 敏感性问题 (P3-7a, P3-7b) — **延期：UI 搜索功能尚未实现**
  - [ ] 17.1 搜索输入添加 300ms 防抖
  - [ ] 17.2 搜索改为大小写不敏感
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 18**: 修复用户画像生成失败后永久停止 (P7-9b)
  - [x] 18.1 `_profileGenFailCount` 在成功配置 API Key 后重置
  - [x] 18.2 在 `set-api-key` IPC handler 成功后通知 ai-agent 重置失败计数
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 19**: 修复深度规划 localStorage 无限增长 (P7-6b, P8-1b)
  - [x] 19.1 深度规划 sessions 限制为 10 个，超出时删除最旧的
  - [x] 19.2 每个 session 的 messages 限制为 200 条
  - [x] 19.3 Web 模式归档对话 localStorage 限制为最多 5 个归档
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 20**: 修复手动添加日程无冲突检测 (P3-2c) 和 时间格式无校验 (P3-2b)
  - [x] 20.1 手动添加 schedule 时调用冲突检测逻辑
  - [x] 20.2 时间输入框添加客户端 format 校验（HH:MM-HH:MM 正则）
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 21**: 修复清空对话后自动添加消息的问题 (P7-7a)
  - [x] 21.1 `resetConversationState()` 中移除自动添加"对话已清空"消息的逻辑
  - [x] 21.2 改为 toast 提示"对话已清空"
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 22**: 修复 ESC 关闭面板与输入法冲突 (P7-1b)
  - [x] 22.1 `keydown` 监听中添加 `e.isComposing` 检查，输入法激活时不关闭面板
  - [x] 22.2 Enter 发送消息时也添加 `e.isComposing` 检查
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 23**: 修复 API Key 热加载到后端失败时的提示 (P9-1c)
  - [x] 23.1 `set-api-key` 中后端热加载失败时，返回 warning 字段
  - [x] 23.2 前端收到 warning 时显示"配置已保存，重启后生效"
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `PlanMosaic Desktop/index.html`

- [x] **Task 24**: 修复启动扫描时序问题 (P7-8a, P7-8b)
  - [x] 24.1 扫描结果缓存，面板打开时不再重复添加问候（只添加到当前可见容器）
  - [x] 24.2 `performStartupScan()` 改为只添加到 agentMainChatContainer（主面板），agentChatContainer（模态面板）打开时动态复制或单独处理
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

## 🟢 低优先级（P3 — 体验优化）

- [x] **Task 25**: 修复深度规划模式下 web_search 占位工具浪费调用 (P8-3a)
  - [x] 25.1 从 `DEEP_PLANNING_TOOL_WHITELIST` 中移除 `web_search_evaluate`
  - [ ] 涉及文件: `backend/server.py` 或 `backend/tool_executor.py`

- [x] **Task 26**: 修复重复添加日程时的日期范围上限和冲突跳过提示 (P3-4c)
  - [x] 26.1 周期性添加时收集被跳过的日期列表，在返回消息中包含
  - [ ] 涉及文件: `backend/tool_executor.py`

- [x] **Task 27**: 修复备份命名冲突（同一秒内多次保存）(P10-2a)
  - [x] 27.1 备份文件名添加毫秒或递增序号
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `backend/tool_executor.py`

- [x] **Task 28**: 修复深度规划打字效果太慢 (P8-2d)
  - [x] 28.1 `typeDPText` 速度从 12ms 提高到 5ms
  - [x] 28.2 长文本（>300 字）跳过打字动画直接渲染
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 29**: 修复多图上传 blob URL 泄漏 (P7-3d)
  - [x] 29.1 关闭面板时自动调用 `revokeAllBlobUrls()`
  - [x] 29.2 `resetConversationState()` 确保包含 blob URL 清理
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

---

## 🔧 验证后修复任务（基于 checklist 验证 11 个 FAIL 项）

- [x] **Task 30**: 修复 sanitizeHtml 不转义尖括号导致 malformed HTML 破坏布局 (C17)
  - [x] 30.1 在 `sanitizeHtml()` 中增加对 `<` `>` 字符的 HTML 实体转义（先 escapeHtml 再恢复安全标签）
  - [x] 30.2 确保 `<div`、`</div>` 等未闭合标签不会破坏 innerHTML 布局
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 31**: 修复"去设置"按钮缺少滚动到 API Key 区域 (C20)
  - [x] 31.1 在 onboarding 按钮的 `openSettingsModal()` 调用后添加 `scrollIntoView` 定位到 API Key 区域
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`, `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 32**: 修复 Python 后端重启状态检测与用户提示 (C22, C23)
  - [x] 32.1 Python 重启中发送消息时返回"服务正在重启，请稍候"
  - [x] 32.2 第 4 次重启失败时 banner 更新为"AI 服务多次启动失败，请检查 Python 环境"
  - [x] 32.3 将 `python-backend-error` 事件暴露到渲染进程（通过 preload.js）
  - [ ] 涉及文件: `PlanMosaic Desktop/main.js`, `PlanMosaic Desktop/preload.js`, `PlanMosaic Desktop/index.html`

- [x] **Task 33**: 修复 toast 文案与需求不匹配的问题 (C25, C28, C32)
  - [x] 33.1 图片过大 toast 改为"图片过大，请选择小于 5MB 的图片"
  - [x] 33.2 离线提示 toast 改为"该功能需要网络连接"
  - [x] 33.3 Token 截断阈值改为按模型类型动态设置（flash ~8000, pro ~16000）
  - [ ] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

- [x] **Task 34**: 修复时间格式校验缺少输入框红色高亮 (C41)
  - [x] 34.1 时间格式不匹配时，对输入框添加红色边框/高亮样式 + 用户输入时自动清除
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 35**: 修复 index.html 全局 ESC 监听未检查 isComposing (C45)
  - [x] 35.1 在 `document.addEventListener('keydown', ...)` 的 ESC 分支添加 `e.isComposing` 检查
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

# Task Dependencies

- Task 1 (损坏数据静默丢失) → 无依赖，可独立执行
- Task 2 (原子写入) → 无依赖，可独立执行
- Task 3 (防重入锁) → 无依赖，可独立执行
- Task 4 (Proposal ID) → 无依赖，可独立执行
- Task 5 (账号切换) → 可能依赖 Task 3（共享 ai-agent.js 代码区域），但逻辑独立
- Task 6 (saveHistory 竞态) → 无依赖
- Task 7 (malformed HTML) → 无依赖
- Task 8 (首次启动引导) → 无依赖
- Task 9 (Python 后端不可用提示) → 需要 preload.js 新增 IPC 事件
- Task 10 (图片压缩) → 无依赖
- Task 11 (资源释放) → 无依赖
- Task 12 (Token 估算) → 无依赖
- Task 13 (Heartbeat) → 无依赖
- Task 14 (离线模式) → 无依赖
- Task 15-29 → 均可独立执行，无强依赖关系
- Task 30-35 → 均可独立执行，互不依赖

**推荐执行顺序**: Task 1→7（紧急修复）→ Task 8→14（高优先级）→ Task 15→29（中低优先级）→ Task 30→35（验证后修复）