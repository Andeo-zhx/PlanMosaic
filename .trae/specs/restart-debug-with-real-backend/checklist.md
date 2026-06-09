# Verification Checklist

## Phase 1：清理错误模式

- [ ] **T1.1** 8765 端口已释放（`netstat -an | findstr 8765` 无 LISTENING）
- [ ] **T1.2** StopCommand 返回成功
- [ ] **T2.1** electronapi-mock.js 顶部加"已废弃"注释
- [ ] **T2.2** mock 脚本仍在 `.trae/specs/fix-visual-found-issues-v1/electronapi-mock.js`（不删，留作 dev tool）

## Phase 2：Python 后端

- [ ] **T3.1** `pip show fastapi uvicorn httpx` 全部返回版本号
- [ ] **T3.2** `backend/requirements.txt` 列出的依赖全部 OK
- [ ] **T4.1** `python server.py` 启动无 traceback
- [ ] **T4.2** 5199 端口 LISTENING
- [ ] **T4.3** `curl http://127.0.0.1:5199/api/config` 返回 200 + application/json
- [ ] **T4.4** 启动日志含 uvicorn running on + Application startup complete

## Phase 3：登录验证

- [ ] **T5.1** Supabase URL 和 key 已知（从后端代码或环境变量）
- [ ] **T5.2** `curl -X POST $SUPABASE_URL/rest/v1/rpc/login_user` 调通
- [ ] **T5.3** 用 Andeo/Funkes 返回 200 + user/session 或具体错误
- [ ] **T5.4** 错误凭证（wrong/pass）返回 401/400，错误信息可读
- [ ] **T6.1** 后端 `/api/auth/login` 路由存在（如不存在则跳过）
- [ ] **T6.2** 用 Andeo/Funkes 调后端成功（如路由存在）
- [ ] **T7.1** 调 `supabaseRPC('login_user', ...)` 成功（与前端 index.html:8106 一致）

## Phase 4：Electron 启动

- [ ] **T8.1** `node_modules` 已装
- [ ] **T8.2** `package.json` 有 `start` 脚本
- [ ] **T8.3** electron 包在 node_modules
- [ ] **T9.1** `npm start` 在子代理环境尝试（记录 stdout/stderr）
- [ ] **T9.2** 如失败，记录失败原因（GUI 不可见、端口冲突等）
- [ ] **T10.1** 用户启动指南写入 `real-debug-report.md`
- [ ] **T10.2** 启动命令含：env var、cd 命令、npm start

## Phase 5：用户本地 GUI 验证

- [ ] **T11.1** Electron GUI 启动成功
- [ ] **T11.2** Python 后端被 spawn（约 2~3s）
- [ ] **T11.3** 登录界面出现（不直接进入主界面）
- [ ] **T11.4** 输入 Andeo/Funkes → 点击登录
- [ ] **T11.5** 登录成功 → 跳转到主界面
- [ ] **T11.6** 无 JSON 解析错误
- [ ] **T11.7** 截屏 `screenshots/login-success.png` 保存
- [ ] **T12.1** v1 报告 23 问题在真实 GUI 下逐条核对（按 visual-test-script §1~§2）
- [ ] **T12.2** 每场景截屏 + 状态（PASS/FAIL/PARTIAL）
- [ ] **T12.3** 任何 v1 PASS → 真实 FAIL 记录为"v1 漏报"
- [ ] **T13.1** v2 修复 15 条在真实 GUI 下逐条验证
- [ ] **T13.2** 每条修复 1 张证据截屏
- [ ] **T13.3** 任何 v2 修复未生效记录为"v2 漏修"

## Phase 6：报告

- [ ] **T14.1** real-debug-report.md 生成
- [ ] **T14.2** 含：启动日志（Python + Electron）
- [ ] **T14.3** 含：登录调用链路（Andeo/Funkes 完整请求/响应）
- [ ] **T14.4** 含：GUI 场景验证表
- [ ] **T14.5** 含：v1/v2 重新核对
- [ ] **T14.6** 含：Browser-use 漏报真问题清单
- [ ] **T15.1** 漏报/漏修追加到 tasks.md 末尾

---

## 验证统计

| Phase | 总项 | 通过 | 待执行 |
|-------|------|------|--------|
| Phase 1 清理 | 4 | 0 | 4 |
| Phase 2 Python | 8 | 0 | 8 |
| Phase 3 登录 | 9 | 0 | 9 |
| Phase 4 Electron | 8 | 0 | 8 |
| Phase 5 GUI 验证 | 14 | 0 | 14 |
| Phase 6 报告 | 7 | 0 | 7 |
| **总计** | **50** | **0** | **50** |

修复完成后，预期：
- 全部 50 项通过（除 GUI 验证中依赖用户实际启动的 14 项需用户完成）

## 结论标准

- **成功**：所有 Phase 1~4 通过 + 用户完成 GUI 验证 + 登录成功
- **部分成功**：登录成功但 v1/v2 重新核对发现 ≥1 个漏报
- **失败**：登录失败或后端启动失败
