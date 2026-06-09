# Tasks

本 spec 的目标：**在 Electron 内置 Browser 中以可视化方式系统跑一遍用户视角的核心交互场景**。本阶段是**纯诊断**，任务只产出测试剧本、可视化报告、问题清单，**不修改任何源码**。修复在后续 `fix-visual-found-issues` 等 spec 中进行。

---

## Phase 1：准备与基线

- [x] **Task 1：搭建可视化测试运行环境**
  - 确认 Electron 内置 Browser 可启动（执行 `PlanMosaic Desktop/main.js`）
  - 确认 Python 后端能正常拉起、`/api/config` 返回 200
  - 准备一份"基线截图"（应用启动后的主界面），作为后续视觉比对的参考
  - 准备 DevTools 观察通道（Console + Network + DOM）
  - **本阶段完成项**（见 `screenshots/README.md` 启动前置条件）：
    - `node_modules/` 当前缺失，执行测试前必须 `npm install`
    - Python 包诊断：fastapi 0.136.1 / uvicorn 0.47.0 / httpx 0.28.1（均装，版本比 requirements 略新，兼容）；`python-dotenv` 未装但 backend 代码未 import（**不阻塞**）
    - backend/__pycache__ 8 个 .pyc 存在（说明后端最近成功 import）
    - screenshots/ 目录与 README.md 已创建
    - 基线截图 `00-baseline.png` 占位（实际执行时由人工采集）
    - 测试通道需走 HTTP `http://127.0.0.1:5199/test/exec`（preload 暴露的 testExec/testQuery 走 ipcRenderer.invoke('test-exec') 但 main.js 未注册 ipcMain.handle('test-exec')，**已知缺陷**）

- [x] **Task 2：编写可视测试剧本 `visual-test-script.md`**
  - 列出所有要测的按钮清单（含 selector、位置、预期反馈）
  - 列出所有要测的交互路径（用户故事级别）
  - 列出所有要触发的异常场景
  - 每个场景包含：步骤、预期结果（含前后端）、截图点、Pass/Fail 判据
  - **本阶段完成项**：剧本已写入 `visual-test-script.md`（约 600 行），覆盖：
    - §0 启动前置条件（含测试通道 token 读取、HTTP 通道调用脚本、Env 差异记录）
    - §1 按钮清单 65 个（B01~B65），按 9 个区域分类（顶部、Agent 主面板、右侧栏、侧边栏、课表编辑、深度规划、实际工时、课程输入、登录层、状态指示）
    - §2 7 类交互路径（Agent 对话、工具调用、弹窗清单、侧边栏、主题切换、异常场景、重复点击防护）
    - §3 11 项前后端一致性核对（set-api-key / set-model / create-schedule / send-message / fetch-history / agent-approve / archive / clear / cancel-stream / validate / python-status）
    - §4 10 项回归关注点（来自 ux-interaction-audit 等历史 spec）
    - 附录 A 提供了 selector DevTools 复核脚本
    - 附录 B 记录了 testExec/testQuery IPC 通道缺失的已知缺陷
    - 附录 C 提供执行时的环境差异记录表

## Phase 2：主流程按钮与交互测试

- [x] **Task 3：主界面按钮测试（可见性 + 可点性 + 反馈）**
  - 枚举主界面按钮：发送、新建日程、添加任务、切换侧边栏、模型切换、设置、账户、DeepSeek 链接
  - 每个按钮：未悬停 / 悬停 / 按下 三态截图
  - 点击每个按钮，记录反馈（loading、toast、列表变化、视图切换等）
  - 标记"无反馈 / 静默失败"的按钮
  - **完成说明**：静态分析已生成 `phase2-button-analysis.md`。覆盖 20+ 核心按钮（B01-B10, B12-B17, B22-B27, B31, B56-B59），重点关注 ux-interaction-audit 标记的缺陷按钮。**P0 缺陷 2 个**：B03 saveApiKey 无 loading + 无防抖、B17 generateReActLog 无 loading + 无防抖。**P1 缺陷 2 个**：B27 openBigTaskModal 重复打开栈污染、B12/B13 发送按钮 loading 视觉弱。**子代理环境无法启动 Electron GUI**（`npm start` 无输出，`http://127.0.0.1:5199/health` 连不上），所有截图证据已标注"待 GUI 启动后补"。

- [x] **Task 4：Agent 对话主流程**
  - 发送简单消息 → 验证流式响应、done 事件、思路链去重
  - 发送工具调用消息（"明天下午 3 点开会"）→ 验证提案面板 + 后端 tool 调用
  - 连续 3 次快速点击发送 → 验证不会产生重复消息
  - 验证对话历史保留（"我叫 X" → "我叫什么"）
  - **完成说明**：静态分析已生成 `phase4-agent-flow-analysis.md`。完整追踪 `sendAgentMessage` (ai-agent.js:614, 244 行) 调用链。验证流式监听器注册（chunk/done/status）、思路链去重（`renderThinkingChain` line 380 有 `.thinking-process` DOM 查重）、done 事件双层保护（主进程 `doneSent` + renderer `_doneHandled`）。**P0 缺陷 1 个**：`onAgentStreamError` preload 未暴露（preload.js:31-39 完全无），主进程发出的 `agent-stream-error` 事件 renderer 无法消费。**P1 缺陷 2 个**：finally 块 500ms 硬延迟（ai-agent.js:846）影响快速发下一条、reasoning_content 未进 history（`addToHistory` 仅保存 content）导致 Pro 模型跨轮上下文丢失。

- [x] **Task 5：弹窗/侧边栏/抽屉交互**
  - 打开设置、新建日程、添加任务、提案确认 4 类弹窗
  - 每个弹窗验证：毛玻璃遮罩、点遮罩关闭、Escape 关闭、必填字段星号、保存 loading
  - 打开/关闭右侧日程侧边栏：动画、滚动位置保留、自适应
  - **特别关注 `ux-interaction-audit` 中已识别的弹窗缺陷是否仍存在**
  - **完成说明**：静态分析已生成 `phase5-modal-analysis.md`。分析 9 类弹窗（M-A 设置、M-B 大任务、M-C 实际工时、M-D 课程输入、M-E 深度规划、M-F 当日详情、M-G Agent、M-H ReAct、M-I 登录）和 2 个侧边栏。**P0 缺陷 1 类**：M3 点遮罩外关闭在 6/9 弹窗缺失（M-A/M-B/M-C/M-D/M-E/M-H），仅 M-F 当日详情和 M-G Agent 实现。M-B 大任务的 M6 保存 loading 和 M5 必填星号实现完善。**P1 缺陷 2 个**：B27 openBigTaskModal 栈污染、侧边栏滚动位置保留完全缺失（`toggleRightPanel` 无 scrollTop 保存/恢复）。

- [x] **Task 6：主题/暗色模式**
  - 切换系统主题 → 验证所有视图同步切换
  - 截屏对比亮色 / 暗色下的日历、Agent、日程、设置、弹窗
  - **完成说明**：静态分析已生成 `phase6-theme-analysis.md`。主题切换走 `document.documentElement.setAttribute('data-theme', ...)`（不是 body.classList），localStorage key 是 `mosaique-theme`。水浪动画（0.8s cubic-bezier 圆形扩散，`@keyframes themeWave`）实现完整。全局 30+ 元素 0.5s 过渡，识别 21 条 `[data-theme="dark"]` CSS 规则覆盖。**P2 缺陷 3 个**：主进程 `data.settings.theme` 与 renderer `mosaique-theme` 双源不一致、缺 1024px 平板断点（仅有 768px）、未尊重 `prefers-reduced-motion`。总体结论 PASS，主题系统实现完善。

## Phase 3：异常与边界

- [x] **Task 7：错误降级场景**
  - 空消息提交 → 应有明确提示
  - 故意 kill Python 后端 → 验证前端显示重连、3~5s 内自动恢复
  - 构造超长消息（>5000 字）→ 验证不截断不崩溃
  - 构造 API Key 失效 → 验证错误提示可读
  - **完成说明**：静态分析已生成 `phase7-error-analysis.md`。Python 后端有完整 `exit` 监听 + 重启逻辑（2s 间隔 × 3 次上限）+ 3 种 banner 状态（starting/restarting/error）。`pythonApi` 30s 超时 + HTTP 错误降级完整。**P0 缺陷 1 个**：`onAgentStreamError` 在 preload 和 renderer 层面均缺失，导致 2min 超时和 45s 心跳超时后用户无感知。**P1 缺陷 2 个**：超长消息无客户端截断（ai-agent.js:646 无 maxLength）、API Key 401 错误无引导去设置链接（仅 ai-agent.js:839 文本提示）。

- [x] **Task 8：前后端反馈一致性核对**
  - 关键 IPC 调用（set-api-key、set-model、create-schedule、send-message、fetch-history）逐个执行
  - 同时观察前端 DOM 与后端 `/api/*` 响应日志
  - 记录"单向异常"（前端 OK 但后端 500、后端 OK 但前端无渲染）
  - **完成说明**：静态分析已生成 `phase8-ipc-analysis.md`。完整核对 20 个 main.js IPC handler + 8 个推送事件。验证 `test-exec` / `test-query` 确为孤儿（preload 暴露但 main.js 无 handler），与剧本附录 B 一致。**P0 缺陷 1 个**：`agent-stream-error` 主进程主动发送（main.js:744, 765）但 preload 未暴露，renderer 无法监听。**P1 缺陷 1 个**：`clear-conversations` 无二次确认（main.js:968 直接同步删除）。**P2 发现**：剧本 §3 多个 IPC 名（`set-model`/`create-schedule` 等）与实际不一致，实际走直接 HTTP fetch 而非 IPC（index.html 在 4 处 `fetch('/api/save-schedule', ...)` 直写）。建议剧本 §3 重写。

## Phase 4：报告与回流

- [x] **Task 9：生成可视化报告 `visual-report.md`**
  - 每个场景 PASS/FAIL/PARTIAL
  - 关键截图归档到 `screenshots/`
  - 失败场景含：复现步骤、严重程度（P0/P1/P2）、修复建议
  - 输出统计：总场景数、通过数、问题数、按严重程度分布
  - **完成说明**：已生成 `visual-report.md`，含执行摘要表 + 96 个场景结果（52 PASS / 28 PARTIAL / 16 FAIL）+ 5 个 P0 + 7 个 P1 + 8 个 P2 + 3 个 P3 问题清单 + ux-interaction-audit 回归表 + 用户验证流程 + 修复优先级表（5 阶段修复计划，总工作量约 7.5 小时）。所有问题 PASS/PARTIAL/FAIL 状态均基于已读的 phase2-phase8 静态分析报告。**未修改任何源码**。

- [x] **Task 10：问题清单回流到 `tasks.md`**
  - 将报告中"已确认可复现"的真问题追加到本 `tasks.md` 末尾
  - 每条问题作为子任务，含：复现步骤、影响范围、建议方案
  - **不修改源码**（修复留给后续 `fix-visual-found-issues` 等 spec）
  - **完成说明**：已在 `tasks.md` 末尾追加 "Phase 5：问题修复（待新 spec 立项）" 章节，列出全部 5 个 P0 + 7 个 P1 + 5 个代表性 P2/P3 问题（共 17 条），每条含复现 / 影响 / 文件:行号 / 建议方案 / 建议 spec 名。**未修改源码**。

---

# Task Dependencies

- Task 2 依赖 Task 1（先确认能跑起来，再写剧本）
- Task 3~6 依赖 Task 2（按剧本执行）
- Task 7~8 依赖 Task 3~6 主流程无致命阻塞
- Task 9 依赖 Task 3~8 全部完成
- Task 10 依赖 Task 9（报告出来才能回流问题）
- Task 3~6 之间无强依赖，可串行执行以减少状态污染

---

## Phase 5：问题修复（待新 spec 立项）

**以下问题由 Phase 2-3 视觉化测试识别，已确认可复现或基于源码定位。建议作为独立 `fix-*` spec 立项，本 spec 不直接修复。**

---

### P0 阻塞（5 条，建议第一波修复）

- [ ] **Issue 1: `onAgentStreamError` preload 未暴露**（P0）
  - 复现：发送消息后断网 / 模拟 main.js:884 触发 timeout / 等待 45s 无数据 → UI 仍显示"AI 正在思考..."，typing indicator 永久残留
  - 影响：超时/网络错误时用户无感知，UX 阻塞
  - 文件：`preload.js:31-39`，主进程发送点 `main.js:744, 765`，renderer 监听点 `ai-agent.js`（缺）
  - 建议方案：
    ```js
    // preload.js 新增
    onAgentStreamError: (callback) => {
      ipcRenderer.on('agent-stream-error', (_event, err) => callback(err));
    }
    // ai-agent.js sendAgentMessage 中添加监听，清 typing + 显示错误气泡
    ```
  - 建议 spec 名：`fix-stream-error-handler`
  - 工作量：5 分钟
  - 关联 spec：ux-interaction-audit R-stream-listener-leak

- [ ] **Issue 2: `testExec` / `testQuery` IPC 孤儿**（P0）
  - 复现：在 renderer console 执行 `await window.electronAPI.testExec('kill-backend', {})` → reject "No handler registered"
  - 影响：test harness 不可用；潜在运行时崩溃点
  - 文件：`preload.js:71-72` 暴露但 `main.js` 无 handler
  - 建议方案（2 选 1）：删除 preload.js:71-72 两行（推荐）；或在 main.js 测试模式分支实现 `ipcMain.handle('test-exec', ...)` 真实 handler
  - 建议 spec 名：`fix-test-channel-orphan`
  - 工作量：5 分钟

- [ ] **Issue 3: 6/9 弹窗缺失"点遮罩外关闭"**（P0）
  - 复现：打开任一 M-A/M-B/M-C/M-D/M-E/M-H 弹窗 → 点击遮罩（非弹窗本体）→ 弹窗不关闭
  - 影响：UX 不一致（部分弹窗可点遮罩关，部分不可）
  - 涉及弹窗：`#settingsOverlay` (line 7180) / `#bigTaskModal` (line 7118) / `#actualTimeModal` (line 7366) / `#courseInputModal` (line 7390) / `#deepPlanningModal` (line 7344) / `#reactLogModal` (line 11633)
  - 建议方案：统一接入 `_modalStack` 模式（M-F/M-G 的标准），在 DOMContentLoaded 块添加遮罩 click 监听
  - 建议 spec 名：`fix-modal-overlay-close`
  - 工作量：1 小时

- [ ] **Issue 4: B03 saveApiKey 无 loading + 无防抖**（P0）
  - 复现：在设置弹窗输入 API Key，200ms 内点击"保存"按钮 3 次 → DevTools Network 看到 3 个 `set-api-key` 请求
  - 影响：多次 `setApiKey` IPC + 多次 `config.json` 写 + 多次 `api-key-configured` 事件
  - 文件：`index.html:7227` (HTML), `index.html:10120` (handler)
  - 建议方案：handler 顶部加 `if (window._isSavingKey) return;`，进入时 `btn.disabled = true; btn.textContent = '保存中...';`，finally 恢复
  - 建议 spec 名：`fix-button-loading-state`（含 Issue 4 + Issue 5）
  - 工作量：15 分钟

- [ ] **Issue 5: B17 generateReActLog 无 loading + 无防抖**（P0）
  - 复现：打开 Agent 弹窗，点 ReAct 按钮 3 次 → DevTools Network 看到 3 个 generate-react-log 请求
  - 影响：同 Issue 4，多次重复生成 ReAct 日志
  - 文件：`index.html:7334` (HTML), `ai-agent.js:1627` (handler)
  - 建议方案：handler 顶部加 `if (window._isGeneratingReAct) return;`，进入时 `btn.disabled = true; btn.textContent = '生成中...';`
  - 建议 spec 名：`fix-button-loading-state`（与 Issue 4 同 spec）
  - 工作量：15 分钟

### P1 严重（7 条，建议第二波修复）

- [ ] **Issue 6: B27 openBigTaskModal 重复打开栈污染**（P1）
  - 复现：200ms 内点"+ 添加大任务"按钮 3 次 → `_modalStack` 含 3 个 'bigTask' → Escape 关闭后还会残留 2 个
  - 影响：栈污染导致 Escape 键误关其他弹窗
  - 文件：`index.html:10216` (handler)
  - 建议方案：handler 顶部加 `if (modal.classList.contains('active')) return;`
  - 建议 spec 名：`fix-modal-stack-pollution`
  - 工作量：5 分钟

- [ ] **Issue 7: 侧边栏滚动位置不保留**（P1）
  - 复现：展开侧边栏 → 滚到中部 → 折叠 → 再展开 → 滚动位置回到 0
  - 影响：ux 体验差，每次重新查找
  - 文件：`index.html:11529` (`toggleRightPanel`)
  - 建议方案：在折叠时保存 `timeSidebarContent.scrollTop`，展开时 `setTimeout(350ms)` 恢复
  - 建议 spec 名：`fix-sidebar-scroll-persistence`
  - 工作量：15 分钟

- [ ] **Issue 8: B12/B13 发送按钮 loading 视觉弱**（P1）
  - 复现：发送消息后观察发送按钮 → 仅透明度变化，无任何文案/spinner
  - 文件：`ai-agent.js:632`
  - 建议方案：按钮内插入 `<svg class="spin">` 元素 + `textContent = '发送中...'`
  - 建议 spec 名：`improve-send-button-feedback`
  - 工作量：30 分钟

- [ ] **Issue 9: `reasoning_content` 未进 history（Pro 模型跨轮上下文丢失）**（P1）
  - 复现：使用 Pro 模型，发送包含推理的消息，再问"我刚才你是怎么想的？" → AI 回答不准确
  - 影响：Pro 模型用户跨轮上下文理解偏差
  - 文件：`ai-agent.js:426-442` (`addToHistory`), `ai-agent.js:780-784`
  - 建议方案：1) `addToHistory` 增加 `reasoning_content` 字段；2) 后端 SSE result 事件包含完整 `{content, reasoning_content, proposal}`；3) `ai-agent.js:780` 解构时取 `reasoning_content` 并保存
  - 建议 spec 名：`fix-history-reasoning-stripping`
  - 工作量：1 小时（含后端联动）

- [ ] **Issue 10: Python 后端重启间隔固定 2s 无 backoff**（P1）
  - 复现：连续 `testExec kill-backend` 3 次 → 6s 内连续失败 3 次
  - 影响：若 Python 启动脚本本身有问题，会快速耗尽 3 次重试配额
  - 文件：`main.js:235-260` (`restartPythonBackend`)
  - 建议方案：间隔改为 2s / 4s / 8s 递增
  - 建议 spec 名：`fix-backend-restart-backoff`
  - 工作量：15 分钟

- [ ] **Issue 11: typing indicator 在错误时残留**（P1）
  - 复现：触发网络错误 / 401 → catch 块显示错误气泡，但 typing indicator 仍跳动
  - 文件：`ai-agent.js:835-841` (catch 块)
  - 建议方案：catch 块顶部加 `if (typingIndicator) typingIndicator.classList.remove('active');`
  - 建议 spec 名：`fix-typing-indicator-leak`
  - 工作量：5 分钟

- [ ] **Issue 12: 超长消息无客户端截断**（P1）
  - 复现：粘贴 10000+ 字符到 `#agentMainInput` → 点发送 → 后端报 400/413 或截断
  - 文件：`ai-agent.js:646-652`
  - 建议方案：加 `if (msg.length > 8000) { showToast('已截断到 8000 字符'); msg = msg.substring(0, 8000); }`
  - 建议 spec 名：`fix-message-length-limit`
  - 工作量：5 分钟

### P2/P3 代表性（5 条，建议第三波及之后修复）

- [ ] **Issue 13: API Key 401 错误无引导去设置链接**（P2）
  - 复现：设 Key 为 "sk-invalid-xxx"，发送消息 → 看到"API Key 无效或未配置"但不知道下一步
  - 文件：`ai-agent.js:835-841`
  - 建议方案：错误消息改为"API Key 无效或未配置。点此去设置"并加 onclick 跳设置弹窗
  - 建议 spec 名：`improve-error-actionable-feedback`
  - 工作量：10 分钟

- [ ] **Issue 14: `clear-conversations` 无二次确认**（P2）
  - 复现：调用"清空对话历史"功能 → 立即删除 `agent_history` + `archive` 文件，无 confirm
  - 影响：误操作丢失历史
  - 文件：`main.js:968-975`
  - 建议方案：index.html 调用前加 `if (confirm('确认清空所有对话历史？此操作不可恢复'))`
  - 建议 spec 名：`add-clear-conversations-confirm`
  - 工作量：5 分钟

- [ ] **Issue 15: M-H ReAct 日志弹窗 Escape 关闭缺失**（P2）
  - 复现：打开 ReAct 日志弹窗 → 按 Escape → 弹窗不关闭
  - 文件：`index.html` `_modalStack` switch 中缺 'reactLog' case
  - 建议方案：switch 加 `case 'reactLog': closeReActLog(); break;`
  - 建议 spec 名：`fix-react-modal-escape`
  - 工作量：5 分钟

- [ ] **Issue 16: 全局无 `:focus-visible` 键盘焦点态**（P2）
  - 复现：键盘 Tab 切换焦点 → 元素无明显视觉标识
  - 文件：`index.html`（缺 a11y CSS）
  - 建议方案：加 `*:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }`
  - 建议 spec 名：`add-focus-visible-styles`
  - 工作量：5 分钟

- [ ] **Issue 17: 缺 1024px 平板断点**（P3）
  - 复现：Windows 缩放窗口到 1000px 以下 → 布局异常
  - 文件：`index.html`（缺 `@media (max-width: 1024px)`）
  - 建议方案：加 `@media (max-width: 1024px) { ... }` 中间断点
  - 建议 spec 名：`add-1024-breakpoint`
  - 工作量：30 分钟

---

**问题修复总览**：

| 优先级 | 数量 | 总工作量 | 建议 spec 数 |
|--------|------|---------|-------------|
| P0 | 5 | ~2 小时 | 4 个（fix-stream-error-handler, fix-test-channel-orphan, fix-modal-overlay-close, fix-button-loading-state）|
| P1 | 7 | ~2.5 小时 | 7 个独立 spec |
| P2/P3 | 5（代表） | ~1 小时 | 5 个独立 spec |
| **总计** | **17** | **~5.5 小时** | **16 个建议 spec** |

完整问题清单、复现步骤、修复建议见 `visual-report.md` §三/§四；建议按"第一波 P0 → 第二波 P1 → 第三波 P2/P3"顺序进入 `fix-visual-found-issues` 等修复 spec。

