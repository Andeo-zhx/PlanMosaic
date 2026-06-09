# Visual Test Script — PlanMosaic Desktop

> 本剧本描述在 Electron 内置 Browser 中以**真实用户视角**逐场景驱动的可视化测试流程。每个场景包含：前置条件、操作步骤、预期反馈（前端 DOM + 后端 API + 日志）、截图点、Pass/Fail 判据。
>
> **执行原则**：先 Phase 1 基线，再 Phase 2 主流程按钮与交互，最后 Phase 3 异常与边界。任何步骤出现静默失败、永久 loading、前后端不一致，**立即标 FAIL 并停止**该场景，跳到下一场景。
>
> **重要**：本剧本中所有 selector 均为**通过静态读源码推断**的"待确认"项；执行时若发现选择器不匹配，以 DevTools Elements 面板中的实际选择器为准并记录到报告。

---

## 0. 启动前置条件

### 0.1 必做清单
- [ ] **环境变量**：`$env:PLANMOSAIC_TEST_MODE = "1"`（任务描述要求；实际 `main.js` 用 `app.isPackaged === false` 控制测试通道，未打包运行即视为测试模式）
- [ ] **Node 依赖**：`cd "PlanMosaic Desktop" && npm install`（首次必做；`node_modules/` 当前缺失）
- [ ] **Python 依赖**：`fastapi`/`uvicorn`/`httpx` 已装（环境已验证）；`python-dotenv` 缺失但当前后端代码未 import（**不阻塞**，若运行时报 `ModuleNotFoundError: dotenv` 再 `pip install python-dotenv`）
- [ ] **config.json** 两种状态准备：
  - 状态 A：API Key 不可用——`api.deepseek.key = "YOUR_DEEPSEEK_API_KEY_HERE"`
  - 状态 B：API Key 可用——填入真实 DeepSeek Key
- [ ] **测试通道 Token**：应用启动后从主进程 stdout 读 `PLANMOSAIC_CONTROL_TOKEN`，记到环境变量：`$env:PLANMOSAIC_CONTROL_TOKEN = "<读到的值>"`
- [ ] **应用启动命令**：`cd "PlanMosaic Desktop" && npm start`（等价 `npx electron .`）
- [ ] **DevTools 通道**：默认开启 DevTools（如未自动开，按 `Ctrl+Shift+I` 强制打开）

### 0.2 启动成功判据
- 主窗口出现（800×600 或 1200×800 视配置）
- DevTools Console 至少出现以下之一：
  - `[Preload] Electron API exposed`
  - `[CLI Control] Server listening on http://127.0.0.1:5199`
  - `[Mosa] init`（或同类）
- 主进程 stdout 出现：`[Startup] Python backend started`
- `curl http://127.0.0.1:5180/api/config` 返回 200（端口从启动日志读，默认 5180）
- 控制端口 `http://127.0.0.1:5199/test/health` 返回 `{"ready": true, "backend": "...", "pythonRunning": true}`

### 0.3 工具准备
- 截图工具：`pyautogui`（项目已附 `screenshot.py`）或系统自带截图
- DevTools Elements / Console / Network 三栏始终开启
- 测试通道调用（备选脚本化）：
  ```bash
  # 设置 token
  $TOKEN = $env:PLANMOSAIC_CONTROL_TOKEN
  # 注入 Key
  Invoke-RestMethod -Uri "http://127.0.0.1:5199/test/exec" `
      -Method Post -Headers @{ Authorization = "Bearer $TOKEN" } `
      -ContentType "application/json" `
      -Body '{"command":"set-api-key","params":{"key":"YOUR_DEEPSEEK_API_KEY_HERE"}}'
  # 注入 DOM 脚本
  Invoke-RestMethod -Uri "http://127.0.0.1:5199/test/exec" `
      -Method Post -Headers @{ Authorization = "Bearer $TOKEN" } `
      -ContentType "application/json" `
      -Body '{"command":"inject-dom","params":{"script":"document.title"}}'
  # 查询 DOM
  Invoke-RestMethod -Uri "http://127.0.0.1:5199/test/query?target=dom&selector=#agentMainSendBtn" `
      -Headers @{ Authorization = "Bearer $TOKEN" }
  # 杀后端
  Invoke-RestMethod -Uri "http://127.0.0.1:5199/test/exec" `
      -Method Post -Headers @{ Authorization = "Bearer $TOKEN" } `
      -ContentType "application/json" `
      -Body '{"command":"kill-backend","params":{}}'
  ```

### 0.4 基线截图
- [ ] 启动后主界面稳定（无 loading 动画）→ 截 `screenshots/00-baseline.png`
- [ ] 截取后核对：
  - 左侧：Agent 主面板 `#agentMainArea`，含 Mosa 头像、对话区 `#agentMainChatContainer`、输入框 `#agentMainInput`、发送按钮 `#agentMainSendBtn`、图片按钮 `#agentMainImageBtn`
  - 右侧：右侧栏按钮 4 个 `data-panel="task|schedule|plan|aux"`，下方侧边栏 `#sidebarCollapsible`（含日历 `#calendarGrid`、时间侧栏 `#timeSidebar`）
  - 顶部：设置按钮（齿轮 SVG，无 id），标题"PlanMosaic"
  - 底部：右上角 Python 状态 banner `#pythonStatusBanner`（应隐藏或显示绿色 "已连接"）

---

## 1. 按钮清单（待核对）

> **约定**："需确认" = 通过静态读源码推断，DevTools 复核后填实际值。state 缩写：I=Idle, H=Hover, P=Pressed, D=Disabled, L=Loading。

### 1.1 顶部 + 全局

| # | 按钮 | selector (需确认) | 位置 | 预期反馈 | 截图 state |
|---|------|------------------|------|---------|-----------|
| B01 | 设置入口 | `.icon-btn.rotating` (onclick=`openSettingsModal`) | 顶部 header-left | 打开 `#settingsOverlay` 弹窗 | I, H |
| B02 | 关闭设置弹窗 | `.close-btn` (in `#settingsOverlay`) | 设置弹窗右上 | 关闭弹窗 | I, H |
| B03 | API Key 保存 | `.api-key-btn.save` (onclick=`saveApiKey('deepseek')`) | 设置弹窗 | 写 config.json，#deepseek-status 改文案 | I, H, L |
| B04 | API Key 验证 | `.api-key-btn.test` (onclick=`testApiKey('deepseek')`) | 设置弹窗 | 调 `validateApiKey('deepseek')`，#deepseek-message 显示结果 | I, H, L |
| B05 | API Key 获取链接 | `.api-key-btn.link` (onclick=`openApiKeyUrl('deepseek')`) | 设置弹窗 | 浏览器打开 deepseek 控制台 URL | I, H |
| B06 | API Key 显示/隐藏 | `.api-key-toggle` (onclick=`toggleKeyVisibility('deepseek')`) | 设置弹窗 | `#deepseek-key-input` type 切换 password↔text | I, H |
| B07 | 主题切换-深色 | `input[name="theme"][value="dark"]` (onchange=`changeTheme('dark')`) | 设置弹窗 | html data-theme="dark"，所有视图重渲 | I, H, 切换后 |
| B08 | 主题切换-浅色 | `input[name="theme"][value="light"]` | 设置弹窗 | html data-theme="light" | I, H, 切换后 |
| B09 | 退出登录 | `.auth-btn-secondary` (onclick=`handleLogout()`) | 设置弹窗-账户区 | 跳到登录层 | I, H |
| B10 | 手动上传云端 | `#manualUploadBtn` (onclick=`manualUpload()`) | 设置弹窗-数据同步 | #uploadStatus 出现"上传中"→"完成"/"失败" | I, H, L |
| B11 | 主题 radio 视觉块 | `.theme-option` (label 包裹) | 设置弹窗 | 点击 label 触发 radio 切换 | I, H |

### 1.2 Agent 主面板（#agentMainArea）

| # | 按钮 | selector | 位置 | 预期反馈 | 截图 state |
|---|------|---------|------|---------|-----------|
| B12 | 发送 | `#agentMainSendBtn` (onclick=`sendAgentMessage()`) | 输入框右侧 | 用户气泡立即出现 + typing + 流式 AI 响应 | I, H, P, L(disabled) |
| B13 | 发送（小弹窗） | `#agentSendBtn` (onclick=`sendAgentMessage()`) | 迷你弹窗 #agentModal 输入区 | 同上（仅小弹窗时可见） | I, H, P, L |
| B14 | 图片上传 | `#agentMainImageBtn` (label) | 输入框左侧 | 文件选择 → #agentMainImagePreview 显示预览 | I, H |
| B15 | 图片上传（小弹窗） | `#agentImageBtn` | #agentModal | 同上 | I, H |
| B16 | 输入框 | `#agentMainInput` (textarea) | 主面板底部 | Enter 发送、Shift+Enter 换行、字符计数 | 打字中 |
| B17 | ReAct 日志生成 | `.agent-react-btn` (onclick=`generateReActLog()`) | #agentModal 工具栏 | 打开 #reactLogModal 显示日志 | I, H, open |
| B18 | 关闭 ReAct 日志 | `.react-log-close-btn` | #reactLogModal | 关闭弹窗 | I, H |
| B19 | 复制 ReAct 日志 | `.react-log-copy-btn` (onclick=`copyReActLog()`) | #reactLogModal | 剪贴板复制，toast 反馈 | I, H |
| B20 | 导出 ReAct TXT | `.react-log-copy-btn` 含 `downloadReActLog('txt')` | #reactLogModal | 弹原生保存对话框 | I, H |
| B21 | 导出 ReAct MD | `.react-log-copy-btn` 含 `downloadReActLog('md')` | #reactLogModal | 弹原生保存对话框 | I, H |
| B22 | 关闭 Agent 弹窗 | (待确认，无 close btn) | #agentModal 顶部 | 点击外部 / Escape 关闭 | (观察) |

### 1.3 右侧栏按钮（#rightPanelBar）

| # | 按钮 | selector | 位置 | 预期反馈 | 截图 state |
|---|------|---------|------|---------|-----------|
| B23 | 任务栏面板 | `.right-panel-btn[data-panel="task"]` (onclick=`toggleRightPanel('task')`) | 右侧栏 | 展开/折叠 #taskPanelRight，active 类切换 | I, H, P, active |
| B24 | 日程面板 | `.right-panel-btn[data-panel="schedule"]` | 右侧栏 | 展开/折叠 #planPanelRight (与 calendar 联动) | I, H, P, active |
| B25 | 规划面板 | `.right-panel-btn[data-panel="plan"]` | 右侧栏 | 展开/折叠 | I, H, P, active |
| B26 | 附功能面板 | `.right-panel-btn[data-panel="aux"]` (data-panel="aux") | 右侧栏 | 展开/折叠 #auxPanelRight | I, H, P, active |
| B27 | 添加大任务 | `.right-panel-add-btn` (onclick=`openBigTaskModal()`) | #taskPanelRight 内部 | 打开 #bigTaskModal | I, H |
| B28 | 关闭大任务弹窗 | (无 id，class `.close-btn`) | #bigTaskModal | 关闭弹窗 | I, H |
| B29 | 大任务-短期 | `input[name="bigTaskType"][value="short"]` | #bigTaskModal | 切换 #bigTaskStartDateGroup 隐藏 | I, checked |
| B30 | 大任务-长期 | `input[name="bigTaskType"][value="long"]` | #bigTaskModal | 显示 #bigTaskStartDateGroup | I, checked |
| B31 | 大任务-保存 | `.big-task-modal-actions .btn-primary` (onclick=`saveBigTask()`) | #bigTaskModal | 写入任务，列表更新 | I, H, L |
| B32 | 大任务-取消 | `.big-task-modal-actions .btn-secondary` (onclick=`closeBigTaskModal()`) | #bigTaskModal | 关闭弹窗 | I, H |
| B33 | 任务-完成 | `.task-complete-btn` (动态，onclick=`handleTaskCompleteClick(this)`) | 任务列表 | 划掉/状态切换 | I, H |
| B34 | 任务-编辑 | `.big-task-action-btn[title="编辑"]` (onclick=`openBigTaskModal(idx)`) | 大任务列表 | 打开 #bigTaskModal 并填值 | I, H |
| B35 | 任务-删除 | `.big-task-action-btn[title="删除"]` (onclick=`deleteBigTask(idx)`) | 大任务列表 | 确认后删除 | I, H |

### 1.4 日程侧边栏（#sidebarCollapsible）

| # | 按钮 | selector | 位置 | 预期反馈 | 截图 state |
|---|------|---------|------|---------|-----------|
| B36 | 切换侧边栏 | `#sidebarToggleBtn` (onclick=`toggleRightPanel('schedule')`) | 侧边栏左上 | 展开/折叠 | I, H, P |
| B37 | 上一周 | `.nav-btn` 第一个（`onclick="previousMonth"`，名字误导实为周切换） | 日历头部 | 日历后退一周 | I, H |
| B38 | 下一周 | `.nav-btn` 第二个（`onclick="nextMonth"`） | 日历头部 | 日历前进一周 | I, H |
| B39 | 视图切换 | `.view-toggle-btn` (onclick=`toggleViewMode()`) | 日历头部 | 切换"周"↔"月" 视图 | I, H, P |
| B40 | 单元格点击 | `.calendar-day` / `.calendar-cell` (动态) | 日历格子 | 打开 #modalOverlay 当日详情 | I, H |
| B41 | 编辑当日 | `#editBtn` (onclick=`openEditMode()`) | #modalOverlay 底部 | 进入编辑模式（行内编辑） | I, H |
| B42 | 关闭当日弹窗 | `.close-btn` (in #modalOverlay) | 当日弹窗 | 关闭 | I, H |
| B43 | 添加时间段 | `.add-slot-btn` (onclick=`addTimeSlot()`) | 编辑模式 | 追加时间段行 | I, H |
| B44 | 添加任务 | `.add-task-btn` (onclick=`addTask()`) | 编辑模式 | 追加任务行 | I, H |

### 1.5 课表编辑 / 模板（scheduleEditorModal 内部）

| # | 按钮 | selector | 位置 | 预期反馈 | 截图 state |
|---|------|---------|------|---------|-----------|
| B45 | 打开课表编辑器 | (onclick=`openScheduleEditor()`) | 课表入口 | 打开 #scheduleEditorModal | I, H |
| B46 | 合并选中 | `#mergeBtn` (disabled→enabled) | 编辑工具栏 | 合并单元格 | I, D→enabled, H |
| B47 | 取消合并 | `#unmergeBtn` | 编辑工具栏 | 拆单元格 | I, D, H |
| B48 | 清空选中 | `#clearBtn` | 编辑工具栏 | 清空选中格内容 | I, D, H |
| B49 | 复制单→双 | `.schedule-toolbar-btn` 含 `copyOddToEven()` | 编辑工具栏 | 复制单数周 | I, H |
| B50 | 返回列表 | `.schedule-toolbar-btn` 含 `renderScheduleEditorList()` | 编辑器顶 | 回到模板列表 | I, H |
| B51 | 启用课表 | `.schedule-toolbar-btn` 含 `activateSchedule()` | 编辑器顶 | 切换为当前课表 | I, H |
| B52 | 模板编辑 | `.schedule-list-btn` 含 `editTemplate(idx)` | 模板列表 | 进入模板编辑 | I, H |
| B53 | 模板复制 | `.schedule-list-btn` 含 `copyTemplate(idx)` | 模板列表 | 复制一份 | I, H |

### 1.6 Deep Planning（#deepPlanningModal）

| # | 按钮 | selector | 位置 | 预期反馈 | 截图 state |
|---|------|---------|------|---------|-----------|
| B54 | 关闭深度规划 | `.dp-close-btn` (onclick=`window.closeDeepPlanningModal()`) | #deepPlanningModal 顶 | 关闭 | I, H |
| B55 | 发送深度规划 | `.dp-send-btn` (onclick=`window.sendDeepPlanningMessage()`) | 弹窗内 | 追加消息 | I, H, L |

### 1.7 实际工时弹窗（#actualTimeModal）

| # | 按钮 | selector | 位置 | 预期反馈 | 截图 state |
|---|------|---------|------|---------|-----------|
| B56 | 实际工时-确认 | (在 #actualTimeModal 内，onclick 推断 `saveActualTime`) | 弹窗 | 写回 | I, H, L |
| B57 | 实际工时-取消 | (onclick 推断 `closeActualTimeModal`) | 弹窗 | 关闭 | I, H |

### 1.8 课程输入弹窗（#courseInputModal）

| # | 按钮 | selector | 位置 | 预期反馈 | 截图 state |
|---|------|---------|------|---------|-----------|
| B58 | 课程名-确认 | (onclick 推断) | 弹窗 | 写入课表 | I, H, L |
| B59 | 课程名-取消 | (onclick 推断) | 弹窗 | 关闭 | I, H |

### 1.9 登录层（#authOverlay）

| # | 按钮 | selector | 位置 | 预期反馈 | 截图 state |
|---|------|---------|------|---------|-----------|
| B60 | 登录-提交 | `#authLoginBtn` (onclick=`handleLogin()`) | 登录表单 | 调登录，#authLoginError 显示结果 | I, H, L |
| B61 | 注册-提交 | `#authRegBtn` (onclick=`handleRegister()`) | 注册表单 | 注册并登录 | I, H, L |
| B62 | 切换到注册 | `.auth-switch-btn` 含 `showRegisterForm()` | 登录表单底部 | 切换表单 | I, H |
| B63 | 切换到登录 | `.auth-switch-btn` 含 `showLoginForm()` | 注册表单底部 | 切换表单 | I, H |

### 1.10 状态指示
| # | 元素 | selector | 位置 | 状态含义 |
|---|------|---------|------|---------|
| B64 | Python 状态 banner | `#pythonStatusBanner` | 顶部 | display 切换：none（健康）/ 红色（断开）/ 黄色（重连中） |
| B65 | API Key 状态文本 | `#deepseek-status` | 设置弹窗 | "未配置" / "已配置" / "无效" |

---

## 2. 交互路径

### 2.1 Agent 对话主流程

**前置**：基线截图完成；状态 A（API Key 占位符）以验证降级，或状态 B（真 Key）以验证正常路径。

| 步骤 | 操作 | 预期前端 | 预期后端 | 截图点 |
|------|------|---------|---------|--------|
| 2.1.1 | 在 `#agentMainInput` 输入 "今天天气怎么样" | 字符出现在输入框，无自动发送 | - | phase3-chat-1-input-typed |
| 2.1.2 | 按 Enter | 输入框清空 | - | (无截图，过程太快) |
| 2.1.3 | 观察 `#agentMainChatContainer` | 出现 `.agent-message.user` 气泡（用户消息） | `POST /api/agent-chat-stream` (或 `/api/agent-chat`) 命中 | phase3-chat-2-user-bubble |
| 2.1.4 | 观察 typing | `#mainTypingIndicator` 出现 `active` class，3 个 span 跳动 | - | phase3-chat-3-ai-thinking |
| 2.1.5 | 观察流式 | `.agent-message.assistant` 气泡出现，`.message-content` 逐字追加；可能先有 `.thinking-process.has-thinking` | 流式 chunk 持续到达 | phase3-chat-4-ai-streaming |
| 2.1.6 | 观察完成 | 流式停止，气泡末尾出现 ✅ 或同类完成态；typing 隐藏 | `agent-stream-done` 事件触发 | phase3-chat-5-ai-done |
| 2.1.7 | 核对思路链 | 若响应含 `reasoning_content`，渲染 `.thinking-process` 仅一次（**不重复**） | 后端 `reasoning_content` 字段 | phase3-chat-6-thinking-chain-expanded |
| 2.1.8 | 上下文保持 | 再发 "我刚才问了什么？" | - | (核心对话流) |

**Pass/Fail 判据**：
- ✅ 用户气泡**立即**出现（不阻塞等待 AI）
- ✅ typing 出现并最终消失
- ✅ 流式 chunk 持续追加，最终 ✅ 标记
- ✅ 思路链不重复（重点查 ux-interaction-audit 中识别的 `💭 思路过程` 重复 bug）
- ❌ 任何 5s+ 永久 loading 标 FAIL
- ❌ 前端已 200，后端无日志标 FAIL（"单向异常"）

### 2.2 工具调用（创建日程）

| 步骤 | 操作 | 预期前端 | 预期后端 | 截图点 |
|------|------|---------|---------|--------|
| 2.2.1 | 在 `#agentMainInput` 输入 "明天下午 3 点开会" | 用户气泡立即 | `POST /api/agent-chat-stream` 触发 | phase3-tool-1-input |
| 2.2.2 | 等待 AI 响应 | 流式追加到 AI 气泡 | - | phase3-tool-1-ai-responding |
| 2.2.3 | 观察提案 | AI 气泡内出现 `.schedule-proposal`，含 `.proposal-type-badge.create`、`.proposal-column.modified` 展示明日 15:00 时间段 | 后端返回 `proposal` 字段 | phase3-tool-1-schedule-proposal |
| 2.2.4 | 点击 `.proposal-btn.approve` (onclick=`approveProposal()`) | 提案容器变 "已应用" 状态；右侧日程侧边栏新增对应条目 | `POST /api/agent-approve` 200 | phase3-tool-2-schedule-confirmed |
| 2.2.5 | 观察后端日志 | - | 出现 `/api/tools/schedule.create` 调用，无 traceback | (DevTools Network 截) |
| 2.2.6 | 核验 | 关闭再开右侧日程面板，新日程仍在；日期正确 | 读 schedule 数据 | (再次截图比对) |

**Pass/Fail 判据**：
- ✅ 提案出现且含正确时间
- ✅ 确认后右侧日程新增
- ✅ 后端日志无 traceback
- ❌ 提案按钮可重复点击产生重复日程（重复点击防护）

### 2.3 弹窗交互

> 每个弹窗执行完整 checklist。

**Checklist 适用弹窗**：
1. 设置弹窗 `#settingsOverlay`（B01~B11）
2. 新建日程弹窗（#modalOverlay 编辑模式 + scheduleEditorModal）
3. 添加大任务弹窗 `#bigTaskModal`（B27~B32）
4. ReAct 日志弹窗 `#reactLogModal`（B17~B21）
5. 实际工时 `#actualTimeModal`（B56~B57）
6. 课程输入 `#courseInputModal`（B58~B59）
7. 当日详情 `#modalOverlay`（B40~B44）
8. 深度规划 `#deepPlanningModal`（B54~B55）
9. 登录/注册 `#authOverlay`（B60~B63）

**Checklist 项**：

| # | 检查项 | 判据 |
|---|--------|------|
| M1 | 打开动效 | 平滑 fade/scale，无闪烁 |
| M2 | 毛玻璃遮罩 | overlay 背景半透明 + backdrop-filter blur |
| M3 | 点遮罩外关闭 | 点击遮罩（非弹窗本体）应关闭 |
| M4 | Escape 关闭 | 按 Esc 关闭 |
| M5 | 必填星号 | 必填字段 label 后有红色 `*`（见 `#bigTaskEstimated` label、任务名称） |
| M6 | 保存 loading | 提交后按钮 disabled 且显示 loading 文案/spinner |
| M7 | 失败错误 | 提交失败显示 #xxx-message 或 #xxx-error 红字 |
| M8 | 关闭后清理 | 关闭后下次打开无残留内容（输入框清空、上次预览消失） |
| M9 | 重复点击 | 200ms 内点保存 3 次 → 只能产生 1 次副作用 |
| M10 | 键盘 tab 顺序 | Tab 键能在字段间合理切换 |

**示例：设置弹窗 (B01~B11)**
- 步骤：点 B01 → 弹窗 fade in → 截 `phase3-modal-1-settings-open`
- 步骤：点遮罩外 → 关闭 → 截 `phase3-modal-2-settings-blur-close`
- 步骤：重新打开 → 按 Esc → 关闭 → 截 `phase3-modal-3-settings-esc-close`
- 步骤：保存 B03 with 空 Key → 报错 → 截 `phase3-modal-7-settings-error`
- 步骤：保存 B03 with 真 Key → loading → "已配置" 状态 → 截 `phase3-modal-5-settings-saving`、`phase3-modal-6-settings-saved`

### 2.4 侧边栏/抽屉

| 步骤 | 操作 | 预期前端 | 预期后端 | 截图点 |
|------|------|---------|---------|--------|
| 2.4.1 | 点 B36 展开 | `#sidebarCollapsible` 展开动画（CSS transition） | - | phase3-sidebar-1-expanded |
| 2.4.2 | 在 #timeSidebarContent 滚到中部 | 滚动到位置 X | - | phase3-sidebar-3-scrolled-mid |
| 2.4.3 | 点 B36 折叠 | 折叠动画 | - | phase3-sidebar-2-collapsed |
| 2.4.4 | 再点 B36 展开 | 滚动位置仍在 X（状态保留） | - | phase3-sidebar-4-reopened-same-position |
| 2.4.5 | 重复 2.4.1~2.4.4 共 3 次 | 每次动画流畅，无闪烁、无残影 | - | (3 组截图) |
| 2.4.6 | 点 B23~B26 切换四个面板 | active 类正确转移 | - | (4 张状态) |

**Pass/Fail 判据**：
- ✅ 动画平滑（无 jank、无错位）
- ✅ 滚动位置保留
- ✅ 切换面板无残留

### 2.5 主题切换

| 步骤 | 操作 | 预期前端 | 截图点 |
|------|------|---------|--------|
| 2.5.1 | 截浅色基线 | - | phase4-theme-1-light-baseline |
| 2.5.2 | 点 B07 切到深色 | `html[data-theme="dark"]`，所有 view 同步重渲 | phase4-theme-2-dark-after |
| 2.5.3 | 打开 B01 设置弹窗 | 弹窗在深色下样式正确 | phase4-theme-4-modal-on-dark |
| 2.5.4 | 关闭设置弹窗 | - | - |
| 2.5.5 | 切到 B08 浅色 | 同步回浅色 | phase4-theme-3-light-after |
| 2.5.6 | 打开 #bigTaskModal | 弹窗在浅色下样式正确 | (B27 截图) |
| 2.5.7 | 切深色，打开 #reactLogModal | 弹窗在深色下样式正确 | (B17 截图) |

**Pass/Fail 判据**：
- ✅ 所有 view 同步切换（无遗漏的 hard-coded 颜色）
- ✅ 文字/图标对比度可读
- ❌ 任何元素在深色下显示白底白字等不可读情况

### 2.6 异常场景

#### 2.6.1 空消息提交
| 步骤 | 预期 | 截图点 |
|------|------|--------|
| 点 B12（输入框为空） | 输入框 shake 动画（`shake-input` class，line 649 出现）；不发送请求 | phase5-error-1-empty-shake |

**判据**：
- ✅ 视觉反馈（shake、红色边框或 toast）
- ❌ 静默提交空消息到后端

#### 2.6.2 超长消息
| 步骤 | 预期 | 截图点 |
|------|------|--------|
| 粘贴 5000+ 字到 `#agentMainInput` | 输入框可滚动/自动 resize；点发送不崩溃 | phase5-error-2-long-msg-typed |
| 等待流式 | AI 气泡完整呈现不截断；UI 不卡 | phase5-error-2-long-msg-response |

**判据**：
- ✅ UI 不卡顿
- ✅ 流式响应完整
- ❌ textarea 高度异常（无自动 resize）
- ❌ 后端报 413

#### 2.6.3 断开后端
| 步骤 | 预期 | 截图点 |
|------|------|--------|
| 调 `testExec kill-backend` | `#pythonStatusBanner` 显示红色"Python 后端断开" | phase5-error-3-backend-killed-banner |
| 等 5s | 后端自动重启，banner 变绿色"已恢复" | phase5-error-4-backend-recovered |
| 期间发消息 | 显示"重连中..."提示，不永久 loading | (录屏或中间态截图) |

**判据**：
- ✅ banner 3~5s 内恢复
- ✅ 消息不永久 loading
- ❌ 永久 loading / 静默

#### 2.6.4 无效 API Key
| 步骤 | 预期 | 截图点 |
|------|------|--------|
| 设 Key 为 "sk-invalid-xxx" | - | - |
| 发送 "你好" | 气泡内显示"API Key 无效"或 toast 提示 | phase5-error-5-invalid-key-toast |

**判据**：
- ✅ 错误可读（不显示原始 stack trace）
- ✅ B64 banner 不变红（这是 API 错，不是后端错）

### 2.7 重复点击防护

| 步骤 | 操作 | 预期 | 截图点 |
|------|------|------|--------|
| 2.7.1 | 200ms 内点 B12 三次 | 按钮 disabled→enabled 状态正确；不产生 3 条 user 气泡 | phase5-spam-1-send-x3-result |
| 2.7.2 | 200ms 内点 B31 三次 | 1 次保存；不产生 3 个重复任务 | phase5-spam-2-save-x3-result |
| 2.7.3 | 200ms 内点 B27 三次 | 1 个 #bigTaskModal；不堆叠 | phase5-spam-3-add-schedule-x3-result |

**判据**：
- ✅ 副作用只发生 1 次
- ✅ 按钮有 disabled / loading / 隐藏 / 幂等去重（满足 4 选 1）
- ❌ 重复产生日程/任务/会话

---

## 3. 前后端一致性核对表

> 关键 IPC 调用逐个执行，前端 DOM 与后端 `/api/*` 同时观察；记录"单向异常"。

| # | IPC / 操作 | 前端期望 | 后端期望 | 核对点 | 截图点 |
|---|-----------|---------|---------|--------|--------|
| 3.1 | `set-api-key` (B03) | #deepseek-status 变 "已配置" | `config.json` 写入 + `POST /api/config` 不报未配置 | 文件落盘 + API 200 | phase6-ipc-3.1-set-key |
| 3.2 | `set-model` (无 UI, 改 config.json) | - | config.json `api.deepseek.model` 改值 + 后端下次 agent-chat 用新 model | (无 UI 入口，需手动改 config) | - |
| 3.3 | `create-schedule` (B40→B41 编辑保存) | 日历格内容更新 + 右侧列表新增 | `saveScheduleData` 触发 + 文件落盘（`/api/schedule/save` 或 `save-schedule-data` IPC） | 关闭重启后日程仍在 | phase6-ipc-3.3-schedule |
| 3.4 | `send-message` (B12 / testExec) | 气泡追加 | `/api/agent-chat` 或 `/api/agent-chat-stream` 命中 + 日志记录 | 200ms 内前端 UI 与后端日志同步 | phase6-ipc-3.4-send-msg |
| 3.5 | `fetch-history` (B12 前自动) | 启动时历史渲染 | `/api/history` 返回 200 | 列表与 `window._conversationHistory` 一致 | phase6-ipc-3.5-history |
| 3.6 | `agent-approve` (B36 提案确认) | 提案变 "已应用" | `POST /api/agent-approve` 200 + schedule 文件更新 | 双向 OK | phase6-ipc-3.6-approve |
| 3.7 | `archive-conversations` (菜单 / debug) | 历史归档到二级 | `/api/conversations/archive` 200 | (人工触发) | - |
| 3.8 | `clear-conversations` (菜单 / debug) | 历史清空 | `/api/conversations/clear` 200 | (人工触发) | - |
| 3.9 | `cancel-agent-stream` (Escape 取消) | typing 立即消失，AI 气泡显示"已取消" | 后端 stream 终止 | - | - |
| 3.10 | `validateApiKey` (B04) | #deepseek-message 显示 "有效" / "无效" | `/api/agent-chat` 探活 + 返回 | 延迟 < 3s | phase6-ipc-3.10-validate |
| 3.11 | `python-status` 事件 | #pythonStatusBanner 同步 | main.js 监听到 pythonProcess 状态变更 | 与 2.6.3 联动 | (含在 2.6.3) |

---

## 4. 特别关注（来自 ux-interaction-audit 的回归检查）

> 这些是历史已识别的缺陷，本轮验证是否**仍未修复**或**新引入**。

| # | 关注点 | 关联 spec | 测试场景 | 截图点 |
|---|--------|----------|---------|--------|
| R1 | 静默 `catch {}` 吞错 | ux-interaction-audit | 全流程中故意制造 IPC 失败（断网、kill backend），观察 console 是否有可读错误 | (console 截图) |
| R2 | 保存按钮无 loading | ux-interaction-audit | 2.3 节 M6 | (含在 M6) |
| R3 | 提案按钮可重复点击 | ux-interaction-audit | 2.7 节 2.7.3 | (含在 2.7) |
| R4 | 弹窗缺 Escape | ux-interaction-audit | 2.3 节 M4 | (含在 M4) |
| R5 | 聊天气泡 base64 注入主线程 | ux-interaction-audit | 2.1 节 + 上传大图（>1MB） | (录屏) |
| R6 | `💭 思路过程` 重复渲染 | ux-interaction-audit | 2.1.7 | phase3-chat-6-thinking-chain-expanded |
| R7 | 右侧面板动画 jank | fix-right-panel-animation-jitter | 2.4 节 2.4.5 三次切换 | (录屏/3 张) |
| R8 | Agent chat 上下文丢失 | fix-history-reasoning-stripping | 2.1.8 上下文保持 | - |
| R9 | 提案面板样式 | desktop-agent-centric-redesign | 2.2 节 2.2.3 | phase3-tool-1-schedule-proposal |
| R10 | 4 flash 模型相关 | fix-v4-flash-thinking-mode | 2.1 节完整流程 | (含在 2.1) |

---

## 5. 执行顺序与产出

### 5.1 推荐执行顺序
1. **0.x**：启动 + 基线
2. **1.x**：按钮清单遍历（Phase 2，Task 3 对应）
3. **2.1**：Agent 对话主流程（Phase 2，Task 4）
4. **2.2**：工具调用（Phase 2，Task 4）
5. **2.3**：弹窗清单（Phase 2，Task 5）
6. **2.4**：侧边栏/抽屉（Phase 2，Task 5）
7. **2.5**：主题切换（Phase 2，Task 6）
8. **2.6**：异常场景（Phase 3，Task 7）
9. **2.7**：重复点击（Phase 3，Task 7）
10. **3.x**：前后端一致性（Phase 3，Task 8）
11. **4.x**：回归关注（横切）

### 5.2 每个场景的产出物
- 截图（按 §screenshots/README.md 命名）
- 一条记录填到 `visual-report.md`（场景、状态 PASS/FAIL/PARTIAL、证据截图、问题描述）
- 真问题（可复现）追加到 `tasks.md` 末尾的"问题修复"子任务列表（**不**改源码）

### 5.3 通过标准
- 所有 Phase 2 主流程场景 PASS
- Phase 3 异常场景至少**可降级**（不永久 loading、不静默）
- Phase 4 回归关注点 R1~R10 无新增缺陷（已存在的允许 PARTIAL）

---

## 附录 A：源码推断的 selector 复核清单

执行测试时，按以下流程对每条 selector 复核一次：

```javascript
// 在 DevTools Console 执行
['#agentMainSendBtn', '#agentMainInput', '#agentMainChatContainer',
 '#agentSendBtn', '#agentInput', '#agentChatContainer',
 '#bigTaskModal', '#bigTaskName', '#bigTaskEstimated', '#bigTaskDdl',
 '#settingsOverlay', '#deepseek-key-input', '#deepseek-status',
 '#modalOverlay', '#modalBody', '#editBtn',
 '#pythonStatusBanner', '#sidebarCollapsible', '#calendarGrid',
 '#timeSidebar', '#rightPanelBar',
 '#mainTypingIndicator', '#typingIndicator',
 '.agent-message.user', '.agent-message.assistant',
 '.thinking-process.has-thinking',
 '.proposal-btn.approve', '.proposal-btn.reject',
 '.schedule-proposal'
].forEach(s => {
    const el = document.querySelector(s);
    console.log(s, '=>', el ? `${el.tagName}.${el.className}` : 'NULL');
});
```

将任何 NULL 的 selector 在 `visual-report.md` 的"selector 复核"段标记，并补充实际 selector。

---

## 附录 B：测试通道已知差异（执行前必读）

`preload.js` 暴露了 `window.electronAPI.testExec/testQuery`（走 `ipcRenderer.invoke('test-exec', ...)`），但 `main.js` **未注册**对应的 `ipcMain.handle('test-exec')`。这意味着：

- ✅ **能用的通道**：HTTP `http://127.0.0.1:5199/test/exec` 和 `/test/query`（需 `Authorization: Bearer $TOKEN`）
- ❌ **不能用的通道**：直接 `await window.electronAPI.testExec(...)`（会 reject "No handler registered"）
- 本 spec 执行阶段**必须**用 HTTP 通道，且在 `visual-report.md` 中**记录此不一致**作为发现项

---

## 附录 C：环境差异记录（执行时确认）

执行测试时**同时**记录以下环境信息（写入 `visual-report.md` 头部）：

| 项 | 期望 | 实际 | 偏差 |
|----|------|------|------|
| OS | Windows 10/11 | | |
| Node 版本 | ≥ 18 (electron 33 要求) | | |
| Python 版本 | 3.10+ | | |
| `node_modules` 是否存在 | 是 | | |
| `fastapi` 版本 | 0.115.0 (要求) | 0.136.1 (实际) | ✓ 兼容 |
| `uvicorn` 版本 | 0.30.0 (要求) | 0.47.0 (实际) | ✓ 兼容 |
| `httpx` 版本 | 0.27.0 (要求) | 0.28.1 (实际) | ✓ 兼容 |
| `python-dotenv` 是否安装 | 是 | 否 | ✗ 需 `pip install`（如触发） |
| Electron 版本 | 33.4.11 | | |
| `PLANMOSAIC_CONTROL_TOKEN` 是否生成 | 是 | | |
| 后端端口 | 5180 (默认) | | |
| `app.isPackaged` | false | | |
