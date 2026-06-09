# Checklist

## API 端点
- [ ] Python 后端新增 `POST /api/active-username` 端点
- [ ] 端点接受 `{ username: "..." | null }` JSON body
- [ ] 端点调用 `paths.set_active_username(username)` 成功（合法用户名）
- [ ] 端点调用 `app_config.load()` 重新加载 config
- [ ] 端点返回 `{ success: true, username, configPath }`
- [ ] 非法用户名（空字符串、超长、含非法字符）返回 400 + 错误信息，**不**改变 `_active_username`
- [ ] 端点响应时间 < 100ms

## Electron 同步
- [ ] 登录成功后，Electron 异步调用 `POST /api/active-username { username }`
- [ ] 登出时，Electron 异步调用 `POST /api/active-username { username: null }`
- [ ] 切换账号：先调 `null`，再调新用户名
- [ ] 调用失败时仅 `console.warn`，不阻塞 UI
- [ ] 同步调用时机在 `pmPaths.setActiveUsername()` 之后

## 端到端验证
- [ ] 用户登录后，Python 立即用对应用户子目录的 config.json
- [ ] 用户在 UI 设置新 Key 后，对话能正常调用 DeepSeek（不再 401）
- [ ] DeepSeek 端返回的 `****` 掩码段与用户当前 Key 尾段一致
- [ ] 用户登出后，Python 回退到根目录 config
- [ ] 切换账号后，Python 立即加载新账号的 config
- [ ] Python 启动时 `PLANMOSAIC_ACTIVE_USERNAME` 为空仍能正常运行（向后兼容）

## 回归保护
- [ ] 现有 `/api/config` 端点行为不变
- [ ] 现有 401 重试修复（`fix-spec-deepseek-auth-error`）行为不变
- [ ] 不修改 `data_guard.py`、`config.py`、`paths.py`、前端 JS 等无关文件
- [ ] 不引入新的 Python 第三方依赖
