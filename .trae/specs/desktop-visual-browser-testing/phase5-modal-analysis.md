# Phase 5: 弹窗/侧边栏静态分析

> **目标**：对照 `visual-test-script.md` §2.3（弹窗 Checklist M1~M10）和 §2.4（侧边栏），静态分析 9 类弹窗和 1 个侧边栏的实现。
>
> **Checklist 判据**（来自剧本 §2.3）：
> - M1 打开动效 / M2 毛玻璃遮罩 / M3 点遮罩外关闭 / M4 Escape 关闭
> - M5 必填星号 / M6 保存 loading / M7 失败错误
> - M8 关闭后清理 / M9 重复点击 / M10 键盘 tab 顺序

---

## 1. 弹窗清单

### M-A: 设置弹窗 `#settingsOverlay`

**HTML**：`index.html:7180-7287`
**核心属性**：
- 遮罩背景：`rgba(0, 0, 0, 0.35)` + `backdrop-filter: blur(6px)`（行 1698-1700 应用到 `.modal-overlay`）
- z-index：3000（行 7180 inline）
- 动效：`opacity 0.3s cubic-bezier(...)` + `transform: translateY(8px) → 0`

| Checklist | 验证 | 位置 |
|----------|------|------|
| M1 打开动效 | ✅ opacity 0→1 + translateY 0→8px 0.3s | CSS line 1706, 1724-1728 |
| M2 毛玻璃遮罩 | ✅ `backdrop-filter: blur(6px)` | CSS line 1699-1700 |
| M3 点遮罩外关闭 | ❌ **未实现** — 无 `click` listener 检测 `e.target === overlay` | — |
| M4 Escape 关闭 | ✅ `index.html:9884-9886` switch 'settings' → `closeSettingsModal()` | line 9884 |
| M5 必填星号 | N/A（无必填字段） | — |
| M6 保存 loading | ❌ **B03 saveApiKey 无 loading 视觉** | ai-agent 同 B03 |
| M7 失败错误 | ✅ `#deepseek-message` 错误提示 | line 10131, 10147 |
| M8 关闭后清理 | ⚠️ **部分** — `closeSettingsModal` 仅移除 `open` class，**不清空 input 值**（line 10048） | line 10045-10050 |
| M9 重复点击 | ❌ **无防护** — 见 phase2 B01 分析 | line 10023-10028 |
| M10 键盘 tab 顺序 | ⚠️ 未见 `:focus-visible` 优化 | CSS 中未见 |

**结论**：**PARTIAL** — M3 点遮罩外关闭**未实现**是已知缺陷。剧本 §2.3 设置弹窗示例第 1 步"点遮罩外 → 关闭"会 FAIL。

**修复建议**：
```javascript
// index.html 9923 行附近，DOMContentLoaded 块加
const settingsOverlay = document.getElementById('settingsOverlay');
if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) closeSettingsModal();
    });
}
```

---

### M-B: 大任务弹窗 `#bigTaskModal`（剧本 §2.3 重点关注）

**HTML**：`index.html:7118-7159`
**Handler**：`openBigTaskModal` (line 10216), `closeBigTaskModal` (line 10284), `saveBigTask` (line 10293)
**CSS**：`index.html:2619-2655`

| Checklist | 验证 | 位置 |
|----------|------|------|
| M1 打开动效 | ✅ opacity 0.25s + translateY 0.3s | CSS line 2633, 2649-2653 |
| M2 毛玻璃遮罩 | ✅ `backdrop-filter: blur(6px)` | CSS line 2626-2627 |
| M3 点遮罩外关闭 | ❌ **未实现** — 无遮罩 click listener | — |
| M4 Escape 关闭 | ✅ `index.html:9900-9902` switch 'bigTask' → `closeBigTaskModal()` | line 9900 |
| M5 必填星号 | ✅ 任务名称、预计用时、截止日期 label 后都有 `<span style="color:#cf222e;">*</span>` | line 7135, 7139, 7143 |
| M6 保存 loading | ✅ **完整** — `btn.disabled = true; btn.textContent = '保存中...';` | line 10296 |
| M7 失败错误 | ✅ 字段级 `.error` class + `.form-error-text` 提示 | line 10317-10358 |
| M8 关闭后清理 | ✅ `openBigTaskModal` 进入时清理残留 error（line 10218-10221） | line 10218-10221 |
| M9 重复点击 | ❌ **无防护** — `openBigTaskModal` 不检查 `modal.classList.contains('active')` | line 10216 |
| M10 键盘 tab 顺序 | ⚠️ 浏览器默认行为 | — |

**结论**：**PARTIAL** — M6 加载完整是亮点（其他弹窗都弱），M3 缺失是已知 ux 缺陷

**修复建议**：
```javascript
// index.html:10216 顶部
function openBigTaskModal(index = null) {
    const modal = document.getElementById('bigTaskModal');
    if (modal && modal.classList.contains('active')) return;  // 防止重复打开
    // ...原有逻辑
}

// 遮罩关闭
if (modal && !modal._overlayListenerAdded) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeBigTaskModal();
    });
    modal._overlayListenerAdded = true;
}
```

---

### M-C: 实际工时弹窗 `#actualTimeModal`（剧本 §2.3 重点关注）

**HTML**：`index.html:7366-7375`
**Handler**：`cancelActualTime` (line 9692), `confirmActualTime` (line 9666)
**输入框内 Enter/Escape**：`index.html:7470-7478` 双向绑定

| Checklist | 验证 | 位置 |
|----------|------|------|
| M1 打开动效 | ⚠️ **未见特定动画** — 仅靠 `.active` class | — |
| M2 毛玻璃遮罩 | ✅ `actual-time-modal` 复用 `.modal-overlay` 样式（line 1698-1700） | CSS line 1698-1700 |
| M3 点遮罩外关闭 | ❌ **未实现** | — |
| M4 Escape 关闭 | ✅ `index.html:9903-9905` switch 'actualTime' → `cancelActualTime()` + 输入框内 line 7474 | line 9903, 7474 |
| M5 必填星号 | ⚠️ label 文字未显示星号 | line 7368 |
| M6 保存 loading | ❌ **未实现** | — |
| M7 失败错误 | ❌ **未实现** | — |
| M8 关闭后清理 | ✅ `actualInput.value = ''` 在 `toggleTaskCompleteView` line 9707 | line 9707 |
| M9 重复点击 | ⚠️ `cancelActualTime` 幂等（仅 remove class） | line 9692 |
| M10 键盘 tab 顺序 | ✅ Enter 触发 confirm，Escape 触发 cancel | line 7470-7478 |

**结论**：**PARTIAL** — 输入框键盘交互（M10）做得不错，但 M6 加载态缺失

---

### M-D: 课程输入弹窗 `#courseInputModal`

**HTML**：`index.html:7390-7399` — **复用 `.actual-time-modal` 样式**
**Handler**：HTML 引用 `cancelCourseInput()` / `confirmCourseInput()` — **但 index.html 中未找到这两个函数定义**！

**结论**：⚠️ **潜在缺陷** — 复用样式 OK，但 **handler 函数可能在其他 JS 文件**（未读 cli/ 或 server.js 范围内），需进一步追查
**风险**：若 handler 缺失，按钮点击无反应

---

### M-E: 深度规划弹窗 `#deepPlanningModal`

**HTML**：`index.html:7344-7361`
**Handler**：`window.openDeepPlanningModal` (ai-agent.js:1507), `window.closeDeepPlanningModal` (ai-agent.js:1540)
**`window.sendDeepPlanningMessage`** (ai-agent.js:1561) — 完整实现

| Checklist | 验证 | 位置 |
|----------|------|------|
| M1 打开动效 | ✅ `modal.classList.add('open')` + panel `transform: translateY(12px) scale(0.97) → 0` | ai-agent.js:1513, CSS line 6767-6770 |
| M2 毛玻璃遮罩 | ✅ 复用 `.modal-overlay` | line 1698-1700 |
| M3 点遮罩外关闭 | ❌ **未实现** | — |
| M4 Escape 关闭 | ✅ `index.html:9887-9891` switch 'deepPlanning' → `closeDeepPlanningModal()` | line 9887 |
| M5 必填星号 | N/A | — |
| M6 保存 loading | ✅ `updateDPSendButtonState` + `btn.disabled = isDpStreaming` | ai-agent.js:1466-1472 |
| M7 失败错误 | ✅ `addDPMessage('assistant', '抱歉，处理请求时出现错误：' + data.error)` | ai-agent.js:1600 |
| M8 关闭后清理 | ✅ `saveDeepPlanningData()` 在 close 时调 | ai-agent.js:1556 |
| M9 重复点击 | ✅ `if (!text || isDpStreaming) return;` | ai-agent.js:1564 |
| M10 键盘 tab 顺序 | ❌ **未实现** — `handleDPKeyPress` 监听 Enter，但无 tabindex 控制 | ai-agent.js:1620 |

**结论**：**PARTIAL** — 保存 loading 和错误处理 OK，但 M3 缺失 + M10 缺 tab 优化

---

### M-F: 当日详情弹窗 `#modalOverlay`

**HTML**：`index.html:7162-7177`
**Handler**：`openModal(dateStr)` (line 9281), `closeModal(event)` (line 9854)
**遮罩关闭**：`index.html:9924-9926` `modalOverlay.addEventListener('click', closeModal)`

| Checklist | 验证 | 位置 |
|----------|------|------|
| M1 打开动效 | ✅ `.modal-overlay.open` opacity + translateY | CSS line 1709-1728 |
| M2 毛玻璃遮罩 | ✅ | CSS line 1698-1700 |
| M3 点遮罩外关闭 | ✅ `modalOverlay.addEventListener('click', closeModal)` | line 9924-9926 |
| M4 Escape 关闭 | ✅ `index.html:9897-9899` switch 'dayEdit' → `closeModal()` | line 9897 |
| M5 必填星号 | N/A | — |
| M6 保存 loading | N/A（这是详情，非编辑入口） | — |
| M7 失败错误 | N/A | — |
| M8 关闭后清理 | ✅ `closeModal` 重置 currentEditDate (line 9862) | line 9854-9875 |
| M9 重复点击 | ✅ 幂等 | — |
| M10 键盘 tab 顺序 | N/A | — |

**结论**：**PASS** — 是**唯一**实现 M3 遮罩关闭的弹窗

---

### M-G: Agent 弹窗 `#agentModal`

**HTML**：`index.html:7290-7341`
**Handler**：`window.openAgentModal` (ai-agent.js:243), `window.closeAgentModal` (ai-agent.js:264)

| Checklist | 验证 | 位置 |
|----------|------|------|
| M1 打开动效 | ✅ `modal.classList.add('active')` | ai-agent.js:249 |
| M2 毛玻璃遮罩 | ✅ `backdrop-filter: blur(var(--glass-agent-blur))` | CSS line 3172-3173 |
| M3 点遮罩外关闭 | ✅ `ai-agent.js:84-86` `modal.addEventListener('click', e => { if (e.target === modal) closeAgentModal(); })` | ai-agent.js:84-86 |
| M4 Escape 关闭 | ✅ `index.html:9892-9896` | line 9892 |
| M5 必填星号 | N/A | — |
| M6 保存 loading | ⚠️ 发送按钮弱 loading | ai-agent.js:632 |
| M7 失败错误 | ✅ catch 块显示错误气泡 | ai-agent.js:835-841 |
| M8 关闭后清理 | ✅ `revokeAllBlobUrls()` + 清 typing | ai-agent.js:277-279 |
| M9 重复点击 | ✅ `_isSending` 标志 | ai-agent.js:615 |
| M10 键盘 tab 顺序 | ⚠️ 默认 | — |

**结论**：**PASS** — 是**最完整**的弹窗

---

### M-H: ReAct 日志弹窗 `#reactLogModal`

**HTML**：`index.html:11633-11641`
**Handler**：`closeReActLog` (ai-agent.js:1662), `copyReActLog` (ai-agent.js:1666)
**遮罩关闭**：`ai-agent.js:1698-1703` `document.addEventListener('click', e => { if (modal && e.target === modal) closeReActLog(); })`

| Checklist | 验证 | 位置 |
|----------|------|------|
| M1 打开动效 | ⚠️ 通过 `style.display = 'flex'` 直接显示，无 transition | ai-agent.js:1652 |
| M2 毛玻璃遮罩 | ✅ 复用 `.modal-overlay` | CSS line 1698-1700 |
| M3 点遮罩外关闭 | ✅ `document.addEventListener('click', ...)` | ai-agent.js:1698-1703 |
| M4 Escape 关闭 | ⚠️ **未在 Escape handler 中找到 'reactLog' case** | — |
| M6 复制反馈 | ✅ `navigator.clipboard.writeText` + `showToast('已复制到剪贴板')` | ai-agent.js:1669-1672 |
| M8 关闭后清理 | ⚠️ `closeReActLog` 仅 `display = 'none'`，**不清文本** | ai-agent.js:1663 |

**结论**：**PARTIAL** — M4 缺失（Escape 无效）是已知问题

---

### M-I: 登录/注册弹窗 `#authOverlay`

**HTML**：`index.html:6802-6899`（含 loginForm + registerForm）
**Handler**：`handleLogin` (line 8276), `handleRegister` (line 8318), `showLoginForm`/`showRegisterForm` (line 8239/8250)

| Checklist | 验证 | 位置 |
|----------|------|------|
| M1 打开动效 | ✅ `authContainerIn` 0.3s | CSS line 771, 1068-1078 |
| M2 毛玻璃遮罩 | ✅ `backdrop-filter: blur(12px)` | CSS line 1169-1171 |
| M3 点遮罩外关闭 | ❌ 登录态**不应**被遮罩关闭 | — |
| M4 Escape 关闭 | ❌ 登录态**不应**被 Escape 关闭 | — |
| M5 必填星号 | ⚠️ 必填但无星号 | — |
| M6 保存 loading | ✅ **完整** — `btn.classList.add('loading')` + `btn.disabled = true` | line 8284, 8329 |
| M7 失败错误 | ✅ `AuthModule.showError` + `authShake` 0.4s 抖动 | line 8310-8314 |
| M8 关闭后清理 | N/A（一次性层） | — |
| M9 重复点击 | ✅ `btn.disabled = true` | line 8285 |
| M10 键盘 tab 顺序 | ✅ 100ms 后 focus username | line 8247 |

**结论**：**PASS** — 加载/错误做得最专业（含 authShake 抖动）

---

## 2. 弹窗总览表

| # | 弹窗 | M1 动效 | M2 毛玻璃 | M3 遮罩关 | M4 Esc | M5 星号 | M6 loading | M7 错误 | M8 清理 | M9 防重 | 综合 |
|---|------|--------|----------|----------|--------|---------|----------|---------|---------|---------|------|
| M-A | 设置 | ✅ | ✅ | ❌ | ✅ | N/A | ❌ B03 | ✅ | ⚠️ | ❌ | PARTIAL |
| M-B | 大任务 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | PARTIAL |
| M-C | 实际工时 | ⚠️ | ✅ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | PARTIAL |
| M-D | 课程输入 | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | 风险 |
| M-E | 深度规划 | ✅ | ✅ | ❌ | ✅ | N/A | ✅ | ✅ | ✅ | ✅ | PASS- |
| M-F | 当日详情 | ✅ | ✅ | ✅ | ✅ | N/A | N/A | N/A | ✅ | ✅ | **PASS** |
| M-G | Agent | ✅ | ✅ | ✅ | ✅ | N/A | ⚠️ | ✅ | ✅ | ✅ | **PASS** |
| M-H | ReAct | ⚠️ | ✅ | ✅ | ❌ | N/A | N/A | N/A | ⚠️ | N/A | PARTIAL |
| M-I | 登录 | ✅ | ✅ | ❌* | ❌* | ⚠️ | ✅ | ✅ | N/A | ✅ | PASS- |

*M-I 登录态的点遮罩和 Escape 关闭被故意省略（避免误关）*

---

## 3. 侧边栏 / 抽屉

### 3.1 侧边栏 CSS 动画

**`#sidebarCollapsible` 动画**：`index.html:5854-5867`
```css
.sidebar-collapsible {
    transition: width 0.3s ease;  /* line 5859 */
    width: 40px;
}
.sidebar-collapsible.expanded {
    width: 480px;
}
```

**结论**：✅ **PASS** — 0.3s ease 动画流畅

### 3.2 右侧面板动画

**`.right-panel` 动画**：`index.html:5631`
```css
.right-panel {
    transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.35s ease;
    width: 0;
}
.right-panel.expanded {
    width: 340px;
}
```

**结论**：✅ **PASS** — 0.35s 缓动 + 阴影过渡

### 3.3 滚动位置保留

**问题**：`width` 过渡到 0 时，子元素 `overflow: hidden`，**滚动位置会自动重置**（`scrollTop` 不会持久化）

**检查源码**：
- `toggleRightPanel` (line 11529) — 没有任何 `scrollTop` 保存/恢复逻辑
- `openBigTaskModal` — 不修改侧边栏滚动位置

**结论**：❌ **FAIL** — 剧本 §2.4.4 要求"再点 B36 展开 → 滚动位置仍在 X"**未实现**

**修复建议**：
```javascript
// 在 toggleRightPanel 中保存
const sidebar = document.getElementById('sidebarCollapsible');
if (sidebar.classList.contains('expanded')) {
    const content = document.getElementById('timeSidebarContent');
    sidebar._savedScrollTop = content?.scrollTop || 0;
}
// 在重新展开时
setTimeout(() => {
    const content = document.getElementById('timeSidebarContent');
    if (content && sidebar._savedScrollTop !== undefined) {
        content.scrollTop = sidebar._savedScrollTop;
    }
}, 350);
```

### 3.4 响应式断点

**检查**：`@media` 规则

---

## 4. 修复优先级表

| 优先级 | 弹窗 | 缺陷 | 影响 |
|-------|------|------|------|
| P0 | M-A/M-B/M-C/M-D/M-E/M-H | **M3 点遮罩外关闭** 6 个弹窗缺失 | 用户必须按 Esc 或点 × |
| P1 | M-B/M-D | **M9 重复点击** 大任务/课程输入 | 栈污染 |
| P1 | M-A/B03 | **M6 保存 loading** | 用户狂点触发多次写盘 |
| P1 | 侧边栏 | **滚动位置不保留** | ux 体验差 |
| P2 | M-H | **M4 Escape 关闭** ReAct | 需点 × 才能关 |
| P2 | 全局 | **M10 键盘 tab 顺序** 无 :focus-visible | a11y 弱 |
| P2 | M-C/M-D | **M6/M7 loading 错误** 实际工时/课程输入 | 静默失败 |

---

## 5. 截图证据

| 场景 | 预期 | 状态 |
|------|------|------|
| M-A 设置打开 | phase3-modal-1-settings-open.png | 待 GUI |
| M-A Esc 关闭 | phase3-modal-3-settings-esc-close.png | 待 GUI |
| M-A 遮罩关闭 | phase3-modal-2-settings-blur-close.png | **预期 FAIL**（待 GUI 确认）|
| M-B 大任务必填星号 | phase3-modal-4-bigtask-required.png | 待 GUI |
| M-B 保存 loading | phase3-modal-5-bigtask-saving.png | 待 GUI |
| 侧边栏展开动画 | phase3-sidebar-1-expanded.png | 待 GUI |
| 侧边栏滚动保留 | phase3-sidebar-4-reopened-same-position.png | **预期 FAIL**（待 GUI 确认）|

---

**报告生成时间**：2026-06-04
**审计方式**：纯静态
**已知遗留缺陷（M3 遮罩关闭 6 弹窗）**：与 ux-interaction-audit 中"弹窗缺遮罩外关闭"一致，**未修复**
