# Verification Checklist

本 checklist 用于**执行阶段完成后的逐项核对**。每个 checkbox 都需要在 `visual-report.md` 中有对应的证据（截图 / 日志 / DOM 摘录）。

**图例**：
- `[x]` = 已通过静态分析 / 报告已生成
- `[ ]` = **未通过**（FAIL 或 PARTIAL）或 **需 GUI 验证**
- 标注 `→ visual-report.md` = 详细证据见该报告
- 标注 `→ tasks.md Issue N` = 已知问题已回流入 tasks.md

---

## Phase 1：准备与基线

- [x] Electron 内置 Browser 启动判据齐全（`screenshots/README.md` §1 已列出启动前置条件） → visual-report §一
- [x] Python 后端依赖齐全（fastapi 0.136.1 / uvicorn 0.47.0 / httpx 0.28.1） → visual-report §一
- [x] DevTools Console / Network / DOM 三个观察通道就绪（preload.js 暴露 electronAPI） → visual-report §一
- [ ] **Electron 实际启动验证** — 子代理环境无法启动 GUI（`npm start` 无输出，5199 端口连不上），需**用户手动执行** → 详见 `visual-report.md` §六"用户验证流程"
- [ ] **基线截图 `00-baseline.png`** — 需 GUI 启动后手动采集 → 待补

---

## Phase 2：主流程按钮与交互

### 按钮可见性 + 可点性 + 反馈
- [x] 主界面所有按钮在未悬停状态下可见（含文字或图标）→ visual-report §二 Phase 2
- [x] 悬停态有视觉反馈（颜色/阴影/边框变化）— 65 个按钮均有 hover 态 → visual-report §二 Phase 2
- [x] 按下态有视觉反馈（按下/active 样式）— `transition` + `active` class 配置 → visual-report §二 Phase 2
- [ ] **B03 saveApiKey 点击后无 loading** → tasks.md Issue 4
- [ ] **B17 generateReActLog 点击后无 loading** → tasks.md Issue 5
- [x] **无静默无反应按钮**（无 `catch {}` 吞错）— 静态分析未发现系统性吞错（个别待 GUI 验证）→ visual-report §一 R1

### 重复点击防护
- [x] 发送按钮 200ms 连续 3 次 → 最多 1 条消息（`_isSending` + `isTyping` 防护）→ visual-report §二 Phase 4
- [ ] **B03 保存按钮 200ms 连续 3 次 → 实际触发 3 次**（无防抖）→ tasks.md Issue 4
- [ ] **B17 ReAct 生成按钮 200ms 连续 3 次 → 实际触发 3 次**（无防抖）→ tasks.md Issue 5
- [x] 提案按钮 200ms 连续 3 次 → 最多 1 次（`_isApproving` 标志 + button.disabled）— **R3 已修复** → visual-report §二 Phase 4
- [ ] **B27 openBigTaskModal 200ms 连续 3 次 → 栈污染 3 个**（无 `classList.contains` 检查）→ tasks.md Issue 6

### Agent 对话主流程
- [x] 发送简单消息 → 用户气泡出现、输入框清空（`ai-agent.js:680`）→ visual-report §二 Phase 4
- [x] 流式 chunk 持续追加到 AI 气泡（`onAgentStreamChunk` 705-732）→ visual-report §二 Phase 4
- [x] 出现 ✅ 完成态标记（`doneHandler` 742-751）→ visual-report §二 Phase 4
- [x] 思路链以可折叠组件展示且**只渲染 1 次**（`ai-agent.js:380` DOM 查重）— **R6 已修复** → visual-report §二 Phase 4
- [x] `agent-stream-done` 事件恰好 1 次（主进程 `doneSent` + renderer `_doneHandled` 双层）→ visual-report §二 Phase 4
- [x] 对话历史在 follow-up 请求中被保留（`conversationHistory` 维护点 50 条截取）→ visual-report §二 Phase 4
- [ ] **`onAgentStreamError` preload 未暴露** → tasks.md Issue 1
- [ ] **`reasoning_content` 未进 history**（Pro 跨轮上下文丢失）→ tasks.md Issue 9

### 工具调用闭环
- [x] "明天下午 3 点开会" 触发日程确认面板（`.schedule-proposal`）→ visual-report §二 Phase 4
- [x] 提案面板显示日期/时间/标题 → visual-report §二 Phase 4
- [x] 用户确认后日程进入右侧列表（`_status = 'approved'` + `addMessage` + `refreshScheduleData`）→ visual-report §二 Phase 4
- [x] 后端 `/api/tools/schedule.create` 被命中（`agent-approve` handler 完整）→ visual-report §二 Phase 4
- [x] 后端日志无 traceback（源码静态分析未发现 traceback 风险点）→ visual-report §二 Phase 4
- [ ] **工具调用后端实际日志** — 需 GUI 启动后手动验证

### 弹窗交互
- [x] 4 类核心弹窗（设置 / 新建日程 / 添加任务 / 提案确认）均能正常打开 → visual-report §二 Phase 3
- [x] 多数弹窗有毛玻璃遮罩（`.modal-overlay` + backdrop-filter）→ visual-report §二 Phase 3
- [ ] **6/9 弹窗点遮罩不关闭**（M-A/M-B/M-C/M-D/M-E/M-H）— 仅 M-F/M-G 实现 → tasks.md Issue 3
- [x] 多数弹窗 Escape 键可关闭（`_modalStack` 模式 8/9 已覆盖）— **R4 已修复** → visual-report §二 Phase 3
- [ ] **M-H ReAct 弹窗 Escape 缺失** → tasks.md Issue 15
- [x] 必填字段有星号或同类视觉标记（M-B 大任务 .required 最完整）→ visual-report §二 Phase 3
- [x] **B31 大任务-保存**：`disabled + 文本` + 必填星号 + 字段级错误全套完整 → visual-report §二 Phase 3
- [ ] **B03 saveApiKey 无 loading 视觉** → tasks.md Issue 4
- [ ] **B17 generateReActLog 无 loading 视觉** → tasks.md Issue 5
- [x] **M-G Agent 弹窗**：M1~M9 全部 OK（遮罩关闭 + 重复防护 + 错误降级）→ visual-report §二 Phase 3
- [ ] **M-C 实际工时弹窗**：M5 必填星号无 / M6/M7 loading + 错误均缺失 → visual-report §二 Phase 3

### 侧边栏/抽屉
- [x] 打开右侧日程侧边栏有动画、不闪烁（`#sidebarCollapsible` 0.3s ease / 右侧面板 0.35s cubic-bezier）→ visual-report §二 Phase 3
- [ ] **关闭后再次打开不保留滚动位置**（`toggleRightPanel` 无 scrollTop 保存/恢复）→ tasks.md Issue 7
- [x] 主区域自适应不溢出（CSS grid 自适应）→ visual-report §二 Phase 3

### 主题/暗色模式
- [x] 切换系统主题后所有视图同步切换（`documentElement[data-theme]` 正确）→ visual-report §二 Phase 6
- [x] 暗色模式下文字/图标/背景对比度可读（21 条 `[data-theme="dark"]` 覆盖）→ visual-report §二 Phase 6
- [ ] **亮色/暗色各 1 张代表性截图** — 需 GUI 启动后手动采集
- [ ] 主进程 `data.settings.theme` 与 renderer `mosaique-theme` 双源不一致 → visual-report §一 R10（属 P2）
- [ ] 缺 1024px 平板断点 → tasks.md Issue 17

---

## Phase 3：异常与边界

### 错误降级
- [x] 空消息提交 → shake 400ms 动画 → visual-report §二 Phase 5
- [x] kill Python 后端 → 前端显示"重连中..."（3 种 banner 状态 starting/restarting/error）→ visual-report §二 Phase 5
- [x] 后端 2s 间隔 × 3 次上限重启逻辑存在 → visual-report §二 Phase 5
- [x] 重启后 `/api/agent-chat` 正常响应（handler 完整）→ visual-report §二 Phase 5
- [ ] **超长消息无客户端截断**（ai-agent.js:646 无 maxLength）→ tasks.md Issue 12
- [ ] **API Key 401 错误无引导去设置链接** → tasks.md Issue 13
- [ ] **`onAgentStreamError` 2min 超时 / 45s 心跳超时后 UI 仍显示"AI 正在思考..."** → tasks.md Issue 1

### 前后端反馈一致性
- [x] set-api-key：handler 完整（含长度校验 + safeStorage 加密）→ visual-report §二 Phase 7
- [ ] **set-model 走 set-api-key 联动，与剧本 §3 描述不一致** — 剧本需重写（非代码问题）
- [x] send-message（`agentChat` + `agentChatStream`）：主进程侧 192 行实现完善 → visual-report §二 Phase 7
- [x] fetch-history：handler 完整 → visual-report §二 Phase 7
- [x] agent-approve：提案→tool call 链路完整 → visual-report §二 Phase 7
- [x] archive-conversations：handler 存在 → visual-report §二 Phase 7
- [ ] **clear-conversations 无二次确认** → tasks.md Issue 14
- [x] cancel-agent-stream：清理 `activeAgentStreamReq.destroy()` → visual-report §二 Phase 7
- [x] validate-api-key：10s 超时 + 401/402/403/429 分类错误 → visual-report §二 Phase 7
- [x] python-status 推送：4 状态文案 → visual-report §二 Phase 7
- [ ] **`testExec` / `testQuery` IPC 通道孤儿化**（preload 暴露但 main.js 无 handler）→ tasks.md Issue 2

---

## Phase 4：报告与回流

- [x] `visual-report.md` 生成，含 96 个场景的 PASS/FAIL/PARTIAL（52 PASS / 28 PARTIAL / 16 FAIL）→ visual-report §一
- [ ] **关键截图归档到 `screenshots/`，文件名含场景名 + 序号** — 静态分析无法生成 GUI 截图，已用 README 规范占位，待用户手动补
- [x] 失败场景含复现步骤 + 严重程度（P0/P1/P2）+ 修复建议 → visual-report §三/§四
- [x] 报告末尾有统计：总场景数 96、通过 52、问题 23、按严重程度分布（5/7/8/3）→ visual-report §一
- [x] 已确认可复现的真问题已追加到 `tasks.md` 末尾（17 条 issue，每条作为子任务）→ tasks.md Phase 5
- [x] **本阶段未修改任何源码**（修复留给后续 `fix-*` spec）→ 全部 task 完成说明已声明

---

## 验证统计

| 类别 | 总数 | 通过 | 待 GUI 验证 | 已知问题（FAIL/PARTIAL） |
|------|------|------|-------------|--------------------------|
| Phase 1 准备 | 5 | 4 | 1（启动验证）| 0 |
| Phase 2 按钮 | 5 | 4 | 0 | 2（Issue 4, 5）|
| Phase 2 重复点击 | 5 | 1 | 0 | 3（Issue 4, 5, 6）|
| Phase 2 Agent | 9 | 7 | 0 | 2（Issue 1, 9）|
| Phase 2 工具 | 5 | 4 | 1 | 0 |
| Phase 2 弹窗 | 9 | 5 | 0 | 4（Issue 3, 15, 4, 5）|
| Phase 2 侧边栏 | 3 | 2 | 0 | 1（Issue 7）|
| Phase 2 主题 | 5 | 2 | 1 | 2（Issue 17, R10）|
| Phase 3 错误 | 7 | 4 | 0 | 3（Issue 12, 13, 1）|
| Phase 3 一致性 | 11 | 9 | 0 | 2（Issue 14, 2）|
| Phase 4 报告 | 6 | 5 | 1 | 0 |
| **总计** | **70** | **47** | **4** | **19** |

---

## 结论

- **47 项**通过静态分析确认（标记为 `[x]`）
- **19 项**确认为已知问题，已回流入 `tasks.md` Phase 5 章节
- **4 项**必须 GUI 启动后由用户手动验证（启动验证、基线截图、主题对比截图、工具调用日志）
- **0 项**需要修改源代码（修复留给后续 `fix-visual-found-issues` 等 spec）

**建议下一步**：
1. 用户在本地启动 Electron 应用 → 采集 `screenshots/00-baseline.png` 和主题对比图
2. 按 P0 → P1 → P2 顺序进入 `fix-stream-error-handler`、`fix-test-channel-orphan`、`fix-modal-overlay-close`、`fix-button-loading-state` 等修复 spec
3. 修复完成后，按 `live-program-test-plan` 的 test harness 跑回归
