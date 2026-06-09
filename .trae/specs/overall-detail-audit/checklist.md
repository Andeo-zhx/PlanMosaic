# Checklist

> 本 checklist 是整体细节审阅（overall-detail-audit）执行阶段的**完成度判定**清单。
> 每项代表"审阅报告应当覆盖的范围"，打勾表示该审阅点已实际查过并写入报告。

---

## D1. 项目结构与卫生

- [ ] 根 `.gitignore` 完整度已审（覆盖 `release/` / `build/` / `node_modules/` / `__pycache__/` / `.gradle/` / `.idea/` / `unpackage/` / `dist/` 等）
- [ ] Android `.gitignore` 已审（覆盖 `local.properties` / `.keystore` / `*.jks`）
- [ ] Desktop `.gitignore` 已审（覆盖 `release/` / `out/` / 便携 exe 产物）
- [ ] 根目录散落文件已列出（`planmosaic-export.csv`、`调试文件/QQ20260521-115216.mp4` 等）
- [ ] `CLI_UI_BRIDGE_DEFECT_REPORT.md` 状态已确认
- [ ] `screenshot.py` 用途已确认
- [ ] 根 README 缺失已记录
- [ ] 三端各自 README 状态已记录
- [ ] `LICENSE` / `CHANGELOG` / `CONTRIBUTING` 现状已记录
- [ ] Android 包名 `com.example.planmosaic_android` 占位问题已记录
- [ ] 三端 `productName` / `appId` / `appid` 一致性已审
- [ ] 三端版本号同步性已审

## D2. 依赖与供应链

- [ ] `package.json` 依赖清单已审
- [ ] `electron@33.4.11` 是否有 CVE 已查
- [ ] `@supabase/supabase-js` 版本对比已查
- [ ] `electron-builder` 与 `electron-packager` 同时存在是否冗余已查
- [ ] 未使用依赖已标出
- [ ] `requirements.txt` 版本锁定情况已审
- [ ] Python 关键依赖 CVE 已查
- [ ] `gradle/libs.versions.toml` 已审
- [ ] Android Compose / OkHttp / Supabase / Hilt / Navigation 版本已查
- [ ] Android `compileSdk` / `targetSdk` / `minSdk` 合理性已评
- [ ] Uni-app `uni_modules/` 来源合规性已审
- [ ] `manifest.json` 中 `appid` 格式已查
- [ ] Uni-app 不必要权限已列出

## D3. 构建与发布

- [ ] `package.json#build.files` 覆盖完整性已审
- [ ] `extraResources` 引用 `../backend` 路径解析问题已查
- [ ] `win.target: portable` + `sign: null` 信任链问题已记录
- [ ] `productName` 与 artifact 命名一致性已查
- [ ] `build_apk.bat` 内容已审
- [ ] `install_apk.bat` 硬编码路径已查
- [ ] `build_helper.bat` 用途已确认
- [ ] `gradle.properties` 关键开关已审
- [ ] Android `signingConfigs` / `buildTypes.release.signingConfig` 已查
- [ ] `proguard-rules.pro` 覆盖范围已查
- [ ] `isMinifyEnabled` / `isShrinkResources` 启用状态已查
- [ ] `.hbuilderx/launch.json` 已审

## D4. 配置与密钥管理

- [ ] Desktop `config.json` schema 已抽
- [ ] Desktop `settings.json` schema 已抽
- [ ] CLI `config.js` 与 Electron 主进程配置读取一致性已查
- [ ] Desktop API Key 流转路径（UI → IPC → 内存 → 配置 → 加密？）已画出
- [ ] Android `DataStoreManager.kt` 加密策略已查
- [ ] Android `CryptoManager.kt` 实际使用情况已查
- [ ] Uni-app `storage-keys.ts` 中 API Key 相关 key 已列
- [ ] 硬编码占位符（`com.example.planmosaic_android`、`https://api.example.com` 等）已列
- [ ] `TODO` / `FIXME` 注释遗留数已统计

## D5. 数据模型与持久化

- [ ] Desktop `data.json` 顶层结构已抽
- [ ] Android `Models.kt` 字段集已抽
- [ ] Uni-app `store/schedule.ts` state 结构已抽
- [ ] 三端数据模型对照表已生成
- [ ] Desktop `paths.js` `setActiveUsername` 流程已核
- [ ] Android `FileSystemUserStorage.kt` 隔离策略已核
- [ ] Android `IPreferencesStorage.kt` 隔离策略已核
- [ ] Uni-app 端账号切换存在性已查
- [ ] Desktop Supabase 同步上行清单已抽
- [ ] Android `SupabaseClient.kt` 表结构与字段已抽
- [ ] Uni-app 是否有 Supabase 集成已查
- [ ] `assets/vocab/*.json` 内容已抽样（college1-3 / medical）
- [ ] Android `VocabModels.kt` / `VocabRepository.kt` 数据访问模式已核

## D6. AI Agent 子系统

- [ ] Desktop `ai-tools.js` 工具列表已抽
- [ ] Python `tool_executor.py` + `tools.py` 工具实现已抽
- [ ] Android `ToolDefinitions.kt` 工具列表已抽
- [ ] 三端工具对照表已生成（标注缺失/不一致）
- [ ] Python 端事务性写入（`os.replace` + `os.fsync`）已核
- [ ] Android `ToolExecutors.kt` 错误处理已核
- [ ] Desktop 浏览器端工具 `ai-tools.js` 实现已核
- [ ] Desktop 提案渲染与按钮逻辑已核
- [ ] Android `MosaScreen.kt` / `ChatSession.kt` 提案 UI 已核
- [ ] 深度规划模式（Desktop `openDeepPlanningModal`）是否仍存在 P-A2a 占位覆盖已核
- [ ] Android `DeepPlanningSession.kt` 实现已核
- [ ] Desktop `conversationHistory` 长度截断策略已核
- [ ] Android `MosaViewModel.kt` history 上限已核
- [ ] token 估算与超限处理已核

## D7. UI 渲染与可访问性

- [ ] Android `ui/screens/` 4 个 screen 完整性已核
- [ ] Android `ui/components/` 复用度已核
- [ ] Android `ui/theme/` 定义完整度已核
- [ ] Uni-app 4 个 `.vue` 页面完成度已核
- [ ] Uni-app 是否有占位/空函数已列
- [ ] `customicons.ttf` 完整度已核
- [ ] Desktop 主题切换逻辑已核
- [ ] Android `theme/Theme.kt` + `DarkModeSettingRow.kt` 已核
- [ ] Uni-app 主题切换存在性已查
- [ ] Desktop 键盘导航 / 焦点陷阱（`P-B1c`）是否修复已核
- [ ] Android `contentDescription` 完整度已查
- [ ] 三端 `aria-label` / semantic 标注已查

## D8. 错误处理与日志

- [ ] Desktop 静默 `catch {}` 数量（上次 spec 标记 16 处）已核
- [ ] Desktop 日志脱敏情况已审
- [ ] Python 异常是否回滚内存状态已审
- [ ] Python 错误响应脱敏（`L5`）已核
- [ ] Android `runCatching` / `try-catch` 完整度已查
- [ ] Android `AiApiClient.kt` / `SupabaseClient.kt` 错误处理已查
- [ ] Android 协程异常传播已查
- [ ] Uni-app `try-catch` 完整度已查
- [ ] Uni-app 异步 API 错误回调已查

## D9. 网络与 API

- [ ] Desktop `main.js` `http.request` `rejectUnauthorized: true`（C3）已核
- [ ] Desktop SSE 流式连接清理已核
- [ ] Desktop `shell.openExternal` API 端点白名单（H5）已核
- [ ] Android OkHttp 证书校验 / 拦截器已查
- [ ] Android `AiApiClient.kt` 端点 / 超时 / 限流重试已查
- [ ] Android `SupabaseClient.kt` 鉴权 / token 刷新已查
- [ ] Uni-app `uni.request` 端点 / 错误处理已查
- [ ] Uni-app 原生网络插件存在性已查

## D10. 性能与资源

- [ ] Desktop 日历/词汇表大列表渲染效率已评
- [ ] Desktop 流式渲染 O(n²)（`P-C2a`）已核
- [ ] `index.html` 拆分可行性已评
- [ ] Android Compose 重组优化已查
- [ ] Android `LazyColumn` key 稳定性已查
- [ ] Android 图片加载与缓存已查
- [ ] Uni-app 多页面切换性能已评
- [ ] Uni-app 编译模式（VUE3 / uni-app x）已查
- [ ] Desktop 监听器/定时器泄漏（多项已修）已核
- [ ] Android Bitmap / Canvas / Coroutine 释放已查
- [ ] Uni-app 页面栈 / storage 清理已查

## D11. 测试与质量保障

- [ ] Desktop `test/cases/*.js` 9 个 case 覆盖范围已核
- [ ] `test/harness.js` / `runner.js` 完整性已核
- [ ] CLI 单元测试存在性已查
- [ ] Android `ExampleUnitTest.kt` 仅为占位已记录
- [ ] Android `ExampleInstrumentedTest.kt` 仅为占位已记录
- [ ] Android Repository / ViewModel 测试覆盖已查
- [ ] Uni-app 任何测试文件存在性已查

## D12. 文档与可维护性

- [ ] 根 README 缺失已记录
- [ ] 三端各自 README 缺失已记录
- [ ] `ARCHITECTURE.md` / `FEATURE_PARITY.md` 缺失已记录
- [ ] 关键函数 JSDoc / KDoc / TSDoc 覆盖度已评
- [ ] 复杂业务逻辑注释完整度已评
- [ ] `TODO` / `FIXME` / `XXX` 数量与分布已统计
- [ ] Feature parity 文档存在性已查
- [ ] 已知差异是否在 README 中说明已查

## D13. 历史 spec 修复真实性验证

> 每项需在当前代码中**实际查找**确认存在（已修复）或不存在（未修复/已退化）。

- [ ] `comprehensive-code-fix#C1` CSP `<meta>` 在 `index.html` 中已确认
- [ ] `comprehensive-code-fix#C2` `main.js` 无 API Key `substring(0,10)` 日志已确认
- [ ] `comprehensive-code-fix#C3` `main.js` `rejectUnauthorized: true` 硬编码已确认
- [ ] `comprehensive-code-fix#C5` `paths.js` `setActiveUsername` 过滤 `..` `/` `\` 已确认
- [ ] `comprehensive-code-fix#H1` `preload.js` `onAgentStreamChunk` 回调不含 `event` 已确认
- [ ] `comprehensive-code-fix#H2` `preload.js` `removeListener` channel 白名单已确认
- [ ] `comprehensive-code-fix#C7` Electron ≥ 33（已 `33.4.11`）已确认
- [ ] `deep-quality-audit#P1` `main.js` `pythonApi()` `timeout: 30000` 已确认
- [ ] `deep-quality-audit#P2` `server.py` `_write_schedule_data` `os.replace` 已确认
- [ ] `deep-quality-audit#P3` `preload.js` `getApiKeys` 返回 `{configured: boolean}` 已确认
- [ ] `deep-quality-audit#P4` `ai-agent.js` 消息写入无重复已确认
- [ ] `deep-quality-audit#M8` `paths.js` `cleanOldBackups` 含 `MAX_SIZE` 已确认
- [ ] `deep-quality-audit#H7` 切换账号清空缓存逻辑已确认
- [ ] `ux-interaction-audit` 提案按钮点击后禁用已确认
- [ ] `ux-interaction-audit` `saveSchedule` 等操作有 loading 状态已确认
- [ ] `ux-interaction-audit` 模态框 Escape / 遮罩关闭已确认
- [ ] `ux-interaction-audit` 关键 `catch` 不再为空已确认
- [ ] `ux-interaction-audit` `requestSingleInstanceLock` 启用已确认
- [ ] `electron-security-audit` 11 个未执行任务当前状态已查
- [ ] **输出"已修复 / 未修复 / 已退化"对照表**（合并 D13 所有结果）

---

## 报告输出要求

- [ ] 审阅报告按 D1–D12 维度组织
- [ ] 每条问题标注严重度（🔴 / 🟠 / 🟡 / 🟢 / ℹ️）
- [ ] 每条问题附文件 + 行号
- [ ] 每条问题附最小修复方向
- [ ] 历史 spec 修复真实性以对照表呈现
- [ ] 总计 Android ≥ 10 处、Uni-app ≥ 5 处、Desktop ≥ 20 处、跨端 ≥ 5 处、根级/构建/依赖 ≥ 5 处
- [ ] 报告作为 `spec.md` 的"问题清单"小节追加
