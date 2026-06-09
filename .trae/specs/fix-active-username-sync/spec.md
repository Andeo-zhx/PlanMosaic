# 修复 Electron 与 Python 活跃用户名不同步 Bug Spec

## Why

用户登录后通过 UI 设置了新的 DeepSeek API Key（`sk-94948ca3af2546bf93bdaa15e93e269c`）。新 Key 正确写入到了按账号隔离的子目录 `C:\Users\zhuhx\AppData\Roaming\PlanMosaic\ebbb251c\config.json`，但**调用 DeepSeek 仍然返回 401**，且日志中 DeepSeek 端掩码出来的 `****ey-b` 段既不是新 Key 的尾段（`269c`），也不是占位 Key 的尾段（`ough`）。

经排查，根因是 **Electron 主进程和 Python 后端对"当前活跃用户"存在不同步**：

1. **Electron 端**（`main.js` + `paths.js`）：用户登录后调用 `pmPaths.setActiveUsername("ebbb251c")`，所以 `getConfigPath()` 返回的是 `%APPDATA%\PlanMosaic\ebbb251c\config.json`。`set-api-key` IPC handler 写入**用户子目录**的 config.json，并在内存中 `appConfig.deepseek.key = key`。

2. **Python 端**（`backend/paths.py:31`）：`_active_username` 只在**进程启动时**从环境变量 `PLANMOSAIC_ACTIVE_USERNAME` 读取一次：
   ```python
   _active_username = _sanitize_username(os.environ.get('PLANMOSAIC_ACTIVE_USERNAME'))
   ```
   进程一旦启动，这个值就锁死了。如果用户在 Python 启动**之后**才登录，Python 拿到的 `PLANMOSAIC_ACTIVE_USERNAME` 是空字符串（`|| ''`），`_sanitize_username('')` 返回 `None`。

3. **结果**：
   - Python 的 `paths.get_config_path()` 返回 `%APPDATA%\PlanMosaic\config.json`（**根目录下的 config.json**），里面仍是占位 Key `sk-test-key-long-enough`。
   - Python 用这个旧 Key 去调 DeepSeek → 401。
   - 用户在 UI 上看到"已成功更新 Key"，但实际写入的是 `ebbb251c\config.json`，Python 一直在读根目录的旧 config。
   - 即使 Electron 紧接着调 `POST /api/config` 热更新，Python 的 `update_config` 写入的也是根目录的 config.json（因为 `paths.get_config_path()` 还是根目录路径），依然跟用户的实际 config 不一致。

这是一个**架构性的状态不一致 bug**，不是配置错误、Key 无效、或调用结构问题（那些 401 重试问题已经在 `fix-spec-deepseek-auth-error` spec 中修了）。

## What Changes

- **新增 API 端点 `POST /api/active-username`**：让 Electron 主进程在用户登录/切换账号时，动态通知 Python 后端更新 `_active_username`
- **端点行为**：
  1. 接受 `{ username: "..." }` JSON body
  2. 调用 `paths.set_active_username(username)` 设置活跃用户
  3. 立即调用 `app_config.load()` 重新加载 config（用新的用户名读对应子目录的 config.json）
  4. 返回 `{ success: true, username, configPath }` 或 400 `{ success: false, error }`
- **Electron 主进程 `setActiveUsername` 调用同步**：在用户登录成功、切换账号成功后，立即调一次 `pythonApi('POST', '/api/active-username', { username })`，失败仅 warn 不影响主流程
- **不重启 Python**：保持现有 Python 后端常驻进程的架构
- **不破坏向后兼容**：未调用新端点时，Python 仍按当前（可能为 None）的 `_active_username` 行为运行

## Impact

- Affected code:
  - `PlanMosaic Desktop/backend/server.py` — 新增 `/api/active-username` 端点
  - `PlanMosaic Desktop/backend/paths.py` — 现有 `set_active_username()` 已被使用，无需改动
  - `PlanMosaic Desktop/main.js` — 在用户登录/切换账号时调用新端点
- Affected specs: `fix-spec-deepseek-auth-error`（间接关联，因为 401 重试是这一根因的副作用）

## ADDED Requirements

### Requirement: Python 后端支持动态更新活跃用户名

系统 SHALL 提供 `POST /api/active-username` 端点，允许 Electron 主进程在 Python 后端运行期间动态更新活跃用户名。

#### Scenario: 用户登录成功后同步用户名
- **WHEN** 用户在 UI 登录成功，Electron 主进程拿到合法用户名 `ebbb251c`
- **AND** Python 后端正在运行中（已启动，但启动时 `PLANMOSAIC_ACTIVE_USERNAME` 为空）
- **AND** Electron 调用 `POST /api/active-username` body `{ "username": "ebbb251c" }`
- **THEN** 端点返回 `200 { "success": true, "username": "ebbb251c", "configPath": "C:\\...\\ebbb251c\\config.json" }`
- **AND** Python 的 `paths._active_username` 立即变为 `"ebbb251c"`
- **AND** `app_config.load()` 重新加载，读到 `ebbb251c\config.json` 里的新 Key
- **AND** 后续 `/api/agent-chat`、`/api/agent-chat-stream`、`/api/deep-planning-chat` 调用都使用新 Key

#### Scenario: 用户切换账号
- **WHEN** 用户从账号 A 登出，登录账号 B
- **AND** Electron 先调一次 `POST /api/active-username { "username": null }`（登出时清空）
- **AND** 再调一次 `POST /api/active-username { "username": "B" }`（登录新账号）
- **THEN** Python 的 `_active_username` 正确切换到账号 B
- **AND** `app_config.load()` 重新加载账号 B 的 config

#### Scenario: 用户登出（清空活跃用户）
- **WHEN** Electron 调用 `POST /api/active-username { "username": null }`
- **THEN** 端点返回 `200 { "success": true, "username": null, "configPath": "C:\\...\\PlanMosaic\\config.json" }`
- **AND** Python 的 `paths._active_username` 变为 `None`
- **AND** `app_config.load()` 重新加载根目录 config

#### Scenario: 非法用户名
- **WHEN** Electron 调用 `POST /api/active-username { "username": "bad/name" }`（包含非法字符）
- **THEN** 端点返回 `400 { "success": false, "error": "Invalid username format" }`
- **AND** Python 的 `_active_username` 保持不变

#### Scenario: 后端处理失败不影响主流程
- **WHEN** Electron 调用 `POST /api/active-username` 但 Python 后端不在运行
- **THEN** Electron 主进程在 catch 中只输出 warn 日志，**不**抛出错误
- **AND** 下次 Python 启动时会从 `PLANMOSAIC_ACTIVE_USERNAME` 环境变量恢复

### Requirement: Electron 登录/切换账号时主动同步

Electron 主进程 SHALL 在以下时机调用 `POST /api/active-username` 同步 Python 后端状态：
1. 用户登录成功后
2. 用户切换账号成功后
3. 用户登出时（传 `null`）

#### Scenario: 登录流程
- **WHEN** 用户在登录界面输入用户名和密码，点击登录
- **AND** 登录成功（密码校验通过、token 生成、UI 跳转）
- **THEN** Electron 主进程先设置本地 `activeUsername`
- **AND** 异步调用 `POST /api/active-username { username }`
- **AND** 失败仅 warn，不阻塞 UI

## MODIFIED Requirements

无。

## REMOVED Requirements

无。

## Quality Constraints

- 修复后，用户在 UI 设置新 Key 后立即发起对话：
  - DeepSeek 收到请求时，Authorization 头里的 Key 是用户设置的新 Key（mask 形如 `sk-9****269c`）
  - 不再出现 `****ey-b` 或 `****ough` 这种**不属于用户当前账号 config** 的掩码
- 修复后，Python 启动时 `PLANMOSAIC_ACTIVE_USERNAME` 仍然为空（向后兼容），新端点是补充而非替换
- 修复后，API 端点响应时间 < 100ms（仅做内存更新，不做 IO 重操作）
- 修复后，登出场景下 `configPath` 切回根目录，新登录场景下切到对应 hash 子目录
