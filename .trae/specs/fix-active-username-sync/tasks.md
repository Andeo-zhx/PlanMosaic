# Tasks

- [ ] Task 1: Python 后端新增 `/api/active-username` 端点
  - [ ] 1.1 在 [server.py](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/backend/server.py) 中找到 `/api/config` 端点的位置附近
  - [ ] 1.2 新增 `POST /api/active-username` 端点：
    - 接受 JSON body `{"username": "..." | null}`
    - 调用 `paths.set_active_username(username)` 设置活跃用户
    - 立即调用 `app_config.load()` 重新加载 config
    - 返回 `{ success, username, configPath }` 或 400 `{ success: false, error: "Invalid username format" }`
  - [ ] 1.3 端点放在 `/api/config` 附近，便于代码阅读时一并维护

- [ ] Task 2: Electron 主进程在登录成功后调用新端点
  - [ ] 2.1 找到用户登录成功的代码路径（通常在 IPC handler `login` 或类似名称里）
  - [ ] 2.2 在 `pmPaths.setActiveUsername(username)` 之后，添加异步调用 `pythonApi('POST', '/api/active-username', { username })`
  - [ ] 2.3 用 `.then().catch()` 包裹，失败仅 `console.warn`，不阻塞主流程

- [ ] Task 3: Electron 主进程在登出时同步清空
  - [ ] 3.1 找到登出逻辑（已有 `pmPaths.setActiveUsername(null)` 的位置）
  - [ ] 3.2 在该位置之后，添加 `pythonApi('POST', '/api/active-username', { username: null })` 异步调用
  - [ ] 3.3 失败仅 warn

# Task Dependencies

- Task 1 是 Task 2、Task 3 的前置依赖。建议执行顺序：Task 1 → Task 2 + Task 3（可并行）。
