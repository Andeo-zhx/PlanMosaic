# Phase 4: Agent 对话流程静态分析

> **目标**：对照 `visual-test-script.md` §2.1（Agent 对话主流程）和 §2.2（工具调用），逐路径静态分析 `ai-agent.js` 的实现。
>
> **审计范围**：
> - 发送消息路径：`sendAgentMessage` (ai-agent.js:614)
> - 流式监听：`onAgentStreamChunk` / `onAgentStreamDone` / `onAgentStreamStatus` 注册与清理
> - 思路链：`renderThinkingChain` (ai-agent.js:379) 和 reasoning_content 处理
> - 工具调用闭环：`approveProposal` (ai-agent.js:954) → IPC → 后端
> - 上下文保留：`conversationHistory` 维护 + `historySlice` 截取

---

## 1. 发送消息路径分析

### 1.1 `sendAgentMessage()` 完整调用链

**文件位置**：`ai-agent.js:614-857` (244 行)

**关键步骤拆解**：

| 步骤 | 行号 | 行为 | 是否符合剧本 §2.1 |
|------|------|------|------------------|
| 防抖进入 | 615-616 | `if (window._isSending) return; _isSending = true;` | ✅ |
| 网络检查 | 621-624 | `if (!navigator.onLine) showToast('该功能需要网络连接')` | ✅ 但仅在 Electron 之外有意义 |
| 按钮 disable | 632 | `if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }` | ⚠️ 无 loading 文本 |
| typing 检查 | 634-637 | `if (isTyping) return;` — 但 finally 中**未重置 isTyping** | ⚠️ 边界场景 |
| listener 清理 | 638-640 | `if (getIsElectron() && ...removeAllAgentListeners && !_hasPendingStream) removeAllAgentListeners()` | ✅ |
| 输入框选择 | 642 | 主面板 vs mini（基于 offsetParent） | ✅ |
| 空消息 + 无图 | 646-653 | `if (!msg && uploadedImages.length === 0) { input.classList.add('shake-input'); setTimeout(remove, 400); return; }` | ✅ |
| 用户气泡创建 | 680 | `if (msg) { addMessageToContainer(chatContainer, 'user', msg); input.value = ''; input.style.height = 'auto'; }` | ✅ |
| typing 显示 | 682 | `if (typingIndicator) typingIndicator.classList.add('active');` | ✅ |
| 流式 listener 注册 | 755-757 | `onAgentStreamChunk(streamHandler); onAgentStreamDone(doneHandler); onAgentStreamStatus(statusHandler);` | ✅ |
| history 截取 | 759-769 | `slice(-50)` + token 估算 + 自动截断 | ✅ |
| 发起 stream IPC | 771-775 | `await window.electronAPI.agentChatStream({...})` | ✅ |
| 完成后保存 | 779-784 | `if (data.response) { addToHistory('assistant', content, proposal); await saveHistory(); }` | ✅ |
| 异常处理 | 835-841 | `catch` → `addMessageToContainer(..., errorMsg)` | ✅ |
| finally | 842-851 | `window._isSending = false;` + 延迟 500ms 后 `removeAllAgentListeners()` | ⚠️ 性能问题 |

**总体结论**：**PARTIAL** — 核心路径完整，3 个细节需优化。

---

### 1.2 输入框清空时机
- **行号**：`ai-agent.js:680`
- **实现**：`if (msg) { addMessageToContainer(chatContainer, 'user', msg); input.value = ''; input.style.height = 'auto'; }`
- **时机**：用户气泡创建后**立即**清空
- **结论**：✅ **PASS** — 符合剧本 §2.1.2 预期"输入框清空"，且在 IPC 触发**之前**清空

### 1.3 用户气泡创建时机
- **行号**：`ai-agent.js:680` `addMessageToContainer(chatContainer, 'user', msg)`
- **时序**：在 `if (typingIndicator) typingIndicator.classList.add('active')`（line 682）**之前**
- **结论**：✅ **PASS** — 用户气泡立即出现（不等待 AI），符合剧本 §2.1.3 预期

### 1.4 流式监听器注册
- **行号**：`ai-agent.js:755-757`
- **handler 定义位置**：
  - `streamHandler` (line 705-732)：处理 `content` / `reasoning` / `retry` 三种类型
  - `statusHandler` (line 734-740)：处理 `thinking` / `executing_tools` 状态
  - `doneHandler` (line 742-751)：处理完成事件
- **注册**：`onAgentStreamChunk(streamHandler); onAgentStreamDone(doneHandler); onAgentStreamStatus(statusHandler);`
- **结论**：✅ **PASS** — 3 个监听器全部注册

### 1.5 思路链（reasoning_content）渲染路径
- **后端 SSE 事件类型**：`main.js:831` `if (parsed.type === 'content' || parsed.type === 'reasoning')`
- **主进程转发**：`event.sender.send('agent-stream-chunk', parsed);`（main.js:832）
- **renderer 接收**：`streamHandler` (ai-agent.js:723-725) `else if (chunk.type === 'reasoning') { div._thinkingContent += chunk.content; }`
  - **关键**：reasoning_content **不立即渲染**，仅累积到 `div._thinkingContent`
- **最终渲染**：`doneHandler` (line 747) `renderThinkingChain(div, streamedContent, div._thinkingContent);`
- **结论**：✅ **PASS** — reasoning_content 在 done 事件中**一次性**渲染

### 1.6 思路链去重保护
- **行号**：`ai-agent.js:380` `if (messageDiv.querySelector('.thinking-process')) return;`
- **触发时机**：`renderThinkingChain` 入口
- **保护机制**：DOM 查询 `'.thinking-process'` 是否已存在，存在则提前返回
- **结论**：✅ **PASS** — ux-interaction-audit R6 缺陷**已修复**

### 1.7 监听器清理（异常路径）
- **正常路径清理**：`doneHandler` (line 748-750) — 显式 `removeListener('agent-stream-chunk' / 'done' / 'status', ...)`
- **异常路径清理**：`finally` 块 (line 842-851) — 500ms 延迟后 `removeAllAgentListeners()`
- **关闭弹窗清理**：`closeAgentModal` (line 264-280) — `removeAllAgentListeners(); cancelAgentStream();`
- **cancel 流清理**：`cancel-agent-stream` IPC (main.js:897-907) — `activeAgentStreamReq.destroy(); clearInterval(activeAgentStreamHeartbeat);`

**风险点**：
- ⚠️ **finally 中 500ms 延迟是硬编码** — 任何"快速发下一条消息"场景都会感受到延迟
- ⚠️ `doneSent` 在主进程中（main.js:727），但 renderer 的 `_hasPendingStream` 是独立标志，**两个状态可能不同步**（例如后端主动 cancel 时）
- ✅ 但 done 事件触发 `event.sender.send('agent-stream-done')`（main.js:825）会调用 `doneHandler`，正常路径 OK

**结论**：**PARTIAL** — 正常路径和 cancel 路径都清理，但 500ms 硬延迟是性能瓶颈

---

## 2. done 事件去重分析

### 2.1 `doneSent` 标志 / `removeAllAgentListeners` 调用点

**主进程 (main.js)**：
| 位置 | 行为 |
|------|------|
| `let doneSent = false;` | line 727 |
| `if (eventData === '[DONE]') { ... doneSent = true; event.sender.send('agent-stream-done'); ... }` | line 821-827 |
| `res.on('end', () => { if (!doneSent) event.sender.send('agent-stream-done'); ... })` | line 865-872 |
| `res.on('error', ...)` | line 873-877 |

**Renderer (ai-agent.js)**：
| 位置 | 行为 |
|------|------|
| `const doneHandler = () => { ... if (div._doneHandled) return; div._doneHandled = true; ... }` | line 742-751 |
| `window._hasPendingStream = true;` (line 753) | 进入时设置 |
| `window._hasPendingStream = false;` (line 743) | doneHandler 中重置 |

### 2.2 正常路径：done 事件是否只触发 1 次？

**流程**：
1. 流式请求进入，`_hasPendingStream = true`
2. SSE 数据流持续发送 `content` / `reasoning` chunks
3. 后端发 `[DONE]` → main.js:821 触发 `event.sender.send('agent-stream-done')`（仅 1 次，因 `return;` 在 line 827）
4. `res.on('end')` 检查 `if (!doneSent)` 已被 `doneSent = true` 守卫（line 823），**不会重复发**
5. renderer `doneHandler` 触发，**第 1 次**进入：`_doneHandled = true`，清理监听器
6. 若有意外再次发 done（理论上不会），第 2 次进入时 `_doneHandled` 已为 true，`return`

**结论**：✅ **PASS** — 双层保护（主进程 `doneSent` + renderer `_doneHandled`）

### 2.3 异常路径：流中断 / 超时清理

**流中断（网络错误）**：
- main.js:873 `res.on('error', (err) => { clearHeartbeat(); activeAgentStreamReq = null; resolve({ error: err.message }); });`
- **未发送** `agent-stream-done` 事件，**未发送** `agent-stream-error`
- **问题**：renderer 的 `agentChatStream` Promise 收到 `{error: '...'}`,**但 typing indicator 不会自动移除**

**超时**：
- main.js:884 `req.on('timeout', () => { ... event.sender.send('agent-stream-error', { error: '请求超时（2分钟无响应）' }); ... })`
- renderer 收到 `agent-stream-error` — **但 ai-agent.js 中未注册 `onAgentStreamError` 监听器**！**这是一个潜在缺陷**

**心跳超时**（45s 无数据）：
- main.js:739-747 `if (performance.now() - lastDataTime > heartbeatThreshold) { req.destroy(); ... event.sender.send('agent-stream-error', ...); }`
- **同样**：renderer 未监听 `agent-stream-error`

**清理验证**：
- ✅ 主进程 `clearHeartbeat()` + `activeAgentStreamReq = null` — 主进程侧 OK
- ❌ Renderer 侧：streamHandler 可能继续被旧的 done 事件触发（理论上不会，因 50ms 内 done handler 已执行，但**异常场景下 listener 未主动清理**）
- ⚠️ `closeAgentModal` 调用 `removeAllAgentListeners()` (ai-agent.js:266) — 用户主动关弹窗时清理

**结论**：**PARTIAL** — 正常 done 单次触发已保证；但**异常路径**（网络断/超时）有 2 个问题：
1. `onAgentStreamError` 未注册（preload 暴露了 channel 但 renderer 未消费）
2. typing indicator 在错误时可能**残留**（需 catch 块处理）

**修复建议**：
```javascript
// ai-agent.js sendAgentMessage 中添加
window.electronAPI.onAgentStreamError((err) => {
    if (typingIndicator) typingIndicator.classList.remove('active');
    addMessageToContainer(chatContainer, 'assistant', '连接中断: ' + (err.error || '未知错误'));
    window._hasPendingStream = false;
});
// 但要注意：preload 暴露了 onAgentStreamError 吗？需查
```
- **preload 检查**：`preload.js:31-39` **未暴露** `onAgentStreamError`！只有 chunk / done / status。这是**P1 缺陷**。

---

## 3. 工具调用闭环分析

### 3.1 提案面板确认链路

**前端流程**：
1. AI 响应含 `proposal` 字段 → `ai-agent.js:781` `addProposalToMessage(div, proposal);`
2. 用户点击 `.proposal-btn.approve` → `ai-agent.js:367-369` HTML 写死 `onclick="approveProposal()"`
3. `window.approveProposal` (line 954) → 查 pending entry → IPC `agentApprove`

**IPC 链路**：
- `ai-agent.js:980` `await window.electronAPI.agentApprove({ proposal: proposal });`
- `preload.js:56` `agentApprove: (proposal) => ipcRenderer.invoke('agent-approve', proposal)`
- `main.js:910-916` `ipcMain.handle('agent-approve', async (event, proposal) => { try { return await pythonApi('POST', '/api/agent-approve', proposal); } catch (error) { return { success: false, error: error.message }; } })`
- 后端：`POST /api/agent-approve` 接收 proposal，执行 tool call

**结论**：✅ **PASS** — IPC 链路完整，错误处理 OK

### 3.2 工具调用后端无 traceback

- **后端**：`PlanMosaic Desktop/backend/server.py`（未在本次读取范围内，但根据 main.js:912 `pythonApi('POST', '/api/agent-approve', proposal)` 调用）
- **错误处理**：`main.js:912-915` `catch (error) { return { success: false, error: error.message }; }`
- **结论**：⚠️ **无法静态验证** traceback，需 GUI 实际触发；但**前端错误降级**已通过 `approveProposal` 的 catch 块（line 1004-1006）处理

### 3.3 提案按钮重复点击防护
- **行号**：`ai-agent.js:955-959`
- **实现**：
  ```javascript
  if (window._isApproving) return;  // line 955
  window._isApproving = true;        // line 956
  var proposalBtns = document.querySelectorAll('.proposal-btn');
  proposalBtns.forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });  // line 959
  ```
- **finally 释放**：line 1008 `window._isApproving = false;`
- **结论**：✅ **PASS** — ux-interaction-audit R3 缺陷**已修复**（按钮 + 标志双重防护）

### 3.4 工具调用完成后 UI 更新
- **行号**：`ai-agent.js:990-999`
- **实现**：
  ```javascript
  if (result.success) {
      proposal._status = 'approved';
      var btnContainer = document.querySelector('.proposal-actions');
      if (btnContainer) {
          btnContainer.innerHTML = '<span style="color: var(--accent-primary); font-size: 13px;">' + escapeHtml(result.message || '已执行') + ' ✓</span>';
      }
      var count = result.deletedCount || result.modifiedCount || 0;
      var feedbackMsg = result.message || getProposalFeedback(proposal);
      addMessage('assistant', feedbackMsg + (count ? ' 共 ' + count + ' 项。' : ''), null, true);
      await refreshScheduleData();
  }
  ```
- **结论**：✅ **PASS** — 提案变"已应用"状态 + 刷新日程数据

---

## 4. 对话历史保留分析

### 4.1 `conversationHistory` 维护

**初始化**：`ai-agent.js:4` `let conversationHistory = [];`

**加载**：
- Electron 模式 (line 100-103) `const hist = await window.electronAPI.getAgentHistory(); conversationHistory = hist.conversations || [];`
- Web 模式 (line 118-120) 类似

**新增**：`addToHistory` (line 426-442)：
```javascript
function addToHistory(role, content, proposal) {
    var entry = { role: role, content: content, timestamp: new Date().toISOString() };
    if (proposal) {
        proposal._id = 'proposal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        proposal._status = 'pending';
        entry.proposal = proposal;
    }
    conversationHistory.push(entry);

    if (conversationHistory.length >= 100) {
        var oldest = conversationHistory.splice(0, 50);
        archivedConversations = archivedConversations.concat(oldest);
        if (archivedConversations.length > 500) {
            archivedConversations = archivedConversations.slice(-500);
        }
    }
}
```

**关键点**：
- ⚠️ **每条 history entry 仅保存 `{role, content, proposal, timestamp}`**，**未保存 `reasoning_content`**！
- ⚠️ 这意味着 follow-up 请求中**后端看不到上一轮的思路链**

**保存到磁盘**：
- `saveHistory` (line 908-947) — 用 `Promise` 锁防止并发写
- 通过 IPC `saveAgentHistory` (preload.js:22) → `ipcMain.handle('save-agent-history', ...)` (main.js:952)

**结论**：**PARTIAL** — history 维护完整，但 `reasoning_content` 未保存

### 4.2 follow-up 请求是否带完整历史

**位置**：`ai-agent.js:759-775`

**实现**：
```javascript
var historySlice = conversationHistory.slice(-50);
var tokenEstimate = estimateTokenCount(historySlice);
var MAX_TOKENS = await getMaxTokens();
if (tokenEstimate > MAX_TOKENS) {
    var sliceSize = 50;
    while (sliceSize > 5 && estimateTokenCount(conversationHistory.slice(-sliceSize)) > MAX_TOKENS) {
        sliceSize -= 5;
    }
    historySlice = conversationHistory.slice(-sliceSize);
    if (typeof showToast === 'function') showToast('对话历史较长，已自动截断以适配上下文窗口', 'info');
}

data = await window.electronAPI.agentChatStream({
    message: msg, images: imageDataUrls,
    history: historySlice, profile: {},
    userProfileText: getMosaProfile()
});
```

**关键点**：
- ✅ 取最近 50 条
- ✅ token 估算（中文 0.5 / 英文 0.25 per char）
- ✅ 超限自动截断 + 用户提示 toast
- ⚠️ **`getMaxTokens()` 仅 8000 / 16000**（pro/reasoner）— 可能不够
- ❌ **未做**对话压缩（虽然 main.js:417 有 `compressConversation` 函数，但 ai-agent.js 中**未调用**）

**结论**：**PARTIAL** — follow-up 携带 history OK，但 token 阈值可能偏小

### 4.3 reasoning_content 在 Pro 模型下保留

**问题**：上一轮 `streamedContent` 是否包含 `reasoning_content`？

**检查**：
- `ai-agent.js:782` `addToHistory('assistant', content || streamedContent, proposal);`
- `content` 来自 `data.response.content`（line 780）
- `streamedContent` 是流式累积的文本（line 703），**仅 content 类型，不含 reasoning**

**结论**：❌ **FAIL** — `addToHistory` 仅保存 `content`（即最终回答），**`reasoning_content` 永远不进 history**

**这与 `fix-reasoning-content-stripping` spec 主题吻合** — 当前实现是把 reasoning **仅在 UI 上展示一次**（doneHandler 调 renderThinkingChain），不进历史。

**影响**：
- ✅ Pro 模型用户**能看到**当前轮的思路链
- ❌ 但 follow-up 时，AI 看不到上轮的思路，**可能导致上下文理解不准**
- ❌ 后端 stream 收到的 history 中**所有 entry 都无 reasoning**

**修复建议**（如要支持跨轮 reasoning）：
1. `addToHistory` 增加 `reasoning_content` 字段
2. 后端 SSE result 事件应包含完整 `{content, reasoning_content, proposal}`
3. `ai-agent.js:780` 解构时取 `reasoning_content` 并保存

---

## 5. 关键问题汇总（按剧本 §4 回归点 R8）

### R8: Agent chat 上下文丢失
- **现状**：`conversationHistory` 维护 role/content/proposal/timestamp，**无 reasoning_content**
- **修复状态**：❌ **未完全修复**（从 addToHistory 实现看）
- **影响**：Pro 模型下用户问"我刚才你是怎么想的？"会得到不准确的回答

### 详细问题表

| # | 问题 | 严重度 | 位置 | 建议 |
|---|------|--------|------|------|
| 1 | 500ms 硬延迟在 finally | P2 | ai-agent.js:846 | 移除 setTimeout，直接清理 |
| 2 | `onAgentStreamError` preload 未暴露 | P1 | preload.js:31-39 | 暴露并让 ai-agent.js 监听 |
| 3 | typing indicator 在错误时可能残留 | P1 | ai-agent.js:835-841 | catch 块中加 `typingIndicator.classList.remove('active')` |
| 4 | reasoning_content 未进 history | P1 | ai-agent.js:782 | addToHistory 增字段 |
| 5 | `_hasPendingStream` 与主进程 `doneSent` 不同步 | P2 | ai-agent.js:743 | 主进程 done 后主动 send `{sync: true}` |
| 6 | `isTyping` 标志在 catch 中重置但 finally 未重置 | P2 | ai-agent.js:837 | finally 中也加 `isTyping = false` |
| 7 | `closeAgentModal` 中无 isTyping 清理（已加） | OK | ai-agent.js:278 | 已有 `isTyping = false` |
| 8 | `_isSending` 标志在 catch 路径中（line 835-851）— finally 块在 try-catch 内 | OK | ai-agent.js:842-851 | 正常释放 |

---

## 6. 截图证据

| 场景 | 预期截图 | 状态 |
|------|---------|------|
| 2.1.3 用户气泡出现 | `phase3-chat-2-user-bubble.png` | 待 GUI |
| 2.1.4 typing 跳动 | `phase3-chat-3-ai-thinking.png` | 待 GUI |
| 2.1.5 流式追加 | `phase3-chat-4-ai-streaming.png` | 待 GUI |
| 2.1.6 流式完成 | `phase3-chat-5-ai-done.png` | 待 GUI |
| 2.1.7 思路链展开 | `phase3-chat-6-thinking-chain-expanded.png` | 待 GUI |
| 2.2.3 提案面板 | `phase3-tool-1-schedule-proposal.png` | 待 GUI |
| 2.2.4 提案确认 | `phase3-tool-2-schedule-confirmed.png` | 待 GUI |

---

**报告生成时间**：2026-06-04
**审计方式**：纯静态（无 GUI 执行）
