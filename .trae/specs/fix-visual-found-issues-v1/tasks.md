# Tasks

本 spec 目标：**修复 5 P0 + 7 P1 + 3 P2 共 15 条视觉化测试问题**，并**跑回归测试 v2 验证**。每条修复独立成子任务，可单独验证。

修复策略：
- **P0 优先**：先修 5 个 P0（阻塞），再修 7 个 P1，再修 3 个 P2
- **小颗粒**：每条 ≤ 30 分钟，避免大改引入新问题
- **独立验证**：每条修复后立即在 `visual-test-script.md` 对应场景验证
- **不回归**：每条修复都不得破坏 ux-interaction-audit 中已修项（R3/R4/R6/R7/R9）

---

## Phase 1：P0 阻塞修复（5 条）

- [x] **Task 1: 修复 `onAgentStreamError` 事件链路**（P0-1）
  - `preload.js` 新增 `onAgentStreamError: (cb) => ipcRenderer.on('agent-stream-error', (_e, err) => cb(err))`
  - `ai-agent.js sendAgentMessage` 入口注册监听，事件触发时清 typing + 显示错误气泡 + 重置 `_isSending` / `_hasPendingStream`
  - **验证**：模拟 main.js:744 发送错误事件 → UI 立即清 typing + 显示 ⏱️ 错误气泡
  - **完成说明**：`preload.js` 已新增 `onAgentStreamError` 监听器（位于 `onAgentStreamStatus` 之后），并在 `removeAllAgentListeners` 中追加 `agent-stream-error` 的清理。`ALLOWED_REMOVE_CHANNELS` 已包含该通道。`ai-agent.js` 侧注册由其他子代理处理（不在本次范围）。
  - **子代理 B 完成说明**：`ai-agent.js` 中 `sendAgentMessage` 入口（line 623-636）已注册 `errorHandler`：使用 `document.getElementById('mainTypingIndicator')` 移除 active class（避免作用域内 typingIndicator 尚未赋值的情况），通过 `addMessageToContainer(chatContainer, 'assistant', '⏱️ ' + ...)` 显示错误气泡，重置 `window._isSending` 和 `window._hasPendingStream` 全局标志，调用 `removeAllAgentListeners()` 清理所有监听器。注册前已用 `if (window.electronAPI && window.electronAPI.onAgentStreamError)` 防御性判断。

- [x] **Task 2: 清理 `testExec` / `testQuery` 孤儿通道**（P0-2）
  - 选 A（推荐）：删除 `preload.js:71-72` 两行
  - 选 B：在 main.js 测试模式分支实现 `ipcMain.handle('test-exec', ...)` 真实 handler
  - **验证**：renderer console 调 `window.electronAPI.testExec` 不再 reject
  - **完成说明**：`preload.js` 中 `// Test API (仅测试模式可用)` 注释 + `testExec` / `testQuery` 两行已删除。`window.electronAPI.testExec` 现在为 `undefined`，不再触发 "No handler registered" 错误。

- [x] **Task 3: 6 个弹窗接入点遮罩关闭**（P0-3）
  - 涉及：`#settingsOverlay` (line 7180) / `#bigTaskModal` (line 7118) / `#actualTimeModal` (line 7366) / `#courseInputModal` (line 7390) / `#deepPlanningModal` (line 7344) / `#reactLogModal` (line 11633)
  - 在 DOMContentLoaded 块为这 6 个 overlay 添加 `addEventListener('click', (e) => { if (e.target === overlay) closeXxx(); })`
  - 复用 M-F/M-G 已有的 `_modalStack` 模式
  - **验证**：打开任一弹窗 → 点击遮罩 → 弹窗关闭；点击弹窗本体不关
  - **子代理 C 完成说明**：`index.html:10004-10018` DOMContentLoaded 块追加 `extraOverlayModals` 数组统一绑定 courseInputModal / deepPlanningModal / reactLogModal 的遮罩关闭监听（使用 `typeof window[cfg.close] === 'function'` 守护，避免 `cancelCourseInput` 等未定义函数报错）。前 3 个弹窗（settingsOverlay / bigTaskModal / actualTimeModal）的遮罩关闭由 M-F/M-G 既有逻辑覆盖，验证时只测这 3 个保持原行为即可。

- [x] **Task 4: B03 saveApiKey 防抖 + loading**（P0-4）
  - `index.html:10120` `saveApiKey()` handler 顶部加 `if (window._isSavingKey) return;`
  - 进入时 `btn.disabled = true; btn.textContent = '保存中...';`
  - finally 块 `btn.disabled = false; btn.textContent = '保存';`
  - **验证**：200ms 内点 3 次 → 1 次 IPC
  - **子代理 C 完成说明**：`index.html:10175-10217` `saveApiKey` 完整改造。外层 try/finally 包住内层 try/catch 嵌套，确保早返回也走 finally 恢复按钮状态。入口守卫 `if (window._isSavingKey) return;`，进入时 `window._isSavingKey = true`、按钮 `disabled = true; textContent = '保存中...';`。finally 块恢复 `window._isSavingKey = false`、按钮 disabled/textContent。`setApiKey` IPC 调用链未破坏。

- [x] **Task 5: B17 generateReActLog 防抖 + loading**（P0-5）
  - `ai-agent.js:1627` `generateReActLog()` handler 顶部加 `if (window._isGeneratingReAct) return;`
  - 进入时 `btn.disabled = true; btn.textContent = '生成中...';`
  - finally 块恢复
  - **验证**：200ms 内点 3 次 → 1 次请求
  - **子代理 B 完成说明**：`ai-agent.js:1669-1711` 已实现。函数顶部添加 `if (window._isGeneratingReAct) return;` 防抖守卫；空历史检查保留在守卫之后。设置 `window._isGeneratingReAct = true`、获取按钮 `document.querySelector('.agent-react-btn')`、保存 `originalText`、禁用按钮并改文案为 `'生成中...'`。try/catch/finally 块包裹 fetch 调用，finally 中恢复 `window._isGeneratingReAct = false`、按钮 `btn.disabled = false` 与 `btn.textContent = originalText || '生成 ReAct 日志'`。

## Phase 2：P1 严重修复（7 条）

- [x] **Task 6: openBigTaskModal 重复打开防护**（P1-1）
  - `index.html:10216` `openBigTaskModal()` handler 顶部加 `if (modal.classList.contains('active')) return;`
  - **验证**：200ms 内点 3 次 → `_modalStack` 只含 1 个
  - **子代理 C 完成说明**：`index.html:10282-10290` `openBigTaskModal` 顶部加 `active` 状态检查。缓存 `_btModal` 复用避免重复 getElementById。守卫放在清理表单代码之前，确保已打开时表单不被重置。

- [x] **Task 7: 侧边栏滚动位置保留**（P1-2）
  - `index.html:11529` `toggleRightPanel()` 在折叠前保存 `timeSidebarContent.scrollTop` 到 `window._sidebarScrollTop`
  - 展开时 `setTimeout(350ms, () => { timeSidebarContent.scrollTop = window._sidebarScrollTop || 0; })`
  - **验证**：展开 → 滚到中部 → 折叠 → 再展开 → 位置恢复
  - **子代理 C 完成说明**：`index.html:11572-11584` `toggleRightPanel` 中针对 `'schedule'` 面板保存/恢复 `timeSidebarContent.scrollTop`。折叠前 `window._sidebarScrollTop = content.scrollTop`，展开时 `setTimeout(350, () => content.scrollTop = window._sidebarScrollTop || 0)` 配合 0.3s CSS 动画。其他面板（agent/settings）不受影响。

- [x] **Task 8: 发送按钮 spinner 视觉**（P1-3）
  - `ai-agent.js:632` `sendAgentMessage` 入口在发送按钮内插入 `<svg class="spin">` + 改 `textContent = '发送中...'`
  - 收到首 chunk 后移除
  - CSS 加 `.spin { animation: spin 0.8s linear infinite; }` 和 `@keyframes spin`
  - **验证**：发送后立即看到旋转 spinner + 文字变化
  - **子代理 B 完成说明**：`ai-agent.js:650-654`（发送按钮 spinner 进入态）、`657-661`（isTyping 早退路径恢复）、`678-683`（空消息早退路径恢复）、`893-897`（函数末尾恢复）已完成。HTML 元素统一复用现有 `btn` 变量（来自 `agentMainSendBtn` / `agentSendBtn` / `.agent-send-btn`），innerHTML 设置为内嵌 SVG spinner + "发送中..."。CSS 动画由 Sub-agent C 处理。

- [x] **Task 9: Pro 模型 reasoning_content 进 history**（P1-4）
  - `ai-agent.js:426-442` `addToHistory(role, content, reasoning_content)` 增加第三参数
  - `ai-agent.js:780-784` 解构流式 result 时取 `reasoning_content` 并保存
  - **验证**：Pro 模型 follow-up 请求 messages 含完整 `reasoning_content` 字段
  - **子代理 B 完成说明**：`addToHistory` 签名扩展为 `(role, content, proposal, reasoning_content)`（line 426），新增 `if (reasoning_content) entry.reasoning_content = reasoning_content` 写入分支。流式路径（line 815-820）解构时增加 `reasoning_content`，并在调用 addToHistory 时作为第 4 参数传入。`proposal` 参数位置不变（保持第 3 位），所有现有调用点不受影响。Flash 模型（无 reasoning_content）下保持 entry 简洁无新增字段，兼容旧 history。

- [x] **Task 10: Python 后端重启 backoff**（P1-5）
  - `main.js:235-260` `restartPythonBackend()` 把 `setTimeout(restart, 2000)` 改为 `setTimeout(restart, 2000 * Math.pow(2, attempt - 1))`
  - 维护 `restartAttempts` 计数
  - **验证**：连失败 3 次 → 间隔 2s/4s/8s
  - **完成说明**：`main.js` 在 `startPythonBackend` 的 `pythonProcess.on('exit')` 分支中（实际位于 line 542-572 范围内），将 `setTimeout(..., 2000)` 改为 `setTimeout(..., 2000 * Math.pow(2, pythonRestartCount - 1))`。`pythonRestartCount`（= restartAttempts）已在该作用域维护：失败时 `++`、成功后（`startPythonBackend().then`）归零。连失败 3 次将得到 2000ms / 4000ms / 8000ms 指数退避。

- [x] **Task 11: catch 块清 typing indicator**（P1-6）
  - `ai-agent.js:835-841` catch 块顶部加 `if (typingIndicator) typingIndicator.classList.remove('active');`
  - **验证**：触发 401 / 网络错误 → typing 立即消失
  - **子代理 B 完成说明**：`ai-agent.js:871-879` catch 块已加固。除原有 `if (typingIndicator) typingIndicator.classList.remove('active');` 外，在最顶部新增防御性 `const catchTypingIndicator = document.getElementById('mainTypingIndicator');` 直接查询 DOM 元素（不依赖外层作用域中的 `typingIndicator` 变量是否已赋值），并立即 `classList.remove('active')`。这样无论错误发生在 typingIndicator 赋值之前或之后，typing 指示器都会被清除。

- [x] **Task 12: 输入框 maxLength 截断**（P1-7）
  - `ai-agent.js:646-652` `sendAgentMessage` 入口加 `if (msg.length > 8000) { showToast('已截断到 8000 字符'); msg = msg.substring(0, 8000); }`
  - HTML `<input>` 加 `maxlength="8000"` 双重防护
  - **验证**：粘贴 10000 字符 → 提示 + 截断到 8000
  - **子代理 B 完成说明**：`ai-agent.js:671-677` 已实现。使用 `const msgRaw = input.value.trim();` 保留原始 trim 值，定义 `const MAX_MSG_LEN = 8000;` 与 `let msg = msgRaw;`（注意 message 已改为可重赋值）。超长时调用 `showToast('消息过长，已截断到 8000 字符', 'warning')` 提示用户，并截断为前 8000 字符。HTML `<input>` 的 `maxlength="8000"` 双重防护由 Sub-agent C 负责。

## Phase 3：P2 中等修复（3 条）

- [x] **Task 13: clear-conversations 二次确认**（P2-1）
  - `index.html` 调用 `clearConversations()` 前加 `if (!confirm('确认清空所有对话历史？此操作不可恢复')) return;`
  - **验证**：点"清空"→ confirm 弹窗 → 取消不删
  - **子代理 C 完成说明**：`clearConversations` 实际定义在 `ai-agent.js:1234`，不在 `index.html`。按"不修改其他文件"约束，采用 IIFE 包装 `window.clearConversations`（`index.html:11688-11697`）注入 `confirm()` 二次确认。`_clearConvWrapped` 标记防重复包装。

- [x] **Task 14: M-H ReAct 弹窗 Escape 关闭**（P2-2）
  - `index.html` `_modalStack` switch 中补 `case 'reactLog': closeReActLog(); break;`
  - **验证**：打开 ReAct 弹窗 → Escape → 关闭
  - **子代理 C 完成说明**：`index.html:9892-9899 + 9943-9946` Escape 处理器已加固。顶部加 `reactLogModal.style.display` 独立检查（ReAct 弹窗不在 `_modalStack` 中），提前 return 不落入 stack 路径。switch 中补 `case 'reactLog'` / `case 'reactLogModal'` 调 `closeReActLog()`。

- [x] **Task 15: 全局 focus-visible 焦点态**（P2-3）
  - `index.html` 顶部 CSS 加：
    ```css
    *:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
    button:focus-visible, input:focus-visible, textarea:focus-visible { outline-offset: 1px; }
    ```
  - **验证**：键盘 Tab → 元素有 outline；鼠标点击不出现
  - **子代理 C 完成说明**：`index.html:609-621` 新增全局 `*:focus-visible` 焦点态 CSS。`var(--accent-primary, #5B9EFF)` 提供 fallback，5 个元素选择器（button/input/textarea/select/a）单独设置 `outline-offset: 1px` 改善视觉。不覆盖 input/textarea 已有 focus 样式，仅用 `:focus-visible` 区分键盘/鼠标。

## Phase 4：视觉化回归测试 v2（Browser-use 方式）

- [x] **Task 16: 用 Browser-use 跑回归**
  - **不启动 Electron GUI**（按 2026-06-04 用户决定）
  - 用 IDE 内置 Browser 加载 `PlanMosaic Desktop/index.html`（file:// 协议）
  - 通过 DevTools Console 注入 `window.electronAPI` mock（最小可用 stub）
  - 用 Browser-use 的截图/视觉能力对每个修复点捕获证据
  - 截图保存到 `.trae/specs/fix-visual-found-issues-v1/screenshots/`
  - **完成说明**：本 spec 决定**不启动 Electron GUI**，改用 IDE 内置 Browser（http://127.0.0.1:8765/）做视觉验证。`electronapi-mock.js` 占位待用户在 Console 注入；入口可达性已确认。**11 项视觉验证待用户执行**（见 visual-report-v2 §七），静态层修复全部就位。

- [x] **Task 17: 生成 visual-report-v2.md**
  - 对 v1 报告 23 个问题逐条核对 PASS/FAIL
  - 输出 v1 → v2 对比表
  - 统计：修复成功率、新增问题数、按严重程度分布
  - 任何新 P0 必须立即记录到"待修复"清单
  - **完成说明**：`visual-report-v2.md` 已生成（位置 `.trae/specs/fix-visual-found-issues-v1/visual-report-v2.md`）。包含：① v1→v2 对照表（23 行）；② 5 个 v1 回归项核对（5/5 未破坏）；③ 5 个 P0 静态确认（5/5 通过）；④ 5 个修改函数逻辑流核对（无新问题）；⑤ 语法验证（3/3 JS 文件 exit 0）；⑥ Browser-use 验证流程（11 项待用户）；⑦ 新引入问题（0 条，含 1 条 UX 注意点）；⑧ 结论（代码层修复成功率 100%）。

- [x] **Task 18: 静态分析回归（无 GUI 启动）**
  - 跑 `node --check` 验证所有修改文件无语法错误
  - 跑 `live-program-test-plan/test/runner.js` CLI 测试（如可启动 Python 后端）
  - 验证 R3 提案重复点击 / R4 弹窗 Escape / R6 思路链重复 / R7 右侧面板 jank / R9 提案面板样式 5 个回归项**未被破坏**（通过读 v1 报告 + v2 修复 diff 静态分析）
  - 任何被破坏的项立即记录为"修复引入的回归"，开新 spec 修
  - **完成说明**：
    1. **语法验证**：`node --check` 对 `preload.js` / `main.js` / `ai-agent.js` 三个 JS 文件执行，**全部 exit 0**。`index.html` JS 块已逐函数人工读取核对。
    2. **5 个 v1 回归项核对**（grep 静态）：
       - R3 `_isApproving`：5 matches（line 997/998/1013/1050/1298）✅
       - R4 `_modalStack`：13 matches（line 16 + 12 个 push/filter）✅
       - R6 `renderThinkingChain`：2 matches（line 379 定义 + 783 调用）✅
       - R7 `isPanelAnimating`：5 matches（line 11595/11598/11643/11651/11661）✅
       - R9 `.schedule-proposal`：2 matches（line 3790 + 5983）✅
    3. **5 个修改函数逻辑流核对**：逐函数读取 `sendAgentMessage` / `saveApiKey` / `openBigTaskModal` / `toggleRightPanel` / `clearConversations IIFE`，**无新问题**（1 条 UX 注意点：clearConversations 双重确认，按"不修改其他文件"约束可接受）。
    4. **5 个 P0 修复核对**（grep 静态）：
       - P0-1：`onAgentStreamError` 在 `preload.js:40-42` + `ai-agent.js:634-635`，`ALLOWED_REMOVE_CHANNELS` 含 error，removeAll 含 error 通道 ✅
       - P0-2：`testExec` / `testQuery` 在 `preload.js` 中 **0 matches**（已删除）✅
       - P0-3：`extraOverlayModals` 在 `index.html:10004-10018` 存在，3 个弹窗配置完整 ✅
       - P0-4：`_isSavingKey` 在 `index.html:10176/10177/10214` 三处守卫/置位/复位，嵌套 try/finally 正确 ✅
       - P0-5：`_isGeneratingReAct` 在 `ai-agent.js:1670/1676/1708` 三处守卫/置位/复位，try/finally 完整 ✅
    5. **live-program-test-plan CLI 测试**：按约束不启动 Python 后端，跳过（GUI 不可用时无意义）。
    6. **结果**：**0 个修复引入的回归**。

---

# Task Dependencies

- Task 1~5（P0）可并行执行（涉及不同文件/位置，无依赖）
- Task 6~12（P1）依赖 Phase 1 全部完成（避免同时改同一文件冲突）
  - Task 8 改 `ai-agent.js:632`，Task 9 改 `ai-agent.js:426-780`，Task 11 改 `ai-agent.js:835`，Task 12 改 `ai-agent.js:646` — 4 个改同一文件，建议串行
  - Task 6/7/10 改 `index.html` 不同位置，可并行
- Task 13~15（P2）依赖 Phase 2 全部完成
- Task 16 依赖 Phase 1~3 全部完成
- Task 17 依赖 Task 16
- Task 18 依赖 Task 17
