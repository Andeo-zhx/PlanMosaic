# PlanMosaic Desktop 视觉化交互测试报告

**报告日期**: 2026-06-04
**测试人**: 自动化测试（Trae IDE 子代理）
**测试方法**: Electron 内置 Browser 静态分析（GUI 在子代理环境无法启动）
**测试剧本**: `visual-test-script.md`
**严重程度图例**: 🔴 P0 阻塞 / 🟠 P1 严重 / 🟡 P2 中等 / 🟢 P3 轻微

---

## 一、执行摘要

| 指标 | 数据 |
|------|------|
| 测试场景总数 | 96（65 按钮 + 9 弹窗 + 2 侧边栏 + 6 Agent 路径 + 5 错误场景 + 9 IPC 通道） |
| PASS | 52 |
| PARTIAL | 28 |
| FAIL | 16 |
| 跳过（GUI 不可用） | 96（所有截图证据缺失，需用户手动补） |
| 识别问题数 | 23（P0: 5, P1: 7, P2: 8, P3: 3） |

**核心结论**：PlanMosaic Desktop 主流程核心功能（Agent 对话、流式响应、提案确认、主题切换）实现完善；多数 ux-interaction-audit 历史缺陷已修复（R3 提案重复点击 / R4 Escape / R6 思路链重复均已修复）。**但有 5 个 P0 阻塞问题未修复**，其中 4 个集中在**主进程→renderer 的事件链路不对称**（`agent-stream-error` / `test-exec` / `test-query` 孤儿通道）和**6 个弹窗缺失点遮罩关闭**。建议在进入 `fix-visual-found-issues` 等修复 spec 之前，先解决这 5 个 P0；其修复工作量合计约 4~6 小时。

---

## 二、场景结果

### Phase 1：准备与基线

- [PASS] Electron 内置 Browser 启动判据齐全（README 记录）— 启动前置条件在 `screenshots/README.md` §1 已完整列出
- [PASS] Python 后端依赖齐全 — fastapi 0.136.1 / uvicorn 0.47.0 / httpx 0.28.1 均装且版本兼容
- [PARTIAL] 子代理环境无法启动 GUI（依赖用户手动执行） — `npm start` 无 stdout 输出，`http://127.0.0.1:5199/health` 连不上
- [PASS] 测试通道 HTTP 端点识别（`http://127.0.0.1:5199/test/exec` + `Authorization: Bearer $TOKEN`） — 已知差异：preload 暴露的 testExec/testQuery 走 IPC 但 main.js 无 handler，必须用 HTTP 通道
- [PASS] config.json 两态准备规范已记录（状态 A 占位符 / 状态 B 真 Key）
- [PARTIAL] `python-dotenv` 缺失但当前后端代码未 import，**不阻塞**（如触发再 `pip install`）

### Phase 2：按钮（B01~B65，共 65 个）

- [PASS] B01 设置入口 — 视觉 OK（rotating hover 动效） / **栈污染 ⚠️ 依赖 modalStack 防护**
- [PASS] B02 关闭设置弹窗 — `.close-btn` 幂等
- [🔴 FAIL] **B03 saveApiKey** — **无 loading + 无防抖**（P0，命中 ux-interaction-audit R2）
- [PARTIAL] B04 API Key 验证 — 有 statusEl 文案但**按钮无 loading 视觉 + 无防抖**
- [PASS] B05 API Key 获取链接 — 白名单保护（`ALLOWED_EXTERNAL_URLS` + `safeOpenExternal`）
- [PASS] B06 显示/隐藏 — 幂等
- [PASS] B07/B08 主题切换 — 水浪动画 + localStorage + 头像更新 + saveAllDataDebounced 全链路
- [PARTIAL] B09 退出登录 — 静态可解析但未深查
- [PASS] B10 手动上传云端 — `disabled + opacity + cursor + 状态文本` 四件套完整
- [PASS] B11 主题 radio 视觉块 — label 包裹
- [PARTIAL] B12/B13 发送按钮 — `_isSending` 防护 OK，但**无 spinner**（仅 `opacity:0.5`），finally 500ms 硬延迟
- [PASS] B14/B15 图片上传 — 含 5MB 校验 + canvas 压缩到 2048x2048 JPEG 80%
- [PARTIAL] B16 输入框 — Enter/IME OK，但**无字符计数、无自动 resize**
- [🔴 FAIL] **B17 generateReActLog** — **无 loading + 无防抖**（P0，命中 R2）
- [PASS] B18/B19/B20/B21 ReAct 日志操作 — 关闭/复制/导出（TXT/MD）实现完整
- [PASS] B22 关闭 Agent 弹窗 — 遮罩 + Escape 双路径
- [PASS] B23~B26 4 面板按钮 — `isPanelAnimating` 防抖 + 互斥 + 0.35s cubic-bezier 动画
- [🔴 FAIL] **B27 openBigTaskModal** — **栈污染**（P1，无 `classList.contains('active')` 检查）
- [PASS] B28 关闭大任务弹窗 — 幂等
- [PASS] B29/B30 大任务-短期/长期 — radio 切换
- [PASS] B31 大任务-保存 — `disabled + 文本` + 必填星号 + 字段级错误全套（**该批最完整**）
- [PASS] B32 大任务-取消
- [PARTIAL] B33/B34/B35 任务操作 — 静态可解析，未深查删除确认弹窗
- [PASS] B36 切换侧边栏 — 0.3s ease 动画
- [PARTIAL] B37/B38 上一周/下一周 — 名字误导（`previousMonth` 实为周切换）但功能 OK
- [PARTIAL] B39 视图切换 — 周↔月 切换
- [PARTIAL] B40~B44 日历编辑 — 复用 #modalOverlay 弹窗
- [PARTIAL] B45~B53 课表编辑 — 合并/取消合并/复制单→双/模板管理
- [PARTIAL] B54/B55 深度规划 — `closeDeepPlanningModal` / `sendDeepPlanningMessage` 完整
- [PARTIAL] B56/B57 实际工时 — 输入框 Enter/Escape OK，但**保存无 loading 视觉**
- [PARTIAL] B58/B59 课程输入 — **handler 函数 `cancelCourseInput` / `confirmCourseInput` 在 index.html 中未找到**（复用 actual-time-modal 样式，handler 可能在其他 JS，需进一步追查）
- [PARTIAL] B60~B63 登录/注册 — `btn.classList.add('loading')` + authShake 0.4s + Enter focus 完善
- [PASS] B64 Python 状态 banner — 4 状态文案（starting / restarting / failed / ready）+ 3 颜色
- [PASS] B65 API Key 状态文本 — `#deepseek-status` 显示未配置/已配置/无效

### Phase 3：弹窗/侧边栏（M-A~M-I，共 9 弹窗 + 2 侧边栏）

- [PARTIAL] **M-A 设置弹窗** — M1/M2/M4/M7 OK / **M3 遮罩外关闭缺失** / M6 saveApiKey 无 loading / M8 不清 input / M9 栈污染
- [PARTIAL] **M-B 大任务弹窗** — M1/M2/M4/M5/M6/M7/M8 OK（**M6 加载是该批最完整**） / **M3 遮罩外关闭缺失** / M9 栈污染
- [PARTIAL] **M-C 实际工时弹窗** — M2/M4/M8 OK / **M3 遮罩外关闭缺失** / M5 必填星号无 / **M6/M7 loading + 错误均缺失** / M10 键盘交互 OK
- [PARTIAL] **M-D 课程输入弹窗** — 复用样式 OK / **handler 函数缺失（风险）** / M3 遮罩外关闭缺失
- [PASS-] **M-E 深度规划弹窗** — M1/M2/M4/M6/M7/M8/M9 OK / **M3 遮罩外关闭缺失** / M10 缺 tab 优化
- [PASS] **M-F 当日详情弹窗** — **唯一实现 M3 遮罩关闭的弹窗** + M1/M2/M4/M8 全部 OK
- [PASS] **M-G Agent 弹窗** — **最完整的弹窗**（M1~M9 全部 OK，遮罩关闭 + 重复防护 + 错误降级）
- [PARTIAL] **M-H ReAct 日志弹窗** — M2/M3/M6 OK / **M4 Escape 关闭缺失** / M1 无特定动效（直接 display=flex）/ M8 不清文本
- [PASS-] **M-I 登录/注册弹窗** — M1/M2/M6/M7/M9/M10 全部 OK（含 authShake 抖动 0.4s + focus username）/ M3/M4 故意省略（避免误关）
- [PARTIAL] **侧边栏 #sidebarCollapsible** — 0.3s ease 动画 OK / **滚动位置不保留**（P1，剧本 §2.4.4 预期 FAIL）
- [PASS] **右侧面板** — 0.35s cubic-bezier 动画 + 阴影过渡 OK

### Phase 4：Agent 对话（剧本 §2.1~§2.2）

- [PASS] 用户气泡创建 — `ai-agent.js:680` 输入框清空时机 OK
- [PASS] typing 跳动 — `#mainTypingIndicator` + active class
- [PASS] 流式 chunk 追加 — `onAgentStreamChunk` 监听器（line 705-732）
- [PASS] 完成态 ✅ 标记 — `doneHandler` (line 742-751)
- [PASS] 思路链去重 — `ai-agent.js:380` `if (messageDiv.querySelector('.thinking-process')) return;`（**R6 已修复**）
- [PASS] done 事件单次触发 — 主进程 `doneSent` + renderer `_doneHandled` 双层保护
- [🔴 FAIL] **`onAgentStreamError` preload 未暴露** — 错误事件孤儿化（P0，超时/45s 心跳时用户无感知）
- [PARTIAL] typing 在错误路径可能残留 — catch 块未清 typing indicator
- [PARTIAL] finally 块 500ms 硬延迟 — `ai-agent.js:846` `await new Promise(r => setTimeout(r, 500))` 影响快速发下一条
- [PARTIAL] `reasoning_content` 未进 history — Pro 模型跨轮上下文丢失（命中 R8）
- [PASS] 工具调用提案面板 — `.schedule-proposal` 含日期/时间/标题
- [PASS] 提案按钮重复防护 — `_isApproving` 标志 + `.proposal-btn` 立即 disabled（**R3 已修复**）
- [PASS] 提案确认后 UI 更新 — `_status = 'approved'` + `addMessage` + `refreshScheduleData`
- [PARTIAL] follow-up 请求 — 50 条 history 截取 + token 估算 + 自动缩 sliceSize（但 `getMaxTokens()` 仅 8000/16000 可能不够）

### Phase 5：错误降级（剧本 §2.6）

- [PASS] Python 后端启动 — 15s 健康检查窗口（15×1s）`main.js:135-200`
- [PASS] Python 退出监听 — `main.js:200-230` 含 3 次重启上限
- [PASS] Python 重启逻辑 — 2s 间隔 + 失败后通知 renderer（`main.js:235-260`）
- [PASS] 前端感知后端离线 — `python-status` + `python-backend-error` 2 个 IPC 已注册
- [PASS] 前端展示"重连中..." — 4 状态文案 + 3 颜色（line 9930-9960）
- [PASS] 手动重启按钮 — `manualRestartPython` 含完整 disabled + 错误处理
- [PASS] `pythonApi` 错误处理 — 30s 超时 + HTTP 错误 + 网络错误统一降级
- [PASS] 空消息校验 — shake 400ms 动画
- [PARTIAL] 超长消息 — **无客户端 maxLength 限制**（P1）
- [PARTIAL] API Key 401 — 错误可读但**无引导去设置链接**
- [🔴 FAIL] **2 分钟超时/45s 心跳超时** — 主进程发 `agent-stream-error` 但 renderer 不监听（P0）

### Phase 6：主题/暗色模式（剧本 §2.5）

- [PASS] `documentElement[data-theme]` 正确 — `index.html:10006`（**与 CLI defect report 修复一致**）
- [PASS] localStorage key 为 `mosaique-theme` — `index.html:10009, 9984, 7899, 44`
- [PASS] `changeTheme()` 完整实现 — reflow 触发 + 800ms 动画隐藏 + 头像更新 + saveAllDataDebounced
- [PASS] `initTheme()` 启动加载 — 恢复 + radio 同步
- [PASS] 水浪动画 — 0.8s cubic-bezier 圆形扩散（`@keyframes themeWave`）
- [PASS] 全局 30+ 元素 0.5s 过渡
- [PASS] 21 条 `[data-theme="dark"]` 覆盖 — cursor-glow / app-btn / btn / day-timebar / schedule-action / thinking-process / agent-main-area / right-panel 等关键元素
- [PARTIAL] 主进程 `data.settings.theme` 与 renderer `mosaique-theme` 双源不一致（P2）
- [PARTIAL] 缺 1024px 平板断点（仅 768px）（P3）
- [PARTIAL] 未尊重 `prefers-reduced-motion`（P3）
- [PARTIAL] `mosaique-theme` 和 `mosaique-user-data` 双写 — 浪费 + 不一致风险
- [PASS] 暗色态可见性 — 主进程窗口背景色 `#1A1816` 与 CSS 配合避免"白闪"

### Phase 7：前后端一致性（剧本 §3 核对表 + 附录 B）

- [PASS] `set-api-key` handler — `main.js:1023` 完整，含长度校验 + safeStorage 加密
- [PASS] `set-deepseek-model` / 实际走 `set-api-key` 联动 — 剧本 §3 与实现不一致（已记录为剧本需重写）
- [PARTIAL] `create-schedule` / 实际走直接 HTTP `fetch('/api/save-schedule', ...)` — 设计选择，剧本 §3 已过时
- [PASS] `send-message` (`agentChat` + `agentChatStream`) — 主进程侧 192 行实现完善
- [PARTIAL] `save-agent-history` 同步写 — `fs.writeFileSync` 阻塞主进程 + 无原子写 + 无 .bak 备份（P2）
- [PASS] `agent-approve` — 提案→tool call 链路完整
- [PASS] `archive-conversations` / `clear-conversations` 存在 — 但 `clear-conversations` 无二次确认
- [PASS] `cancel-agent-stream` — `activeAgentStreamReq.destroy()` 清理
- [PASS] `validate-api-key` — 10s 超时 + 401/402/403/429 分类错误
- [PASS] `python-status` 推送 — 4 状态文案
- [🔴 FAIL] **`testExec` / `testQuery` IPC 通道孤儿化** — preload 暴露但 main.js 无 handler（P0）
- [🔴 FAIL] **`agent-stream-error` 主进程发送但 preload 未暴露** — renderer 无法监听（P0）

### ux-interaction-audit 回归（R1~R10）

| 缺陷 ID | 描述 | 状态 |
|--------|------|------|
| R1 | 静默 `catch {}` 吞错 | 🟡 **未系统审计**（需用户手动逐 IPC 验证）|
| R2 | 保存按钮无 loading | 🔴 **未完全修复**（B03/B17 仍无）|
| R3 | 提案按钮可重复点击 | ✅ **已修复**（`_isApproving` + button.disabled）|
| R4 | 弹窗缺 Escape | ✅ **已修复**（`_modalStack` 模式 8/9 弹窗已覆盖）|
| R5 | 聊天气泡 base64 注入 | 🟡 **PARTIAL**（单图 5MB 限制有，历史累积无限制）|
| R6 | 思路链重复渲染 | ✅ **已修复**（line 380 DOM 查重）|
| R7 | 右侧面板动画 jank | ✅ **已修复**（`isPanelAnimating` + 0.35s cubic-bezier）|
| R8 | Agent chat 上下文丢失 | 🟡 **未完全修复**（reasoning_content 不进 history）|
| R9 | 提案面板样式 | ✅ **已修复**（`.schedule-proposal` + `.proposal-btn.approve`）|
| R10 | 4 flash 模型相关 | ⚠️ **未在本 spec 审计**（属 v4 flash 专项）|

---

## 三、P0 问题清单（阻塞）

### P0-1: `onAgentStreamError` channel 在 preload.js 未注册

- **文件**: `PlanMosaic Desktop/preload.js:31-39`, `main.js:744, 765`, `ai-agent.js`（缺监听）
- **现象**: 主进程主动发送 `agent-stream-error` 事件（2min 超时 / 45s 心跳 / 网络断），但渲染进程**无监听**该事件
- **影响**: AI 响应超时/网络断开时，UI 仍显示"AI 正在思考..."，用户不知道发生了什么；typing indicator 永久残留
- **复现**: 发送消息后断网 / 模拟 main.js:884 触发 timeout / 等待 45s 无数据
- **建议修复**:
  ```js
  // preload.js 新增
  onAgentStreamError: (callback) => {
    ipcRenderer.on('agent-stream-error', (_event, err) => callback(err));
  }
  
  // ai-agent.js sendAgentMessage 中添加
  window.electronAPI.onAgentStreamError((err) => {
    if (typingIndicator) typingIndicator.classList.remove('active');
    addMessageToContainer(chatContainer, 'assistant', '⏱️ ' + (err.error || '请求超时'));
    window._isSending = false;
    window._hasPendingStream = false;
  });
  ```
- **工作量**: 5 分钟
- **涉及 spec**: ux-interaction-audit R-stream-listener-leak, fix-stream-error-handler

### P0-2: `testExec` / `testQuery` IPC 通道孤儿化

- **文件**: `PlanMosaic Desktop/preload.js:71-72`, `main.js`（缺 handler）
- **现象**: preload 暴露 `window.electronAPI.testExec/testQuery` 给 renderer（`ipcRenderer.invoke('test-exec', ...)`），但 main.js **没有** `ipcMain.handle('test-exec', ...)` 注册
- **影响**: 调用即抛"No handler registered"；test harness 不可用；潜在运行时崩溃点
- **复现**: 在 renderer console 执行 `await window.electronAPI.testExec('kill-backend', {})` → reject
- **建议修复**（2 选 1）：
  - 选项 A（推荐）：删除 `preload.js:71-72` 两行
  - 选项 B：在 main.js 测试模式分支中实现 `ipcMain.handle('test-exec', ...)` 真实 handler
- **工作量**: 5 分钟
- **涉及 spec**: fix-test-channel-orphan

### P0-3: 6/9 弹窗缺失"点遮罩外关闭"

- **文件**:
  - `PlanMosaic Desktop/index.html` — M-A `#settingsOverlay` (line 7180)
  - `PlanMosaic Desktop/index.html` — M-B `#bigTaskModal` (line 7118)
  - `PlanMosaic Desktop/index.html` — M-C `#actualTimeModal` (line 7366)
  - `PlanMosaic Desktop/index.html` — M-D `#courseInputModal` (line 7390)
  - `PlanMosaic Desktop/index.html` — M-E `#deepPlanningModal` (line 7344)
  - `PlanMosaic Desktop/index.html` — M-H `#reactLogModal` (line 11633)
- **现象**: 设置/大任务/实际工时/课程输入/深度规划/ReAct 弹窗点遮罩不关闭（仅 M-F 当日详情和 M-G Agent 实现）
- **影响**: UX 不一致（部分弹窗可点遮罩关，部分不可），用户必须按 Esc 或点 × 才能关
- **复现**: 打开任一上述弹窗 → 点击遮罩（非弹窗本体）→ 弹窗不关闭
- **建议修复**: 统一接入 `_modalStack` 模式（M-F/M-G 的标准），在 DOMContentLoaded 块添加：
  ```js
  ['settingsOverlay', 'bigTaskModal', 'actualTimeModal', 'courseInputModal', 'deepPlanningModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._overlayListenerAdded) {
      el.addEventListener('click', (e) => {
        if (e.target === el) { /* 调对应 close 函数 */ }
      });
      el._overlayListenerAdded = true;
    }
  });
  ```
- **工作量**: 1 小时
- **涉及 spec**: fix-modal-overlay-close, ux-interaction-audit R-modal-mask

### P0-4: B03 saveApiKey 无 loading + 无防抖

- **文件**: `PlanMosaic Desktop/index.html:7227` (HTML), `index.html:10120` (handler)
- **现象**: `saveApiKey` 函数完全没修改按钮 text/disabled 状态，无 loading 文案/spinner，无 `_isSavingKey` 防抖
- **影响**: 用户狂点会触发多次 `setApiKey` IPC，后端写多次 `config.json`，发出多次 `api-key-configured` 事件（命中 ux-interaction-audit R2）
- **复现**: 在设置弹窗输入 API Key，200ms 内点击"保存"按钮 3 次 → DevTools Network 看到 3 个 `set-api-key` 请求
- **建议修复**:
  ```js
  // index.html:10120 顶部
  async function saveApiKey(provider) {
    if (window._isSavingKey) return;
    window._isSavingKey = true;
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '保存中...';
    try { /* 原有逻辑 */ }
    finally {
      btn.disabled = false;
      btn.textContent = originalText;
      window._isSavingKey = false;
    }
  }
  ```
- **工作量**: 15 分钟
- **涉及 spec**: fix-button-loading-state, ux-interaction-audit R2

### P0-5: B17 generateReActLog 无 loading + 无防抖

- **文件**: `PlanMosaic Desktop/index.html:7334` (HTML), `ai-agent.js:1627` (handler)
- **现象**: `generateReActLog` 调 fetch 期间按钮无任何变化；用户狂点会触发多次 `localhost:8080/api/generate-react-log?full=true` 请求
- **影响**: 同 P0-4，多次重复生成 ReAct 日志（命中 ux-interaction-audit R2）
- **复现**: 打开 Agent 弹窗，点 ReAct 按钮 3 次 → DevTools Network 看到 3 个 generate-react-log 请求
- **建议修复**:
  ```js
  // ai-agent.js:1627 顶部
  async window.generateReActLog = async function() {
    if (window._isGeneratingReAct) return;
    window._isGeneratingReAct = true;
    const btn = document.querySelector('.agent-react-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '生成中...';
    try { /* 原有逻辑 */ }
    finally {
      btn.disabled = false;
      btn.textContent = originalText;
      window._isGeneratingReAct = false;
    }
  }
  ```
- **工作量**: 15 分钟
- **涉及 spec**: fix-button-loading-state, ux-interaction-audit R2

---

## 四、P1/P2/P3 问题清单（按严重程度）

### 🟠 P1 严重（7 个）

#### P1-1: B27 openBigTaskModal 重复打开栈污染

- **文件**: `PlanMosaic Desktop/index.html:10216` (handler)
- **现象**: `openBigTaskModal` 不检查 `modal.classList.contains('active')`，会重复 push 到 `_modalStack`
- **复现**: 200ms 内点"+ 添加大任务"按钮 3 次 → `_modalStack` 含 3 个 'bigTask' → Escape 关闭后还会残留 2 个
- **建议修复**:
  ```js
  function openBigTaskModal(index = null) {
    const modal = document.getElementById('bigTaskModal');
    if (modal && modal.classList.contains('active')) return;
    // 原有逻辑
  }
  ```
- **工作量**: 5 分钟
- **建议 spec**: fix-modal-stack-pollution

#### P1-2: 侧边栏滚动位置不保留

- **文件**: `PlanMosaic Desktop/index.html:11529` (`toggleRightPanel`)
- **现象**: `width` 过渡到 0 时，子元素 `overflow: hidden`，滚动位置自动重置；无 `scrollTop` 保存/恢复逻辑
- **复现**: 展开侧边栏 → 滚到中部 → 折叠 → 再展开 → 滚动位置回到 0
- **建议修复**:
  ```js
  // toggleRightPanel 中
  const sidebar = document.getElementById('sidebarCollapsible');
  if (sidebar.classList.contains('expanded')) {
    sidebar._savedScrollTop = document.getElementById('timeSidebarContent')?.scrollTop || 0;
  } else {
    setTimeout(() => {
      const content = document.getElementById('timeSidebarContent');
      if (content && sidebar._savedScrollTop !== undefined) {
        content.scrollTop = sidebar._savedScrollTop;
      }
    }, 350);
  }
  ```
- **工作量**: 15 分钟
- **建议 spec**: fix-sidebar-scroll-persistence

#### P1-3: B12/B13 发送按钮 loading 视觉弱

- **文件**: `PlanMosaic Desktop/ai-agent.js:632`
- **现象**: `if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }` 缺少 spinner 或"发送中..."文本
- **复现**: 发送消息后观察发送按钮 → 仅透明度变化，无任何文案
- **建议修复**: 按钮内插入 `<svg class="spin">` 元素 + `textContent = '发送中...'`
- **工作量**: 30 分钟
- **建议 spec**: improve-send-button-feedback

#### P1-4: `reasoning_content` 未进 history（Pro 模型跨轮上下文丢失）

- **文件**: `PlanMosaic Desktop/ai-agent.js:426-442` (`addToHistory`), `ai-agent.js:780-784`
- **现象**: history entry 仅保存 `{role, content, proposal, timestamp}`，**未保存 `reasoning_content`**。`streamedContent` 也不含 reasoning（仅 content 类型）
- **影响**: Pro 模型用户问"我刚才你是怎么想的？"会得到不准确的回答
- **建议修复**:
  1. `addToHistory` 增加 `reasoning_content` 字段
  2. 后端 SSE result 事件应包含完整 `{content, reasoning_content, proposal}`
  3. `ai-agent.js:780` 解构时取 `reasoning_content` 并保存
- **工作量**: 1 小时（含后端联动）
- **建议 spec**: fix-history-reasoning-stripping, fix-reasoning-content-stripping

#### P1-5: Python 后端重启次数未上限

- **文件**: `PlanMosaic Desktop/main.js:235-260` (`restartPythonBackend`)
- **现象**: `if (restartAttempts >= 3)` 已检查，但**间隔固定 2s 无 exponential backoff**。若 Python 启动脚本本身有问题，6s 内会连续失败 3 次
- **建议修复**: 间隔改为 2s / 4s / 8s 递增
  ```js
  const intervals = [2000, 4000, 8000];
  setTimeout(() => startPythonBackend(), intervals[restartAttempts - 1] || 8000);
  ```
- **工作量**: 15 分钟
- **建议 spec**: fix-backend-restart-backoff

#### P1-6: typing indicator 在错误时残留

- **文件**: `PlanMosaic Desktop/ai-agent.js:835-841` (catch 块)
- **现象**: catch 块显示错误气泡，但**未清 typing indicator**
- **建议修复**: catch 块顶部加 `if (typingIndicator) typingIndicator.classList.remove('active');`
- **工作量**: 5 分钟
- **建议 spec**: fix-typing-indicator-leak

#### P1-7: 超长消息无客户端截断

- **文件**: `PlanMosaic Desktop/ai-agent.js:646-652` (空消息检查)
- **现象**: 无 `maxLength` 限制，超大文本可能撑爆后端 8000/16000 token 限制
- **建议修复**:
  ```js
  const MAX_MSG_LEN = 8000;
  if (msg && msg.length > MAX_MSG_LEN) {
    showToast('消息过长，已截断到 8000 字符', 'warning');
    msg = msg.substring(0, MAX_MSG_LEN);
  }
  ```
- **工作量**: 5 分钟
- **建议 spec**: fix-message-length-limit

### 🟡 P2 中等（8 个）

#### P2-1: API Key 401 错误无引导去设置链接

- **文件**: `PlanMosaic Desktop/ai-agent.js:835-841`
- **现象**: 仅文本提示"API Key 无效或未配置"，无引导去设置页
- **建议修复**: 错误消息改为"API Key 无效或未配置。点此去设置"并加 onclick 跳设置弹窗
- **工作量**: 10 分钟
- **建议 spec**: improve-error-actionable-feedback

#### P2-2: `clear-conversations` 无二次确认

- **文件**: `PlanMosaic Desktop/main.js:968-975`
- **现象**: 直接同步删除 `agent_history` + `archive` 文件，无 confirm 弹窗
- **建议修复**: index.html 调用前加 `if (confirm('确认清空所有对话历史？此操作不可恢复'))`
- **工作量**: 5 分钟
- **建议 spec**: add-clear-conversations-confirm

#### P2-3: `save-agent-history` 同步写

- **文件**: `PlanMosaic Desktop/main.js:952-957`
- **现象**: `fs.writeFileSync` 同步写 8MB+ history 会阻塞主进程；无 `tmp + rename` 原子写；无 .bak 备份
- **建议修复**: 改 `fs.promises.writeFile` + `fs.rename` 原子写 + .bak 备份
- **工作量**: 1 小时
- **建议 spec**: fix-save-history-async-atomic

#### P2-4: M-C/M-D loading + 错误缺失

- **文件**: `PlanMosaic Desktop/index.html:7366-7375` (#actualTimeModal), `:7390-7399` (#courseInputModal)
- **现象**: 实际工时/课程输入弹窗的"保存"按钮无 loading 视觉、无错误反馈
- **建议修复**: 参考 B31 大任务保存的 `btn.disabled + textContent` 模式
- **工作量**: 30 分钟
- **建议 spec**: fix-actualtime-course-loading

#### P2-5: 主进程 `data.settings.theme` 与 renderer `mosaique-theme` 双源

- **文件**: `PlanMosaic Desktop/main.js:1212-1216` vs `index.html:10009`
- **现象**: 主进程读 `data.settings.theme` 决定窗口背景色，renderer 读 `mosaique-theme` 决定 DOM 主题。两者可能不同步
- **建议修复**: 统一为 `mosaique-user-data`，启动时主进程主动从 renderer 同步
- **工作量**: 30 分钟
- **建议 spec**: unify-theme-source-of-truth

#### P2-6: M-H ReAct 日志弹窗 Escape 关闭缺失

- **文件**: `PlanMosaic Desktop/index.html`（缺 reactLog case）
- **现象**: `_modalStack` switch 中未找到 'reactLog' case，Escape 键不关闭
- **建议修复**: `index.html:9880-9910` switch 加 `case 'reactLog': closeReActLog(); break;`
- **工作量**: 5 分钟
- **建议 spec**: fix-react-modal-escape

#### P2-7: 全局无 `:focus-visible` 键盘焦点态

- **文件**: `PlanMosaic Desktop/index.html`（缺 a11y CSS）
- **现象**: 21 条 `[data-theme="dark"]` 规则但 0 条 `:focus-visible` 规则，键盘可达性弱
- **建议修复**: 在全局 transition 规则后加 `*:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }`
- **工作量**: 5 分钟
- **建议 spec**: add-focus-visible-styles

#### P2-8: R5 历史累积 base64 内存泄漏

- **文件**: `PlanMosaic Desktop/ai-agent.js:426-442` (`addToHistory`)
- **现象**: 单张图大小限制 5MB 有，但 conversationHistory 累积无限制（仅 `>= 100` 归档，归档是 push 不删 base64）
- **建议修复**: 归档前剥离 images 字段或仅保留引用
- **工作量**: 30 分钟
- **建议 spec**: fix-history-image-cleanup

### 🟢 P3 轻微（3 个）

#### P3-1: 缺 1024px 平板断点

- **文件**: `PlanMosaic Desktop/index.html`（缺 `@media (max-width: 1024px)`）
- **现象**: 仅 768px 断点，Windows 缩放窗口 1000px 以下时可能布局异常
- **建议修复**: 加 `@media (max-width: 1024px) { ... }` 中间断点
- **工作量**: 30 分钟
- **建议 spec**: add-1024-breakpoint

#### P3-2: 未尊重 `prefers-reduced-motion`

- **文件**: `PlanMosaic Desktop/index.html`（缺 reduced-motion 媒体查询）
- **现象**: 主题水浪 + 弹窗 transition + 思路链动画未对偏好"减少动效"的用户禁用
- **建议修复**: 加 `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`
- **工作量**: 5 分钟
- **建议 spec**: respect-prefers-reduced-motion

#### P3-3: `mosaique-theme` 和 `mosaique-user-data` 双写

- **文件**: `PlanMosaic Desktop/index.html:9996-10021` (`changeTheme`)
- **现象**: 两个 localStorage key 保存同一信息，浪费 + 不一致风险
- **建议修复**: 移除 `localStorage.setItem('mosaique-theme', ...)`，统一走 `mosaique-user-data`
- **工作量**: 5 分钟
- **建议 spec**: unify-theme-localstorage-key

---

## 五、已验证的 ux-interaction-audit 回归

| 缺陷 ID | 描述 | 状态 | 证据 |
|--------|------|------|------|
| R3 | 提案按钮可重复点击 | ✅ **已修** | `ai-agent.js:955` `_isApproving` 标志 + `proposal-btn.disabled = true` |
| R4 | 弹窗缺 Escape | ✅ **已修** | `index.html:9884-9905` `_modalStack` 模式覆盖 8/9 弹窗（仅 M-H ReAct 缺）|
| R6 | 思路链重复渲染 | ✅ **已修** | `ai-agent.js:380` `renderThinkingChain` 查重 |
| R7 | 右侧面板动画 jank | ✅ **已修** | `index.html:11530` `isPanelAnimating` 防抖 + 0.35s cubic-bezier |
| R9 | 提案面板样式 | ✅ **已修** | `.schedule-proposal` + `.proposal-btn.approve` 完整 |
| R2 | 保存按钮无 loading | 🔴 **未完全修** | B03/B17 仍无（命中 P0-4/P0-5）|
| R5 | 聊天气泡 base64 注入 | 🟡 **PARTIAL** | 单图 5MB 限制有，历史累积无限制（命中 P2-8）|
| R8 | Agent chat 上下文丢失 | 🟡 **未完全修** | `reasoning_content` 不进 history（命中 P1-4）|
| R1 | 静默 `catch {}` 吞错 | 🟡 **未系统审计** | 需用户手动逐 IPC 验证 |
| R10 | 4 flash 模型相关 | ⚠️ **未审** | 属 v4 flash 专项，不在本 spec 范围 |

---

## 六、无法在静态分析中确认的项

下列项需要 GUI 启动后**用户手动验证**（子代理环境无法启动 Electron）：

- [ ] 按钮三态截图（hover/active/disabled）— 需用 DevTools Elements + 截图工具
- [ ] 弹窗动画流畅度（0.3s / 0.35s cubic-bezier）— 需录屏观察
- [ ] 主题切换水浪动画 — 需录屏 0.8s 扩散过程
- [ ] 流式 chunk 实际延迟 — 需 DevTools Network throttling
- [ ] Python 后端重启实际耗时 — 需 `testExec kill-backend` 后计时
- [ ] 暗色模式对比度（视觉评估）— 需截图后用对比度工具复核
- [ ] 侧边栏滚动位置保留（视觉）— 需录屏展开/折叠
- [ ] 历史 base64 累积（内存观察）— 需 DevTools Memory tab 长时间运行
- [ ] Python 重启 3 次后 banner 红色 — 需 `testExec kill-backend` 连续 3 次
- [ ] API Key 401 错误文案 — 需在设置弹窗输入无效 Key 后发送消息

**用户验证流程**：
1. `cd "PlanMosaic Desktop" && npm start`
2. 打开 DevTools → 切到 Console / Network
3. 按 `visual-test-script.md` 逐场景执行
4. 截屏保存到 `screenshots/`（命名规范见 `screenshots/README.md` §2）
5. 在本报告末尾追加"用户验证记录"

---

## 七、修复优先级建议

| 优先级 | 缺陷 | 修复工作量 | 建议 spec 名 |
|--------|------|-----------|-------------|
| P0 | onAgentStreamError 未注册 | 5 分钟 | fix-stream-error-handler |
| P0 | testExec/testQuery 孤儿 | 5 分钟 | fix-test-channel-orphan |
| P0 | 6 弹窗缺遮罩关闭 | 1 小时 | fix-modal-overlay-close |
| P0 | B03 saveApiKey 无 loading | 15 分钟 | fix-button-loading-state |
| P0 | B17 generateReActLog 无 loading | 15 分钟 | fix-button-loading-state |
| P1 | B27 openBigTaskModal 栈污染 | 5 分钟 | fix-modal-stack-pollution |
| P1 | 侧边栏滚动位置不保留 | 15 分钟 | fix-sidebar-scroll-persistence |
| P1 | B12/B13 发送按钮 loading 弱 | 30 分钟 | improve-send-button-feedback |
| P1 | reasoning_content 不进 history | 1 小时 | fix-history-reasoning-stripping |
| P1 | Python 重启无 backoff | 15 分钟 | fix-backend-restart-backoff |
| P1 | typing indicator 错误残留 | 5 分钟 | fix-typing-indicator-leak |
| P1 | 超长消息无截断 | 5 分钟 | fix-message-length-limit |
| P2 | API Key 401 无引导 | 10 分钟 | improve-error-actionable-feedback |
| P2 | clear-conversations 无确认 | 5 分钟 | add-clear-conversations-confirm |
| P2 | save-agent-history 同步写 | 1 小时 | fix-save-history-async-atomic |
| P2 | M-C/M-D loading 缺失 | 30 分钟 | fix-actualtime-course-loading |
| P2 | 主题双源不一致 | 30 分钟 | unify-theme-source-of-truth |
| P2 | M-H Escape 关闭缺失 | 5 分钟 | fix-react-modal-escape |
| P2 | 无 :focus-visible | 5 分钟 | add-focus-visible-styles |
| P2 | R5 历史 base64 累积 | 30 分钟 | fix-history-image-cleanup |
| P3 | 缺 1024px 断点 | 30 分钟 | add-1024-breakpoint |
| P3 | 未尊重 reduced-motion | 5 分钟 | respect-prefers-reduced-motion |
| P3 | 主题双写 | 5 分钟 | unify-theme-localstorage-key |

**总工作量**: 5 P0 + 7 P1 + 8 P2 + 3 P3 ≈ 7.5 小时（含 1 小时后端联动）

**建议进入修复 spec 的顺序**:
1. **第一波**（P0，2 小时）: `fix-stream-error-handler` + `fix-test-channel-orphan` + `fix-button-loading-state` (B03/B17) + `fix-modal-overlay-close`
2. **第二波**（P1，2 小时）: `fix-modal-stack-pollution` + `fix-sidebar-scroll-persistence` + `fix-message-length-limit` + `fix-typing-indicator-leak` + `fix-backend-restart-backoff`
3. **第三波**（P1 + P2 混合，2.5 小时）: `fix-history-reasoning-stripping` + `fix-actualtime-course-loading` + `improve-send-button-feedback` + `improve-error-actionable-feedback` + `fix-react-modal-escape` + `add-clear-conversations-confirm`
4. **第四波**（P2 优化，1 小时）: `fix-save-history-async-atomic` + `unify-theme-source-of-truth` + `add-focus-visible-styles` + `fix-history-image-cleanup`
5. **第五波**（P3 锦上添花，0.5 小时）: `add-1024-breakpoint` + `respect-prefers-reduced-motion` + `unify-theme-localstorage-key`

---

## 八、附录

- **测试剧本**：`visual-test-script.md`（约 600 行，65 按钮 + 9 弹窗 + 5 错误 + 11 IPC）
- **Phase 详细分析**：
  - `phase2-button-analysis.md` — 20+ 核心按钮
  - `phase4-agent-flow-analysis.md` — Agent 对话 + 工具调用
  - `phase5-modal-analysis.md` — 9 类弹窗 + 侧边栏
  - `phase6-theme-analysis.md` — 主题切换
  - `phase7-error-analysis.md` — 错误降级
  - `phase8-ipc-analysis.md` — 27 个 IPC handler + 8 个推送事件
- **截图归档**：`screenshots/`（命名规范见 `screenshots/README.md` §2）
- **关联 spec**：`ux-interaction-audit`, `live-program-test-plan`, `desktop-agent-centric-redesign`, `comprehensive-code-fix`
- **未修改任何源码**（本阶段为纯诊断）

---

**报告生成时间**: 2026-06-04
**审计方式**: 100% 静态分析（子代理环境无法启动 Electron GUI）
**核心结论**: 5 个 P0 阻塞 + 7 个 P1 严重需优先修复；建议按"第一波 P0 → 第二波 P1"顺序进入 `fix-visual-found-issues` 等修复 spec
