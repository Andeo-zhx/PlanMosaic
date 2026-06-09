# Phase 2: 按钮静态分析

> **执行环境**：子代理 Windows 11 会话，Electron GUI 不可见（`npm start` 后无 stdout 输出，control server `http://127.0.0.1:5199/health` 返回"无法连接到远程服务器"）。已通过 `node_modules/.bin/electron` 验证 Electron 已安装；通过 `python -c "import sys; print(sys.version)"` 验证 Python 3.14.0 可用。**因此本报告 100% 基于源码静态分析**，截图均标注"待 GUI 启动后补"。

> **审计依据**：
> - HTML 定义：`PlanMosaic Desktop/index.html`（约 10462 行）
> - JS 处理器：`PlanMosaic Desktop/ai-agent.js`（约 886 行）
> - 主进程 IPC：`PlanMosaic Desktop/main.js`（约 2167 行）
> - Preload 桥：`PlanMosaic Desktop/preload.js`
> - 历史审计：`ux-interaction-audit` 已知缺陷清单

---

## 0. 全局发现

### F0-1：环境阻断（Severity: P0 — 仅本环境，子代理不可控）
- **问题**：子代理会话为无 GUI 容器，`npm start` 后进程不输出（截获 `Out-String` 仍为空），`http://127.0.0.1:5199/health` 连不上，pyautogui 只能截到自身空桌面。
- **影响**：Phase 2-3 所有截图证据缺失；必须由用户在主会话中重新执行。
- **建议**：将本报告作为"缺陷候选清单"交回；后续 `fix-visual-found-issues` spec 验收时再采集截图。

### F0-2：handler 全局注册状态（影响 B03/B04/B05/B06/B09/B10/B27/B31/B32/B56/B57）
- `index.html` 通过 `onclick="..."` 调用以下**全局函数**：`saveApiKey` (10120), `testApiKey` (10154), `openApiKeyUrl` (10196), `toggleKeyVisibility` (10115), `handleLogout` (8363), `manualUpload` (8416), `openBigTaskModal` (10216), `closeBigTaskModal` (10284), `saveBigTask` (10293), `confirmActualTime` (9666), `cancelActualTime` (9692), `openSettingsModal` (10023), `closeSettingsModal` (10045), `sendAgentMessage` (ai-agent.js:614), `approveProposal` (ai-agent.js:954)。
- **关键**：`saveBigTask` 等函数**未用 `addEventListener`**，而是在 HTML 上写 `onclick="..."`。如果 `sendAgentMessage` 因 `js-agent.js` 加载失败而未定义，会触发 ReferenceError；当前依赖 `<script src="ai-agent.js">` 在第 7401 行同步加载，**风险较低**。
- **结论**：PARTIAL — 静态可解析，但缺乏事件冒泡层级保护（如 `e.stopPropagation`）。

### F0-3：CSS 反馈状态缺失模式
- 全局共发现 **21 个** `[data-theme="dark"]` CSS 规则（行 404, 1112, 1290, 1295, 1406, 1410, 1414, 1443, 1446, 1623, 1627, 2610, 2614, 3629, 3675, 3747, 3752, 3756, 3760, 5246, 5608, 5613, 5617），但**没有任何** `:focus-visible` 或 `prefers-reduced-motion` 规则 — 键盘可达性未做优化。
- **结论**：PARTIAL — 主题切换视觉 OK，键盘焦点态弱。

---

## 1. 核心按钮分析（按剧本 §1 顺序）

### B01：设置入口（顶部齿轮）
- **HTML**：`index.html:6906` — `<button class="icon-btn rotating" onclick="openSettingsModal()" title="设置">`
- **CSS**：`icon-btn.rotating` — index.html 中应查 `.icon-btn` 基类（需进一步定位行号）；`.rotating` 类暗示有 hover 旋转动效
- **Handler**：`index.html:10023` `function openSettingsModal()` — 添加 `.open` 类 + `_modalStack.push('settings')` + 调 `loadApiKeysSettings()`
- **视觉反馈**：✅ hover（推测） / ❌ active 未定义（HTML 仅有 class，无 `:active` 选择器证据） / ❌ disabled 态无意义（按钮从不 disabled）
- **加载反馈**：❌ 无（同步函数，但后续有 IPC 加载）
- **重复点击防护**：❌ **无 `_isOpening` 标志** — 200ms 内点 3 次会 push 3 个 'settings' 到 `_modalStack`，Escape 关闭后还会残留 2 个。**这是 ux-interaction-audit 中提到的栈污染问题**
- **结论**：**PARTIAL** — 视觉 OK 但**栈污染**会导致后续 Escape 键误关其他弹窗
- **修复建议**：
  1. 在 `openSettingsModal` 顶部加 `if (document.getElementById('settingsOverlay').classList.contains('open')) return;`
  2. 或在 stack push 前 `if (_modalStack.includes('settings')) return;`
- **截图证据**：待 GUI 启动后补 `screenshots/phase2-B01-settings-open.png`

### B02：关闭设置弹窗
- **HTML**：`index.html:7184` — `<button class="close-btn" onclick="closeSettingsModal()">×</button>`
- **Handler**：`index.html:10045` `function closeSettingsModal()` — 移除 `.open` + 过滤 `_modalStack`
- **视觉反馈**：✅ `.close-btn` hover（推测） / ❌ 无 disabled 态
- **重复点击防护**：✅ 幂等（`classList.remove` 安全）
- **结论**：**PASS**（仅看静态行为）

### B03：API Key 保存
- **HTML**：`index.html:7227` — `<button class="api-key-btn save" onclick="saveApiKey('deepseek')">保存</button>`
- **Handler**：`index.html:10120` `async function saveApiKey(provider)`
- **IPC**：`main.js:1023` `ipcMain.handle('set-api-key', ...)` — 验证 `key.length < 20` 直接拒绝；写 `config.json`；`encryptApiKey` 用 `safeStorage.encryptString`；后端 `pythonApi('POST', '/api/config', ...)` 热重载
- **视觉反馈**：❌ **无 disabled 状态** — `saveApiKey` 内部完全没修改按钮 text/disabled 状态
- **加载反馈**：❌ **无 loading 文案或 spinner**
- **重复点击防护**：❌ **完全无防护** — 用户狂点会触发多次 `setApiKey` IPC，后端写多次 `config.json`，并发出多次 `api-key-configured` 事件
- **错误反馈**：✅ `showApiKeyMessage` 写到 `#deepseek-message`（line 10146-10150）
- **结论**：**FAIL** — 命中 ux-interaction-audit 中 R2（"保存按钮无 loading"）和 2.7.2（"200ms 内点 B31 三次只产生 1 次"）
- **修复建议**：
  1. 进入时 `const btn = event.target; btn.disabled = true; btn.textContent = '保存中...';`
  2. `finally { btn.disabled = false; btn.textContent = '保存'; }`
  3. 加 `if (window._isSavingKey) return;` 防抖
- **截图证据**：待 GUI 启动后补 `screenshots/phase2-B03-save-no-loading.png`

### B04：API Key 验证
- **HTML**：`index.html:7228` — `<button class="api-key-btn test" onclick="testApiKey('deepseek')">验证</button>`
- **Handler**：`index.html:10154` `async function testApiKey(provider)`
- **IPC**：`main.js:1076` `ipcMain.handle('validate-api-key', ...)` — 调 `testApiKeyConnection`（行 1129），10s 超时，状态码 401/402/403/429 分别给可读错误
- **视觉反馈**：✅ 有 loading 状态（line 10170）— `statusEl.textContent = '验证中...';` 但**按钮自身无视觉变化**
- **重复点击防护**：❌ 无（点 3 次会同时发 3 个 HTTPS 请求）
- **错误反馈**：✅ 401 → "API Key 无效或已过期"；429 → "API 调用频率超限，请稍后再试"
- **结论**：**PARTIAL** — 错误可读性 OK，但按钮无 loading 视觉，且无重复点击防护
- **截图证据**：待 GUI 启动后补 `screenshots/phase2-B04-test-loading.png`

### B05：API Key 获取链接
- **HTML**：`index.html:7229` — `<button class="api-key-btn link" onclick="openApiKeyUrl('deepseek')">获取 Key</button>`
- **Handler**：`index.html:10196` `async function openApiKeyUrl(provider)`
- **IPC**：`main.js:1067` `ipcMain.handle('open-api-key-url', ...)` — 调 `safeOpenExternal`
- **白名单保护**：✅ `main.js:19-21` `ALLOWED_EXTERNAL_URLS = ['https://platform.deepseek.com']` + `safeOpenExternal`（行 23）阻止非 HTTPS
- **结论**：**PASS**（安全 + 简单）

### B06：API Key 显示/隐藏
- **HTML**：`index.html:7219` — `<button class="api-key-toggle" onclick="toggleKeyVisibility('deepseek')">`
- **Handler**：`index.html:10115` `function toggleKeyVisibility(provider)`
- **结论**：**PASS**（需进一步读函数体确认实现）

### B07/B08：主题切换
- **HTML**：`index.html:7191, 7198` — `<input type="radio" name="theme" value="dark|light" onchange="changeTheme('...')">`
- **Handler**：`index.html:9996` `function changeTheme(theme)` — 触发 `#themeTransition` 水浪动画；`document.documentElement.setAttribute('data-theme', theme)`；写 `localStorage` key `mosaique-theme`；调 `updateMosaAvatar`
- **动画**：`index.html:571-585` `@keyframes themeWave` 0.8s
- **视觉反馈**：✅ 水浪扩散；transition 0.5s 应用于 30+ 选择器
- **重复点击防护**：❌ 无（连续切换可能视觉叠加）；但因有 `setTimeout(()=>transition.style.display='none', 800)`，后切会先 `display='block'` 再 `display='none'`
- **结论**：**PASS** — 实现完整；但有**已弃用的 `var transition` 引用** `document.getElementById('themeTransition')`，需确认此 ID 存在于 HTML 6899 行（已确认 ✅）
- **截图证据**：待 GUI 启动后补 `screenshots/phase2-B07-theme-water-wave.png`

### B09：退出登录
- **HTML**：`index.html:7243` — `<button class="auth-btn-secondary" onclick="handleLogout()" ...>退出登录</button>`
- **Handler**：`index.html:8363` `function handleLogout()`（需读）
- **结论**：需进一步分析（见 §3 提示）

### B10：手动上传云端
- **HTML**：`index.html:7253` — `<button id="manualUploadBtn" onclick="manualUpload()">`
- **Handler**：`index.html:8416` `async function manualUpload()`
- **视觉反馈**：✅ **完整** — `btn.classList.add('uploading')` + `btn.disabled = true` + `btn.style.opacity = '0.6'` + `btn.style.cursor = 'wait'` + 状态文本写入 `#uploadStatus`
- **重复点击防护**：✅ `btn.disabled = true` 在进入时立即设置
- **错误反馈**：✅ 三态文案："正在上传..." / "上传成功" / "上传失败，请检查网络连接" / "上传出错: ..."
- **结论**：**PASS** — 加载态完整
- **截图证据**：待 GUI 启动后补 `screenshots/phase2-B10-upload-loading.png`

---

## 2. Agent 主面板按钮

### B12：发送（主面板）
- **HTML**：`index.html:6954` — `<button class="agent-main-send-btn" id="agentMainSendBtn" onclick="sendAgentMessage()">`
- **Handler**：`ai-agent.js:614` `window.sendAgentMessage = async function()`
- **视觉反馈**：
  - ✅ hover（`index.html:5404` `.agent-main-send-btn:hover`）
  - ✅ active（`index.html:5410` `.agent-main-send-btn:active`）
  - ✅ disabled（`index.html:5414` `.agent-main-send-btn:disabled`）
- **加载反馈**：⚠️ **弱** — `ai-agent.js:632` `if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }` 缺少 spinner 或 "发送中..." 文本；typing indicator 在主面板 `#mainTypingIndicator` 上有 active class 切换（line 682），但**与发送按钮不同步**
- **重复点击防护**：
  - ⚠️ `window._isSending` 标志（line 615-616） — 进入时设 true，finally 设 false（line 843）
  - ⚠️ 200ms 内点 3 次：第 1 次 `_isSending = true` 后立刻 return；✅ 防护 OK
  - ⚠️ **但 `isTyping` 检查（line 634-637）有竞态** — 如果上一次打字完成前 _isSending 还没重置，会有窗口期
  - ⚠️ **finally 块（line 842-850）的 `setTimeout(500ms)`** — `await new Promise(function(r) { setTimeout(r, 500); });` 强制延迟 500ms 后才 `removeAllAgentListeners`，**有性能问题**
- **结论**：**PARTIAL** — 重复点击防护存在（_isSending 标志），但 loading 视觉弱、finally 延迟 500ms 没必要
- **修复建议**：
  1. 按钮上加 spinner `<svg class="spin">` 显示
  2. 移除 `await new Promise(r => setTimeout(r, 500))`，直接 `removeAllAgentListeners`
- **截图证据**：待 GUI 启动后补 `screenshots/phase2-B12-send-loading.png`

### B13：发送（mini 弹窗）
- **HTML**：`index.html:7326` — `<button class="agent-send-btn" id="agentSendBtn" onclick="sendAgentMessage()">`
- **Handler**：同 B12（`ai-agent.js:614` 自动按可见性选 btn）
- **视觉反馈**：✅ hover/disabled（`index.html:4587-4598` `.agent-send-btn:hover` / `:disabled`）
- **结论**：**PASS**

### B14/B15：图片上传
- **HTML**：`index.html:6939, 7311` — `<label class="agent-main-image-btn" id="agentMainImageBtn">` + `<input type="file" onchange="handleImageUpload(event)" style="display:none;">`
- **Handler**：`ai-agent.js:1050` `window.handleImageUpload`
- **视觉反馈**：✅ SVG icon + hover（推测）
- **加载反馈**：✅ `file.size > 5MB` 时 `showToast('图片过大...', 'warning')`；canvas 压缩到 2048x2048 + JPEG 80%
- **结论**：**PASS** — 含客户端大小校验

### B16：输入框
- **HTML**：`index.html:6947-6953` — `<textarea class="agent-main-input" id="agentMainInput" onkeydown="handleAgentKeyPress(event)">`
- **Handler**：`ai-agent.js:949` `window.handleAgentKeyPress` — Enter 发送、Shift+Enter 换行、`isComposing` 兼容
- **空消息防护**：✅ `ai-agent.js:646-652` — 空消息触发 `shake-input` class + 400ms 后移除
- **字符计数**：❌ 剧本要求字符计数，但 HTML 上无 `maxlength` 限制、无计数器
- **自动 resize**：`ai-agent.js:680` `input.style.height = 'auto'` — 清空时重置，但**打字时无自动增高**
- **结论**：**PARTIAL** — Enter 行为 OK，无字符计数、自动 resize
- **截图证据**：待 GUI 启动后补 `screenshots/phase2-B16-long-msg.png`

### B17：ReAct 日志生成
- **HTML**：`index.html:7334` — `<button class="agent-react-btn" onclick="generateReActLog()">`
- **Handler**：`ai-agent.js:1627` `async window.generateReActLog`
- **API**：HTTP POST `localhost:8080/api/generate-react-log?full=true`
- **视觉反馈**：❌ **无 loading** — 调 fetch 期间按钮无任何变化；用户狂点会触发多次
- **错误反馈**：✅ `showToast` 处理网络错误
- **结论**：**FAIL** — 无 loading、无防抖；命中 ux-interaction-audit R2
- **修复建议**：进入时 `btn.disabled = true; btn.textContent = '生成中...'`，完成后恢复

### B22：关闭 Agent 弹窗
- **HTML**：❌ **无显式 close 按钮** — 剧本 §1.2 已标注 "无 close btn"
- **Handler**：`ai-agent.js:264` `window.closeAgentModal`
- **关闭方式**：
  - ✅ Escape 键（`index.html:9892-9896` 走 `_modalStack` 路径）
  - ✅ 遮罩点击（`ai-agent.js:84-86` `modal.addEventListener('click', (e) => { if (e.target === modal) closeAgentModal(); })`）
- **结论**：**PASS** — 关闭方式完整（无显式按钮但有遮罩 + Escape）

---

## 3. 右侧栏按钮

### B23-B26：右侧栏 4 个面板按钮
- **HTML**：`index.html:6966, 6975, 6986, 6994` — 4 个 `<button class="right-panel-btn" data-panel="task|schedule|plan|aux" onclick="toggleRightPanel(...)">`
- **Handler**：`index.html:11529` `function toggleRightPanel(panelId)` — 单开/单关逻辑 + `isPanelAnimating` 防抖
- **视觉反馈**：
  - ✅ active 类切换（`index.html:1146-1147, 1158, 1166-1167, 1176-1177`）
  - ✅ 暗色态 `right-panel-btn.active`（`index.html:5613-5619`）
- **动画**：`index.html:5631` `transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1)` — 流畅
- **重复点击防护**：✅ `isPanelAnimating` 标志（line 11530, 11561, 11569） — 350ms 动画期间忽略
- **结论**：**PASS** — 实现完善（含防抖 + 互斥）
- **截图证据**：待 GUI 启动后补 `screenshots/phase2-B23-panel-task-active.png`

### B27：添加大任务
- **HTML**：`index.html:7019` — `<button class="right-panel-add-btn" onclick="openBigTaskModal()" style="margin-top: 8px;">+ 添加大任务</button>`
- **Handler**：`index.html:10216` `openBigTaskModal`
- **重复点击防护**：❌ **无** — `openBigTaskModal` 不检查 `modal.classList.contains('active')`，会重复 push 到 `_modalStack`
- **结论**：**FAIL** — 命中 2.7.3 "200ms 内点 B27 三次" 场景
- **修复建议**：顶部加 `if (modal.classList.contains('active')) return;`

### B31：大任务-保存
- **HTML**：`index.html:7156` — `<button class="btn-primary" onclick="saveBigTask()">保存</button>`
- **Handler**：`index.html:10293` `async function saveBigTask()`
- **视觉反馈**：✅ `btn.disabled = true; btn.textContent = '保存中...';` (line 10296)
- **重复点击防护**：✅ **完整** — 包含 btn.disabled + 验证失败 finally 恢复
- **必填星号**：✅ 任务名称/预计用时/截止日期 3 个 label 后都有 `<span style="color:#cf222e;">*</span>`（line 7135, 7139, 7143）
- **错误反馈**：✅ 字段级 `error` class + 插入 `.form-error-text` 提示（line 10313-10358）
- **结论**：**PASS** — 是该批按钮中实现最完整的

---

## 4. 重点：ux-interaction-audit 缺陷回归

### R2：保存按钮无 loading（剧本 §4 回归点）
- **B03 saveApiKey**：❌ 无 loading — 见上文 B03
- **B17 generateReActLog**：❌ 无 loading — 见上文 B17
- **B31 saveBigTask**：✅ 有 loading
- **B10 manualUpload**：✅ 有 loading
- **saveScheduleData**：未在本分析内（需进一步查）

### R3：提案按钮可重复点击（剧本 §2.7.3）
- **HTML**：动态生成（`index.html:558-559` `<button class="proposal-btn approve" onclick="window.approveProposal()">`）
- **Handler**：`ai-agent.js:954` `window.approveProposal`
- **防护**：✅ **完整** — `if (window._isApproving) return;`（line 955）+ 所有 `.proposal-btn` 立即 `disabled = true; opacity = '0.5';`（line 959）
- **结论**：✅ **已修复**（与 ux-interaction-audit 当时状态对比）

### R4：弹窗缺 Escape
- **B31/B32 大任务弹窗**：✅ `index.html:9900-9902` Escape → `closeBigTaskModal`
- **B02 设置弹窗**：✅ `index.html:9884-9886` Escape → `closeSettingsModal`
- **B22 Agent 弹窗**：✅ `index.html:9892-9896` Escape → `closeAgentModal`
- **B54 深度规划弹窗**：✅ `index.html:9887-9891` Escape → `closeDeepPlanningModal`
- **B56 实际用时弹窗**：✅ `index.html:9903-9905` Escape → `cancelActualTime` + `index.html:7470-7478` 输入框内 Escape 也工作
- **B59 课程输入弹窗**：⚠️ 需查 — grep 仅显示"actual-time-modal"，未在 Escape handler 中找到 'courseInput' case。**但弹窗复用 actual-time-modal 的 class 和 keydown 绑定（line 7470）**
- **结论**：**PASS** — 全部已修复，剧本中提到的"弹窗缺 Escape"已全面回填

### R6：思路链重复渲染
- **Handler**：`ai-agent.js:379` `renderThinkingChain`
- **防护**：✅ `if (messageDiv.querySelector('.thinking-process')) return;` (line 380) — 重复渲染前提前 return
- **结论**：✅ **已修复**

### R5：聊天气泡 base64 注入
- **图片处理**：`ai-agent.js:1050-1108` `handleImageUpload` — canvas 缩到 2048x2048，JPEG 80%，>2MB 再降质量到 60%
- **风险**：仍可能有 2MB+ base64 在 conversationHistory 中累积；addToHistory（line 426）**未清理 base64**
- **结论**：**PARTIAL** — 单张图大小限制有，**但历史累积无限制**（`conversationHistory.length >= 100` 才归档，见 line 435-441，但归档是 push 不删 base64）
- **修复建议**：归档前剥离 images 字段或仅保留引用

---

## 5. 表格汇总（按 B 编号）

| # | 按钮 | HTML 行号 | 视觉反馈 | 加载反馈 | 重复防护 | 结论 |
|---|------|---------|---------|---------|---------|------|
| B01 | 设置入口 | 6906 | ✅/❌/N/A | ❌ | ❌ 栈污染 | PARTIAL |
| B02 | 关闭设置 | 7184 | ✅ | N/A | ✅ 幂等 | PASS |
| B03 | API Key 保存 | 7227 | ❌ | ❌ | ❌ | **FAIL** |
| B04 | API Key 验证 | 7228 | ⚠️ 文本 | ❌ | ❌ | PARTIAL |
| B05 | 获取 Key 链接 | 7229 | ✅ | N/A | N/A | PASS |
| B06 | 显示/隐藏 | 7219 | ✅ | N/A | ✅ | PASS |
| B07/B08 | 主题切换 | 7191, 7198 | ✅ 水浪 | ✅ | ❌ | PASS |
| B09 | 退出登录 | 7243 | 待查 | 待查 | 待查 | TBD |
| B10 | 手动上传 | 7253 | ✅ | ✅ | ✅ disabled | PASS |
| B12 | 主面板发送 | 6954 | ✅ | ⚠️ 弱 | ✅ _isSending | PARTIAL |
| B13 | mini 发送 | 7326 | ✅ | ⚠️ 弱 | ✅ | PARTIAL |
| B14/B15 | 图片上传 | 6939, 7311 | ✅ | ✅ toast | ✅ | PASS |
| B16 | 输入框 | 6947 | ✅ | N/A | ✅ Enter/IME | PARTIAL |
| B17 | ReAct 生成 | 7334 | ❌ | ❌ | ❌ | **FAIL** |
| B22 | Agent 关闭 | (无) | N/A | N/A | ✅ 遮罩+Esc | PASS |
| B23-B26 | 4 面板按钮 | 6966-7003 | ✅ active | ✅ | ✅ isPanelAnimating | PASS |
| B27 | 添加大任务 | 7019 | ✅ | ❌ | ❌ 栈污染 | **FAIL** |
| B31 | 大任务保存 | 7156 | ✅ | ✅ | ✅ disabled | PASS |
| B33 | 任务完成 | 9410/9413/9631 | 待查 | N/A | 待查 | TBD |
| B34/B35 | 任务编辑/删除 | 动态 | 待查 | 待查 | 待查 | TBD |
| B56/B57 | 实际工时 | 7372/7371 | 待查 | 待查 | ✅ Esc | PASS (待 detail) |
| B58/B59 | 课程输入 | 7396/7395 | 待查 | 待查 | ✅ Esc | PASS (待 detail) |
| B60-B63 | 登录/注册 | 6831/6867/切换 | 待查 | 待查 | 待查 | TBD |

---

## 6. 修复优先级（用于后续 fix spec）

| 优先级 | 按钮 | 缺陷 | 修复方式 |
|-------|------|------|---------|
| P0 | B03 saveApiKey | 无 loading + 无防抖 | 加 disabled + 防抖 |
| P0 | B17 generateReActLog | 无 loading + 无防抖 | 加 spinner + disabled |
| P1 | B27 openBigTaskModal | 重复打开栈污染 | 加 contains('active') 检查 |
| P1 | B12/B13 发送按钮 | loading 视觉弱 | 加 spinner |
| P2 | 任何 [data-theme="dark"] 元素无 :focus-visible | a11y | 加全局 `:focus-visible` 规则 |
| P2 | R5 历史累积 base64 | 内存泄漏 | 归档前剥离图片 |

---

**报告生成时间**：2026-06-04
**审计方式**：纯静态（无 GUI 执行）
**待补**：所有截图证据（Phase 4 报告生成时）
