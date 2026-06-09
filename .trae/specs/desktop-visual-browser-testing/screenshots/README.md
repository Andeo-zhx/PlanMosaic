# Screenshots — 截图归档规范

本目录用于存放 `desktop-visual-browser-testing` spec 执行阶段产出的所有截图证据。**每个截图必须在 `visual-report.md` 中至少被引用一次**，且必须能在 `tasks.md` 的对应场景条目中找到对应关系。

---

## 1. 启动前置条件（执行前必读）

> 本 spec 不真的启动 Electron 应用（GUI 启动在子代理环境不可控），但人工执行测试时**必须满足以下条件**才能跑出有意义的结果。

### 1.1 Node / Electron 依赖
- 工作目录：`PlanMosaic Desktop/`
- `node_modules/` 必须存在（由 `npm install` 一次性安装，含 `electron@33.4.11`、`electron-builder`、`@supabase/supabase-js`）
  - **当前状态**（Phase 1 检查时刻）：`node_modules/` 缺失，执行测试前必须 `cd "PlanMosaic Desktop" && npm install`
- `package.json` 中 `start` 脚本：`electron .`（即 `electron .` 直接拉起 `main.js`）

### 1.2 Python 后端依赖
- `PlanMosaic Desktop/backend/requirements.txt` 列出：`fastapi==0.115.0`、`uvicorn==0.30.0`、`httpx==0.27.0`、`python-dotenv==1.0.1`
- **当前环境诊断**（Phase 1 检查时刻）：
  - `fastapi` 0.136.1（已装，版本比 requirements 略新，**OK**）
  - `uvicorn` 0.47.0（已装，**OK**）
  - `httpx` 0.28.1（已装，**OK**）
  - `python-dotenv` **未安装**（requirements 中列出但 `backend/*.py` 实际未 import dotenv，**当前不阻塞**；若未来后端真用 dotenv，需 `pip install python-dotenv`）
- `PlanMosaic Desktop/backend/__pycache__/` 含 8 个 `.pyc`（`__init__`、`cli`、`config`、`helpers`、`paths`、`server`、`tool_executor`、`tools`），说明后端最近成功 import 过

### 1.3 启动命令序列
```powershell
# 1. 安装 Node 依赖（首次或 node_modules 缺失时）
cd "d:\Trae CN\Projects\PlanMosaic\PlanMosaic Desktop"
npm install

# 2. 可选：明确启用测试模式环境变量（任务描述要求）
#    注意：实际 main.js 中以 `app.isPackaged === false` 作为测试通道启用条件，
#    未打包运行（`electron .`）即视为测试模式；显式设置环境变量便于日志定位
$env:PLANMOSAIC_TEST_MODE = "1"

# 3. 启动应用
npm start
#    或等效：npx electron .
```

### 1.4 启动成功的判据
- 主窗口出现，DevTools Console 出现以下日志（任一即视为 init OK）：
  - `[Preload] Electron API exposed`
  - `[Mosa] init` 或同类初始化日志
  - `[CLI Control] Server listening on http://127.0.0.1:5199`（说明控制端口起来了，测试通道可用）
- Python 后端在主进程拉起：
  - 主进程 stdout 出现 `[Startup] Python backend started`
  - `curl http://127.0.0.1:5180/api/config` 返回 200
  - **注**：后端端口非固定，需从 `PYTHON_BACKEND_URL` 环境变量 / `main.js` 启动日志中读取；默认 `http://127.0.0.1:5180`

### 1.5 测试通道访问方式
- **HTTP 端点**（仅 `app.isPackaged === false` 启用）：
  - `POST http://127.0.0.1:5199/test/exec`（Body: `{"command": "...", "params": {...}}`）
  - `GET  http://127.0.0.1:5199/test/query?target=...`
  - 鉴权：`Authorization: Bearer <PLANMOSAIC_CONTROL_TOKEN>`（启动时随机生成，可通过 `echo $env:PLANMOSAIC_CONTROL_TOKEN` 读取）
- **已知差异**：`preload.js` 暴露了 `window.electronAPI.testExec/testQuery`（走 `ipcRenderer.invoke('test-exec')`），但 `main.js` **未注册**对应的 `ipcMain.handle('test-exec')`。
  - **这意味着通过 renderer 进程调用 `testExec` 会失败**，必须用 HTTP 通道
  - 本 spec 执行阶段在 `visual-report.md` 中应记录此差异

### 1.6 DeepSeek API Key 准备
- 两种执行状态：
  - **状态 A：API Key 不可用**（测试降级场景）—— `config.json` 写入 `YOUR_DEEPSEEK_API_KEY_HERE` 占位符，预期 `/api/agent-chat` 返回 401/403 错误
  - **状态 B：API Key 可用**（测试正常路径）—— 配置真实 Key，预期 AI 气泡正常返回
- 切换方式：可通过 `testExec("set-api-key", {key: "..."})` 注入，或编辑 `config.json` 后重启

---

## 2. 截图命名规范

### 2.1 总则
- 文件名小写、`-` 分隔
- 后缀统一 `.png`
- 不含空格、不含中文
- **同一场景的状态序号**从 0 或 1 起，按时间顺序递增

### 2.2 命名模板

| 模板 | 适用场景 | 示例 |
|------|---------|------|
| `00-baseline.png` | 应用启动后主界面（基线） | `00-baseline.png` |
| `01-loading.png` | 启动加载状态 | `01-loading.png` |
| `{phase}-{scenario}-{state}.png` | 通用场景截图 | `phase2-buttons-1-hover.png` |
| `{phase}-{scenario}-{button}-{state}.png` | 按钮三态截图 | `phase3-send-1-idle.png`、`phase3-send-2-hover.png`、`phase3-send-3-pressed.png` |
| `{phase}-{scenario}-error.png` | 异常场景证据 | `phase7-empty-message-error.png` |
| `{phase}-{scenario}-before.png` / `-after.png` | 对比类截图 | `phase6-theme-dark-before.png`、`phase6-theme-dark-after.png` |

### 2.3 字段含义
- `phase`：1/2/3/4 对应 `tasks.md` 的 Phase 1~4
- `scenario`：英文短横线串，描述场景（如 `chat-flow`、`modal-settings`、`theme-dark`）
- `state`：可选；如按钮的 `idle`/`hover`/`pressed`/`disabled`/`loading`，或弹窗的 `open`/`submitting`/`closed`
- 序号：用 `1-`、`2-` 开头表示该场景的第几张

### 2.4 完整示例集
```
screenshots/
├── 00-baseline.png                              # 启动后主界面
├── 01-auth-login.png                            # 登录弹层
├── 02-main-after-login.png                      # 登录后主界面
├── phase2-buttons-1-send-idle.png
├── phase2-buttons-2-send-hover.png
├── phase2-buttons-3-send-pressed.png
├── phase2-buttons-4-send-disabled.png           # 发送中
├── phase2-buttons-5-add-schedule-hover.png
├── phase2-buttons-6-add-task-hover.png
├── phase2-buttons-7-model-flash-active.png
├── phase2-buttons-8-model-pro-active.png
├── phase2-buttons-9-settings-hover.png
├── phase2-buttons-10-account-hover.png
├── phase2-buttons-11-sidebar-schedule.png
├── phase2-buttons-12-sidebar-task.png
├── phase2-buttons-13-sidebar-plan.png
├── phase2-buttons-14-sidebar-aux.png
├── phase2-buttons-15-deepseek-link.png
├── phase3-chat-1-input-typed.png                # 输入"今天天气怎么样"
├── phase3-chat-2-user-bubble.png                # 出现用户气泡
├── phase3-chat-3-ai-thinking.png                # AI typing
├── phase3-chat-4-ai-streaming.png               # 流式追加中
├── phase3-chat-5-ai-done.png                    # 完成态
├── phase3-chat-6-thinking-chain-expanded.png    # 思路链展开
├── phase3-tool-1-schedule-proposal.png          # 创建日程提案
├── phase3-tool-2-schedule-confirmed.png         # 确认执行后
├── phase3-modal-1-settings-open.png
├── phase3-modal-2-settings-blur-close.png       # 点遮罩外
├── phase3-modal-3-settings-esc-close.png        # Escape 关闭
├── phase3-modal-4-settings-required-star.png    # 必填星号
├── phase3-modal-5-settings-saving.png           # 保存 loading
├── phase3-modal-6-add-schedule-open.png
├── phase3-modal-7-add-task-open.png
├── phase3-modal-8-proposal-confirm-open.png
├── phase3-sidebar-1-collapsed.png
├── phase3-sidebar-2-expanded.png
├── phase3-sidebar-3-scrolled-mid.png
├── phase3-sidebar-4-reopened-same-position.png  # 验证滚动位置保留
├── phase4-theme-1-light-baseline.png
├── phase4-theme-2-dark-after.png
├── phase4-theme-3-light-after.png
├── phase4-theme-4-modal-on-dark.png
├── phase5-error-1-empty-submit.png
├── phase5-error-2-long-msg-5000.png
├── phase5-error-3-backend-killed-banner.png
├── phase5-error-4-backend-recovered.png
├── phase5-error-5-invalid-key-toast.png
├── phase5-spam-1-send-x3-result.png
├── phase5-spam-2-save-x3-result.png
├── phase5-spam-3-add-schedule-x3-result.png
└── phase6-ipc-pair-{key}-frontend.png           # 前后端一致性核对
```

---

## 3. 截图与 visual-report.md 的对应关系

### 3.1 必须建立索引
- `visual-report.md` 中每个场景条目末尾必须有 `**证据**: screenshots/<file>.png`
- 单场景多截图：用 `screenshots/a.png, screenshots/b.png` 或列表展示
- 反向：本目录中**不允许存在未被 report 引用的截图**

### 3.2 截图采集要求
- 截全主窗口（不要只截按钮局部），便于复核布局
- 异常场景：截 toast / banner / console（截屏时把 DevTools 切到对应 tab）
- 对比类（主题、弹窗开关）：必须成对，文件名 `-before` / `-after` 或 `-1` / `-2` 配对

### 3.3 工具
- 推荐 `pyautogui`（`screenshot.py` 已用）+ DevTools「Capture node screenshot」组合
- macOS / Windows 原生截图也可，但要保证命名符合 §2

---

## 4. 目录约定
- **不**把 `.png` 提交到 LFS（>1MB 单张考虑压缩或云盘）
- 评审阶段 `.gitignore` 可忽略 `screenshots/*.png`，但保留 `.gitkeep` 和 `README.md`
- 本目录**只放** `.png` 和本说明文档；中间产物（`screenshot.py` 输出到 `调试文件/`）不进入本目录
