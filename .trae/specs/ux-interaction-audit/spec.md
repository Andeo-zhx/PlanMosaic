# Electron 桌面端交互逻辑与用户体验审计 Spec

## Why

对 PlanMosaic Electron 桌面端 `index.html`（~10462行）和 `ai-agent.js`（~886行）进行全面的交互逻辑审计，发现**大量严重 UX 缺陷**：静默错误吞没（16处）、竞态条件（提案按钮重复提交、数据刷新不可靠）、无加载状态导致重复提交、关键操作无确认对话框、弹窗缺少 Escape/遮罩层关闭、流式监听器内存泄漏、非 Electron 环境功能不完整等。这些问题导致用户体验直线下降——数据丢失、操作无反馈、界面卡死、重复操作无法撤回。需要系统性修复交互逻辑。

## What Changes

### 🔴 严重交互缺陷（Priority: CRITICAL）

- **16 处静默错误吞没**：`catch {}` / `catch(() => {})` 无任何用户反馈。主题加载失败、数据保存失败、WordMosaic 注入失败、画像生成失败、深度规划保存失败等全部静默，用户完全不知道功能已损坏。
- **提案按钮可无限重复点击** `ai-agent.js:282-283, L543-573`：确认/取消后按钮不隐藏/不禁用，用户可多次点击导致提案重复执行、数据错乱。
- **保存操作无加载状态 + 按钮无禁用** `index.html:8826, L9333, L10230`：`saveSchedule()`、`saveBigTask()`、`saveCurrentTemplate()` 等保存期间无 loading 指示器、按钮不禁用，用户双击导致重复提交和数据不一致。
- **数据刷新竞态条件** `ai-agent.js:616, L629`：`refreshScheduleData()` 使用 100ms `setTimeout` 等待数据持久化，完全不可靠。磁盘写入超过 100ms 时 UI 显示过期数据。
- **流式监听器内存泄漏** `ai-agent.js:415-417, L469`：流式请求异常时 `onAgentStreamChunk/onAgentStreamDone` 监听器未移除，每次异常累计一个僵尸监听器，造成内存泄漏。
- **`saveAllDataDebounced` 无 `beforeunload` 保护** `index.html:7591`：防抖延迟 1500ms，用户在此期间关闭窗口导致云端未同步数据永久丢失。
- **双路径对话历史写入** `ai-agent.js:190-192, L430, L464`：普通消息和含 proposal 消息在不同代码路径写入 `conversationHistory`，顺序错乱时导致历史记录遗漏或重复。

### 🟠 高风险交互缺陷（Priority: HIGH）

- **日程任务即时删除无确认** `index.html:8679, L8715, L8684`：`removeSlot()`、`removeTask()`、`deleteSlot()` 直接操作数组移除以删除，无任何确认对话框或撤销机制，用户误操作导致数据永久丢失。
- **多处弹窗缺失 Escape/遮罩层关闭** `index.html:2303, L1817, L2284`：大任务弹窗、实际用时弹窗、日程编辑器弹窗不支持 Escape 键和遮罩层点击关闭，用户受困于弹窗中。
- **表单无必填字段指示** `index.html:2448`：所有 `form-label` 无星号等视觉标记指示必填字段，用户提交后才通过 `alert()` 报错。
- **发送按钮禁用逻辑不完整** `ai-agent.js:341-358`：`isTyping` 只由 `typeText()` 管理，非打字渲染路径中 `isTyping` 不会正确设置，快速双击可发送两条消息。
- **非 Electron 环境功能残缺** `ai-agent.js:67, L606, L597`：启动欢迎扫描、对话清除、对话归档等功能仅在 Electron 环境可用，Web 模式下点击无任何反应。
- **图片上传嵌入完整 base64 到 DOM** `ai-agent.js:353, L579-L592`：大图 base64 字符串直接嵌入 `innerHTML`，主线程阻塞、内存爆炸，且存在 XSS 风险。
- **深度规划模式零等待指示** `ai-agent.js:834`：消息发送后到 API 响应返回前无任何 loading/typing 指示器，用户盯着空白屏幕等待，不知道是否在工作。
- **表单验证滞后** `index.html:8590`：开始/结束时间有效性校验仅在 `onchange` 时触发，不是 `oninput`/`onblur`，用户可提交无效时间。

### 🟡 中等交互问题（Priority: MEDIUM）

- **11 处使用侵入式 `alert()` / `confirm()`** `index.html`：`alert('课表保存成功！')`、`confirm('确定要删除吗？')` 等方式中断用户流程，应改用 toast 通知。
- **用户画像生成失败后无限重试** `ai-agent.js:520, L490`：`_lastProfileGenCount` 不更新导致每次保存都重试生成，浪费 API 调用。
- **对话清除不重置全局状态** `ai-agent.js:609`：清除后 `isTyping`、`uploadedImages`、`typingTimeout` 未重置，可能产生意外行为。
- **提案审批成功反馈不明确** `ai-agent.js:561`：审批成功后仅显示"已完成。"，不说明具体完成了什么操作。
- **深度规划无 UI 状态指示** `ai-agent.js` 全局：`isDeepPlanningMode` 仅用于内部逻辑，主界面无任何地方显示当前处于深度规划模式。
- **归档操作无确认对话框** `ai-agent.js:596`：归档与清除不同，无确认即可执行且不可恢复。
- **加载失败无降级 UI** `ai-agent.js:62, L8.2`：`loadData()` 失败后 `window.scheduleData` 为 undefined，后续引用崩溃，无"加载失败，请刷新"降级界面。

### 🔵 架构问题（Priority: LOW）

- **多层异步嵌套时序不确定** `ai-agent.js:32-37`：`setTimeout` 嵌套 `setTimeout` 注册事件和启动扫描，modal 可能尚未挂载。
- **`innerHTML +=` 拼接的 XSS 风险** `index.html`：56 处 `innerHTML` 直接赋值（已在 electron-security-audit 中覆盖，此处仅标记交互影响）。
- **防抖保存与云端同步时序不一致** `index.html:7584-7606`：本地同步保存，云端 fire-and-forget，如云端失败用户无感知。

## Impact

- **Affected specs**: `electron-security-audit`（补充交互层面审计）、`desktop-agent-centric-redesign`（Agent 交互流程相关）
- **Affected code**:
  - `index.html` — 修复静默 catch、添加加载状态、弹窗 Escape/遮罩关闭、删除确认、toast 替换 alert、表单验证强化
  - `ai-agent.js` — 修复提案按钮竞态、流式监听器泄露、非 Electron 功能补全、数据刷新时序、错误提示完善、状态重置

## ADDED Requirements

### Requirement: All error handlers MUST provide user-visible feedback
所有 `catch {}` / `catch(() => {})` 空块必须替换为至少 toast 通知或内联错误提示。用户必须知道操作是否成功。

#### Scenario: 数据保存失败时用户收到通知
- **WHEN** 日程保存因磁盘满失败
- **THEN** 界面显示 toast "保存失败，请检查磁盘空间"，而非静默忽略

#### Scenario: 主题加载失败有降级行为
- **WHEN** localStorage 损坏导致主题读取失败
- **THEN** 应用使用默认浅色主题并继续运行，不比静默崩溃

### Requirement: Proposal approve/reject buttons MUST be disabled after action
提案确认/取消按钮执行后必须禁用或隐藏，防止重复点击。审批期间显示 loading 状态。

#### Scenario: 用户确认提案后按钮消失
- **WHEN** 用户点击提案"确认"按钮
- **THEN** 按钮变为"处理中..."并禁用，完成后按钮区域替换为"已完成"文本，无法再次点击

#### Scenario: 用户拒绝提案后不可再确认
- **WHEN** 用户点击提案"取消"按钮
- **THEN** 按钮区域替换为"已取消"文本，确认按钮不可见

### Requirement: All save/delete operations MUST show loading state and disable button
所有修改数据的操作（保存日程/任务/大任务/模板、删除操作）必须显示 loading 指示器并禁用操作按钮，防止重复提交。

#### Scenario: 保存日程按钮防重复
- **WHEN** 用户在编辑弹窗中快速双击"保存"按钮
- **THEN** 仅触发一次保存，第二次点击被忽略（按钮已禁用）

### Requirement: Data refresh after tool execution MUST use reliable signal, not arbitrary timeout
Agent 工具执行后的数据刷新不可使用 `setTimeout(100)` 等任意延迟。应使用 IPC 返回的确认信号或 Promise 链确保数据已持久化后再刷新。

#### Scenario: 工具修改数据后 UI 正确显示
- **WHEN** Agent 执行 `add_schedule` 工具成功
- **THEN** 日历立即显示新添加的日程，不出现旧数据闪烁

### Requirement: Stream listeners MUST be cleaned up on all exit paths
流式请求的 `onAgentStreamChunk` / `onAgentStreamDone` / `onAgentStreamStatus` 监听器必须在所有退出路径（成功、异常、取消）中移除，防止内存泄漏。

#### Scenario: 流式请求异常中断后无内存泄漏
- **WHEN** 网络断开导致流式 API 请求异常
- **THEN** 所有流监听器被移除，下次对话正常注册新监听器

### Requirement: saveAllDataDebounced MUST flush pending saves before window close
防抖保存必须在 `beforeunload` 事件中立即 flush，确保用户关闭窗口前数据已同步到云端。

#### Scenario: 关闭窗口前数据被保存
- **WHEN** 用户修改日程后立即关闭窗口
- **THEN** `beforeunload` 触发即时保存，数据不丢失

### Requirement: Destructive actions MUST have confirmation with context
删除时间段、删除任务等破坏性操作在执行前必须有确认提示（toast/对话框），说明要删除的内容，并提供显式确认按钮。

#### Scenario: 误删任务可拦截
- **WHEN** 用户误点任务旁的删除按钮
- **THEN** 弹出 toast "确定要删除任务「复习数学」吗？" 含确认/取消按钮，取消则不执行删除

### Requirement: All modals MUST support Escape key and overlay click to close
所有弹窗（大任务、日程编辑器、实际用时等）必须支持 Escape 键和遮罩层点击关闭。

#### Scenario: 用户按 Escape 关闭弹窗
- **WHEN** 用户在大任务编辑弹窗中按 Escape
- **THEN** 弹窗关闭（如有未保存修改先询问是否放弃）

### Requirement: Forms MUST mark required fields visually and validate inline
必填字段必须用星号或视觉标记标识，验证错误在字段旁内联显示而非提交后 `alert()`。

#### Scenario: 必填字段有视觉提示
- **WHEN** 用户打开日程编辑表单
- **THEN** 必填字段（如活动名称、时间）有红色星号标记，空字段提交时边框变红并显示提示文字

### Requirement: Non-Electron environment MUST have parity features or graceful degradation
Web 模式下的功能缺失（欢迎扫描、对话清除/归档、深度规划）必须有降级处理。不可用的功能按钮应显示 disabled 状态或提示"桌面版可用"。

#### Scenario: Web 模式清除对话按钮
- **WHEN** 用户在 Web 模式点击"清除对话"
- **THEN** 正常执行清除（纯前端实现），而非静默无反应

### Requirement: AI send button MUST prevent double-send reliably
发送按钮必须在 `sendAgentMessage` 函数入口即禁用，而非在代码中间某处。所有早期返回路径也需正确恢复按钮状态。

#### Scenario: 快速双击不发送两条消息
- **WHEN** 用户快速双击发送按钮
- **THEN** 第一条消息发送后按钮立即禁用，第二次点击被忽略

### Requirement: Image upload MUST NOT embed raw base64 into DOM
图片上传预览使用 `createObjectURL` 而非 base64 嵌入 `innerHTML`。大图显示缩略图，原图仅在上传时使用。

#### Scenario: 大图上传不卡死 UI
- **WHEN** 用户选择 5MB 图片
- **THEN** 预览区显示缩略图，DOM 不嵌入完整 base64，UI 不卡顿

### Requirement: Deep Planning mode MUST show sending indicator
深度规划消息发送后、API 响应返回前必须显示 loading/typing 指示器，让用户知道系统正在工作。

#### Scenario: 深度规划等待有视觉反馈
- **WHEN** 用户在深度规划中发送消息
- **THEN** 立即显示 "Mosa 正在深度思考..." 动画，无需等到 API 返回

### Requirement: Toast notification system MUST replace alert()/confirm()
所有 `alert()` 和 `confirm()` 调用必须替换为非侵入式 toast 通知系统，支持自动消失和手动关闭。

#### Scenario: 保存成功用 toast 通知
- **WHEN** 日程保存成功
- **THEN** 右上角弹出 toast "日程已保存 ✓"，3 秒后自动消失，不阻断用户操作

## MODIFIED Requirements

### MODIFIED: Conversation clear/reset MUST reset all local state
对话清除操作必须重置所有全局状态变量：`isTyping`、`uploadedImages`、`typingTimeout`、`conversationHistory`、DOM 容器。

#### Scenario: 清除后从头开始
- **WHEN** 用户清除对话历史
- **THEN** 聊天区显示初始状态（欢迎消息），所有内部状态干净如初

### MODIFIED: Proposal approval feedback MUST describe the performed action
审批成功后的反馈消息必须说明具体操作内容，而非简略"已完成。"。例如"已为 2024-05-18 添加「复习高数」"。

#### Scenario: 审批反馈具体化
- **WHEN** 用户确认"添加 3 个时间段的日程"提案
- **THEN** 反馈消息显示 "已添加 3 项安排到 2024-05-18 ✓"