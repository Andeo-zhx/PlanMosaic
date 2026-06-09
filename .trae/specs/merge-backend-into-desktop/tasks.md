# Tasks

- [x] Task 1: 移动 backend 文件夹
  - [x] SubTask 1.1: 用 `mv` 或文件系统 API 将 `d:\Trae CN\Projects\PlanMosaic\backend\` 整个目录移动到 `d:\Trae CN\Projects\PlanMosaic\PlanMosaic Desktop\backend\`
  - [x] SubTask 1.2: 验证目标位置包含 8 个 Python 源文件 + `requirements.txt`（共 9 个有效文件）
  - [x] SubTask 1.3: 验证项目根目录不再存在 `backend/` 文件夹
  - [x] SubTask 1.4: 评估损失: 移动本身零损失（仅文件系统操作），无副作用

- [x] Task 2: 修改 main.js 的 spawn cwd
  - [x] SubTask 2.1: 定位 `PlanMosaic Desktop/main.js` 第 535 行附近的 `startPythonBackend()` 函数
  - [x] SubTask 2.2: 将 `cwd: path.join(__dirname, '..')` 改为 `cwd: app.isPackaged ? path.join(__dirname, '..') : __dirname`
  - [x] SubTask 2.3: 评估损失: 开发模式下 `__dirname` = `PlanMosaic Desktop/`，`backend/` 在其下，路径正确；打包模式下 `__dirname` = `resources/app/`，`backend/` 在 `resources/backend/`（由 extraResources 复制），仍需 `path.join(__dirname, '..')`。使用 `app.isPackaged` 三元表达式同时兼容两种模式。
  - [x] SubTask 2.4: 验证：用 `grep` 确认改动到位

- [x] Task 3: 修改 cli/server.js 的 spawn cwd
  - [x] SubTask 3.1: 定位 `PlanMosaic Desktop/cli/server.js` 第 35 行附近的 `startPythonBackend()` 函数
  - [x] SubTask 3.2: 将 `cwd: path.join(__dirname, '..', '..')` 改为 `cwd: path.join(__dirname, '..')`
  - [x] SubTask 3.3: 评估损失: `cli/server.js` 在 `cli/` 子目录下，新 cwd 为 `PlanMosaic Desktop/`，与 `main.js` 中的新 cwd 行为一致，能正确找到同级的 `backend/` 包
  - [x] SubTask 3.4: 验证：用 `grep` 确认改动到位

- [x] Task 4: 修改 package.json 的 extraResources
  - [x] SubTask 4.1: 定位 `PlanMosaic Desktop/package.json` 的 `build.extraResources` 段
  - [x] SubTask 4.2: 将 `"from": "../backend"` 改为 `"from": "backend"`
  - [x] SubTask 4.3: 评估损失: `from` 是相对于 electron-builder 运行的目录（即 `PlanMosaic Desktop/`），原 `"../backend"` 指向项目根的 `backend/`，新 `"backend"` 指向 `PlanMosaic Desktop/backend/`，`to: "backend"` 保持不变，最终产物路径完全一致（`resources/backend/`）
  - [x] SubTask 4.4: 验证：用 `grep` 确认改动到位

- [x] Task 5: 修改 server.py 的 SCRIPT_DIR（静态文件服务路径）
  - [x] SubTask 5.1: 定位 `PlanMosaic Desktop/backend/server.py` 第 61-63 行的 `SCRIPT_DIR` 变量定义
  - [x] SubTask 5.2: 将 `SCRIPT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "PlanMosaic Desktop")` 改为 `SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))`，并删除 fallback 行
  - [x] SubTask 5.3: 评估损失: 合并后 `server.py` 位于 `PlanMosaic Desktop/backend/server.py`，`os.path.dirname` 两次就是 `PlanMosaic Desktop/` 本身。如果不改，会错误地指向 `PlanMosaic Desktop/PlanMosaic Desktop/`（不存在），导致所有静态文件返回 404。这是**关键性修改**。
  - [x] SubTask 5.4: 验证：静态文件 `GET /` 返回 200 且内容正确（426KB index.html）

- [x] Task 6: 全局检索与一致性确认
  - [x] SubTask 6.1: 全局检索所有 `backend` 关键字引用
  - [x] SubTask 6.2: 确认无遗漏的 `../backend` 路径引用
  - [x] SubTask 6.3: 确认 `python -m backend.server`、`python -m backend.cli` 等模块名引用（Python 模块名，与物理位置无关）
  - [x] SubTask 6.4: 确认无残留的过时 `path.join(__dirname, '..')` 引用 backend 的代码
  - [x] SubTask 6.5: 评估损失: 全局检索确认无遗漏，安全网通过

- [x] Task 7: 端到端功能验证
  - [x] SubTask 7.1: 在 `PlanMosaic Desktop/` 下运行 `python -m backend.server`，后端成功启动
  - [x] SubTask 7.2: `/health` 端点返回 `{"status":"ok"}` (HTTP 200)
  - [x] SubTask 7.3: `python -m backend.cli -h` 帮助输出正常
  - [x] SubTask 7.4: 评估损失: 烟雾测试全部通过，无文件损坏

# Task Dependencies
- Task 2、3、4、5 依赖 Task 1（必须先移动文件再改引用，否则 `cwd` 指向空目录）
- Task 6 依赖 Task 2、3、4、5（必须先完成所有路径调整再做全局检索）
- Task 7 依赖 Task 1、2、3、4、5（验证全部调整完成后的最终状态）