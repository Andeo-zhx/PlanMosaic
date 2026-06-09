# 合并 backend 文件夹到 PlanMosaic Desktop Spec

## Why
`backend/` 文件夹当前位于项目根目录 `d:\Trae CN\Projects\PlanMosaic\backend\`，是 `PlanMosaic Desktop/` 桌面应用专属的 Python 后端（FastAPI、CLI、工具执行、路径管理）。它与桌面端之外的任何项目（Android、Uni-app）都没有关系，独立放在项目根目录容易造成“backend 到底是给谁用的”的认知混乱。

将 `backend/` 合并进 `PlanMosaic Desktop/` 后，桌面应用的所有源码（Electron 主进程 + Python 后端）将集中在一个文件夹内，物理边界与逻辑边界保持一致，减少误删/误改风险，也便于未来整体打包或迁移。

## What Changes
- **移动** `d:\Trae CN\Projects\PlanMosaic\backend\` → `d:\Trae CN\Projects\PlanMosaic\PlanMosaic Desktop\backend\`
  - 文件包括：`__init__.py`、`cli.py`、`config.py`、`paths.py`、`requirements.txt`、`server.py`、`tool_executor.py`、`tools.py`、以及 `__pycache__/` 缓存目录
- **修改** `PlanMosaic Desktop/main.js` 中 `startPythonBackend()` 的 `spawn` 配置：
  - `cwd: path.join(__dirname, '..')` → `cwd: app.isPackaged ? path.join(__dirname, '..') : __dirname`
  - 原因：开发模式下 `backend/` 与 `main.js` 同在 `PlanMosaic Desktop/` 内，cwd 应为 `__dirname`；打包模式下 `main.js` 位于 `resources/app/`，`backend/` 在 `resources/backend/`（由 extraResources 复制），仍需 `path.join(__dirname, '..')` 才能找到
- **修改** `PlanMosaic Desktop/cli/server.js` 中 `startPythonBackend()` 的 `spawn` 配置：
  - `cwd: path.join(__dirname, '..', '..')` → `cwd: path.join(__dirname, '..')`
  - 原因：同上，`cli/server.js` 在 `cli/` 子目录下，需要向上 1 级到达 `PlanMosaic Desktop/`
- **修改** `PlanMosaic Desktop/package.json` 中 `build.extraResources`：
  - `"from": "../backend"` → `"from": "backend"`
  - 原因：合并后 `backend/` 位于 `PlanMosaic Desktop/` 内部，`from` 相对于该目录
  - `"to": "backend"` 保持不变（打包后资源路径仍为 `resources/backend/`）
- **修改** `backend/server.py` 中 `SCRIPT_DIR` 变量：
  - `os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "PlanMosaic Desktop")` → `os.path.dirname(os.path.dirname(os.path.abspath(__file__)))`
  - 原因：合并后 `server.py` 位于 `PlanMosaic Desktop/backend/server.py`，其父目录的父目录就是 `PlanMosaic Desktop/` 本身，无需再拼接 `"PlanMosaic Desktop"` 子目录名（否则会错误地指向 `PlanMosaic Desktop/PlanMosaic Desktop/`）
  - 同时删除 fallback 行（`if not os.path.isdir(SCRIPT_DIR): SCRIPT_DIR = ...`），因为合并后不再需要 fallback 逻辑

## Impact
- Affected specs: 无（纯文件整理 + 路径引用调整，不改变功能逻辑）
- Affected code:
  - **移动**: `backend/` 整个目录（8 个 Python 文件 + 1 个 `requirements.txt` + `__pycache__/`）
  - **修改**: `PlanMosaic Desktop/main.js`（1 行 `cwd` 调整）
  - **修改**: `PlanMosaic Desktop/cli/server.js`（1 行 `cwd` 调整）
  - **修改**: `PlanMosaic Desktop/package.json`（1 行 `extraResources.from` 调整）
  - **修改**: `PlanMosaic Desktop/backend/server.py`（`SCRIPT_DIR` 变量调整，2 行）
- 不受影响:
  - 所有 Python 模块内部代码（`server.py`、`tools.py` 等）的 import 逻辑（仍以 `backend.xxx` 模块名互相 import）
  - `preload.js`（不涉及后端路径）
  - `ai-agent.js`、前端 HTML/CSS、测试 harness（这些只通过 HTTP 调 `127.0.0.1:8080`，与 `backend/` 物理位置无关）
  - `PlanMosaic AndroidStudio/`、`PlanMosaic Uni-app/`（与 Python 后端无关）

## ADDED Requirements

### Requirement: backend 文件夹并入桌面端
桌面端专属的 Python 后端代码 SHALL 全部位于 `PlanMosaic Desktop/backend/` 目录下，不在项目根目录或其他子项目目录中再保留任何 `backend/` 文件夹。

#### Scenario: 项目根目录无 backend 残留
- **WHEN** 查看 `d:\Trae CN\Projects\PlanMosaic\` 根目录
- **THEN** 不存在 `backend/` 文件夹，所有 Python 后端源码、配置、依赖清单都已迁移到 `PlanMosaic Desktop/backend/`

#### Scenario: 桌面端目录包含完整 backend 包
- **WHEN** 查看 `d:\Trae CN\Projects\PlanMosaic\PlanMosaic Desktop\backend\`
- **THEN** 应包含 `__init__.py`、`cli.py`、`config.py`、`paths.py`、`requirements.txt`、`server.py`、`tool_executor.py`、`tools.py` 全部 8 个 Python 源文件 + `requirements.txt`（共 9 个有效文件，缓存目录可选）

### Requirement: 开发模式后端可正常启动
在开发模式下（`npm start` 或 `node cli.js server start`），Python 后端 SHALL 能通过 `python -m backend.server` 正常启动并通过 `/health` 健康检查。

#### Scenario: Electron 开发模式启动后端
- **WHEN** 运行 `cd "PlanMosaic Desktop" && npm start`
- **THEN** `main.js` 中 `startPythonBackend()` 使用 `cwd: app.isPackaged ? path.join(__dirname, '..') : __dirname`（开发模式走 `__dirname` 分支）
- **AND** Python 解释器在 `PlanMosaic Desktop/` 工作目录下找到 `backend/` 包并成功加载 `backend.server` 模块
- **AND** `/health` 端点返回 200，后端就绪

#### Scenario: CLI 开发模式启动后端
- **WHEN** 运行 `cd "PlanMosaic Desktop" && node cli.js server start`
- **THEN** `cli/server.js` 中 `startPythonBackend()` 使用 `cwd: path.join(__dirname, '..')`（即 `PlanMosaic Desktop/`）启动后端
- **AND** 后端同样能成功启动

### Requirement: 打包模式资源包含完整 backend
在 Electron 打包模式下（`npm run build`），`backend/` SHALL 通过 `extraResources` 正确包含在 `resources/backend/`，保证打包后运行时能 import。

#### Scenario: extraResources 正确指向新位置
- **WHEN** 执行 `npm run build` 打包
- **THEN** `package.json` 中 `extraResources` 的 `from` 字段指向 `backend`（相对 `PlanMosaic Desktop/`）
- **AND** 打包产物中的 `resources/backend/` 包含所有 Python 源文件 + `requirements.txt`
- **AND** Electron 运行时仍以 `resources/` 为 cwd 找到 `backend/server.py`（此部分代码不变）

### Requirement: 路径调整不引入功能缺损
文件移动 + 路径调整 SHALL 不会改变任何运行时行为：API 端点列表、请求/响应格式、工具调用、SSE 流式聊天、配置管理、日程数据读写、ReAct 日志生成等所有功能 SHALL 保持与移动前完全一致。

#### Scenario: 功能回归零变化
- **WHEN** 调整完毕，使用与原 spec `python-backend-migration` 完全相同的端到端用例
- **THEN** 所有 14 个原 API 端点 + 4 个新增端点行为一致
- **AND** 工具执行（46 条旧→新名称路由）行为一致
- **AND** Electron 控制服务器、健康检查、IPC 处理器行为一致

## MODIFIED Requirements

### Requirement: main.js 中 startPythonBackend 的 cwd
原 `cwd: path.join(__dirname, '..')` 调整为 `cwd: app.isPackaged ? path.join(__dirname, '..') : __dirname`。开发模式下 `backend/` 位于 `PlanMosaic Desktop/` 内，cwd 应为 `__dirname`；打包模式下 `main.js` 位于 `resources/app/`，`backend/` 在 `resources/backend/`（由 extraResources 复制），cwd 仍需要 `path.join(__dirname, '..')`。

### Requirement: cli/server.js 中 startPythonBackend 的 cwd
原 `cwd: path.join(__dirname, '..', '..')` 调整为 `cwd: path.join(__dirname, '..')`，原因同上（`cli/server.js` 在 `cli/` 子目录下）。

### Requirement: package.json 中 extraResources 的 from 路径
原 `"from": "../backend"` 调整为 `"from": "backend"`，因为 `backend/` 现已位于 `PlanMosaic Desktop/` 目录内，`from` 相对于该目录。

### Requirement: server.py 中 SCRIPT_DIR 的静态文件路径
原 `SCRIPT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "PlanMosaic Desktop")` 调整为 `SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))`，并删除 fallback 行。因为合并后 `server.py` 位于 `PlanMosaic Desktop/backend/server.py`，`os.path.dirname` 两次后就是 `PlanMosaic Desktop/` 本身，无需再拼接子目录名。

## REMOVED Requirements
无。
