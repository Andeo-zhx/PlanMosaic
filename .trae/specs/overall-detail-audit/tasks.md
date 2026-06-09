# Tasks

## 🟦 D1. 项目结构与卫生

- [ ] Task D1.1: 根目录与三大子项目 `.gitignore` 完整度审计
  - [ ] SubTask D1.1.1: 根 `.gitignore` 是否覆盖 `release/`、`build/`、`node_modules/`、`__pycache__/`、`.gradle/`、`.idea/`、`unpackage/`、`dist/`、uni-app 编译产物
  - [ ] SubTask D1.1.2: Android `.gitignore` 是否覆盖 `local.properties`、`.keystore`、`*.jks`、签名密钥
  - [ ] SubTask D1.1.3: Desktop `.gitignore` 是否覆盖 `release/`、`out/`、便携 exe 产物
  - **验证**: `git check-ignore` 抽样 10 个典型产物路径全部应被忽略

- [ ] Task D1.2: 散落文件清查
  - [ ] SubTask D1.2.1: 排查 `PlanMosaic Desktop/planmosaic-export.csv`（含用户导出数据？）— 应移出仓库
  - [ ] SubTask D1.2.2: 排查 `PlanMosaic Desktop/调试文件/QQ20260521-115216.mp4`（22MB 调试录屏）— 应移出仓库
  - [ ] SubTask D1.2.3: 排查 `PlanMosaic Desktop/CLI_UI_BRIDGE_DEFECT_REPORT.md` — 是否已转 spec 或仍孤立
  - [ ] SubTask D1.2.4: 排查 `screenshot.py` — 是否仍使用、是否需要保留
  - **验证**: 输出"应清理文件清单"

- [ ] Task D1.3: 项目根级文档检查
  - [ ] SubTask D1.3.1: 根目录是否有 `README.md` — 当前缺失
  - [ ] SubTask D1.3.2: 三个子项目各自是否有 `README.md`
  - [ ] SubTask D1.3.3: 是否有 `CHANGELOG.md` / `CONTRIBUTING.md` / `LICENSE` 信息完整度
  - **验证**: 列出缺失的关键文档

- [ ] Task D1.4: 目录与命名一致性
  - [ ] SubTask D1.4.1: Android 包名 `com.example.planmosaic_android` 是否需要改为正式包名
  - [ ] SubTask D1.4.2: 三端 `productName` / `appId` / `appid` 一致性
  - [ ] SubTask D1.4.3: 三端版本号同步
  - **验证**: 输出包名/版本/产品名对照表

---

## 🟦 D2. 依赖与供应链

- [ ] Task D2.1: Desktop 端 `package.json` 依赖审计
  - [ ] SubTask D2.1.1: `electron@33.4.11` 当前是否为最新稳定版，是否有已知 CVE
  - [ ] SubTask D2.1.2: `@supabase/supabase-js` 最新版与项目使用版本对比
  - [ ] SubTask D2.1.3: `electron-builder` 与 `electron-packager` 同时在 devDeps，是否冗余
  - [ ] SubTask D2.1.4: 是否存在 `package.json` 列出但未实际 `require` 的依赖
  - **验证**: 输出依赖健康度报告

- [ ] Task D2.2: Python 后端 `requirements.txt` 审计
  - [ ] SubTask D2.2.1: 是否锁定精确版本（`==` 而非 `>=`）
  - [ ] SubTask D2.2.2: 关键依赖（flask/fastapi/requests/openai 等）最新版是否存在 CVE
  - [ ] SubTask D2.2.3: 是否有未使用依赖
  - **验证**: 输出 requirements.txt 内容与建议

- [ ] Task D2.3: Android Gradle 依赖审计
  - [ ] SubTask D2.3.1: `gradle/libs.versions.toml` 是否所有依赖均声明版本目录
  - [ ] SubTask D2.3.2: Compose、Supabase Kotlin、OkHttp、Hilt、Navigation 等核心库最新稳定版
  - [ ] SubTask D2.3.3: `compileSdk` / `targetSdk` / `minSdk` 合理性
  - **验证**: 输出 Android 依赖健康度报告

- [ ] Task D2.4: Uni-app `manifest.json` 与依赖审计
  - [ ] SubTask D2.4.1: 30+ `uni_modules/` 来源（官方/第三方），是否有可疑第三方
  - [ ] SubTask D2.4.2: `manifest.json` 中 `appid` 是否符合 uni-app 规范（`__UNI__XXXXXXX`）
  - [ ] SubTask D2.4.3: 是否申请了不必要的原生权限
  - **验证**: 输出 uni-app 依赖健康度报告

---

## 🟦 D3. 构建与发布

- [ ] Task D3.1: Electron 构建配置审计
  - [ ] SubTask D3.1.1: `package.json#build.files` 是否覆盖所有运行时需要的文件
  - [ ] SubTask D3.1.2: `extraResources` 引用 `../backend` 的相对路径在打包后是否解析正确
  - [ ] SubTask D3.1.3: `win.target: portable` + `sign: null` 的发布信任链
  - [ ] SubTask D3.1.4: `productName` 与安装 artifact 命名一致性
  - **验证**: 模拟一次 `electron-builder --dir` 输出文件清单

- [ ] Task D3.2: Android 构建脚本审计
  - [ ] SubTask D3.2.1: `build_apk.bat` 内容是否合理（Gradle wrapper 调用、参数）
  - [ ] SubTask D3.2.2: `install_apk.bat` 是否硬编码了开发者路径
  - [ ] SubTask D3.2.3: `build_helper.bat` 用途与脚本内容
  - [ ] SubTask D3.2.4: `gradle.properties` 中的 `android.useAndroidX` 等关键开关
  - **验证**: 输出构建脚本审计表

- [ ] Task D3.3: Android 签名与混淆
  - [ ] SubTask D3.3.1: `app/build.gradle.kts` 是否有 `signingConfigs` / `buildTypes.release.signingConfig`
  - [ ] SubTask D3.3.2: `proguard-rules.pro` 是否覆盖 Supabase、OkHttp、Model 类
  - [ ] SubTask D3.3.3: `isMinifyEnabled` / `isShrinkResources` 是否启用
  - **验证**: 输出签名/混淆审计报告

- [ ] Task D3.4: Uni-app HBuilderX 配置
  - [ ] SubTask D3.4.1: `.hbuilderx/launch.json` 内容合理性
  - [ ] SubTask D3.4.2: HBuilderX 项目配置文件是否入库
  - **验证**: 列出 HBuilderX 相关产物

---

## 🟦 D4. 配置与密钥管理

- [ ] Task D4.1: Desktop 端配置管理审计
  - [ ] SubTask D4.1.1: `config.json` 字段 schema 与 `loadConfig` 的容错
  - [ ] SubTask D4.1.2: `settings.json` 字段定义
  - [ ] SubTask D4.1.3: `config.js`（cli 子模块）— CLI 是否读取同一份配置
  - **验证**: 输出配置 schema 表

- [ ] Task D4.2: API Key 在三端的流转路径
  - [ ] SubTask D4.2.1: Desktop 端: 输入 UI → IPC → 内存 → 配置文件 → 加密存储？`SaveConfig` 的处理
  - [ ] SubTask D4.2.2: Android 端: `DataStoreManager.kt` 加密策略 / `CryptoManager.kt` 实际使用
  - [ ] SubTask D4.2.3: Uni-app 端: `storage-keys.ts` 是否含 API Key 相关 key
  - **验证**: 画出三端 API Key 流转图

- [ ] Task D4.3: 占位符与硬编码
  - [ ] SubTask D4.3.1: `com.example.planmosaic_android` 等示例域名
  - [ ] SubTask D4.3.2: `https://api.example.com` 等占位 URL
  - [ ] SubTask D4.3.3: `TODO` / `FIXME` 注释遗留数
  - **验证**: 输出硬编码值清单

---

## 🟦 D5. 数据模型与持久化

- [ ] Task D5.1: 三端数据模型一致性
  - [ ] SubTask D5.1.1: Desktop `data.json` 顶层结构（`schedule/tasks/bigTasks/templates` 等）
  - [ ] SubTask D5.1.2: Android `Models.kt` 字段集
  - [ ] SubTask D5.1.3: Uni-app `store/schedule.ts` state 结构
  - **验证**: 输出三端数据模型对比表，标注字段差异

- [ ] Task D5.2: 账号隔离实现
  - [ ] SubTask D5.2.1: Desktop `paths.js` `setActiveUsername` 流程
  - [ ] SubTask D5.2.2: Android `FileSystemUserStorage.kt` / `IPreferencesStorage.kt` 隔离策略
  - [ ] SubTask D5.2.3: Uni-app 端是否有账号切换
  - **验证**: 列出三端账号隔离差异

- [ ] Task D5.3: Supabase 同步策略
  - [ ] SubTask D5.3.1: Desktop 端 `DataManager.js` / 内联逻辑上行哪些表
  - [ ] SubTask D5.3.2: Android `SupabaseClient.kt` 表结构与字段
  - [ ] SubTask D5.3.3: Uni-app 是否有 Supabase 集成
  - **验证**: 输出 Supabase 集成对照表

- [ ] Task D5.4: 词汇表数据（Android 专属）
  - [ ] SubTask D5.4.1: `assets/vocab/*.json` 文件内容抽样（college1-3 / medical）
  - [ ] SubTask D5.4.2: `VocabModels.kt` / `VocabRepository.kt` 数据访问模式
  - **验证**: 词汇模块结构图

---

## 🟦 D6. AI Agent 子系统

- [ ] Task D6.1: 三端工具定义对齐
  - [ ] SubTask D6.1.1: Desktop `ai-tools.js` 工具列表
  - [ ] SubTask D6.1.2: Python `tool_executor.py` + `tools.py` 工具实现
  - [ ] SubTask D6.1.3: Android `ToolDefinitions.kt` 工具列表
  - **验证**: 输出三端工具对照表，标注缺失/不一致

- [ ] Task D6.2: 工具执行器实现质量
  - [ ] SubTask D6.2.1: Python 端事务性写入（上次 spec 已修，验证是否仍生效）
  - [ ] SubTask D6.2.2: Android `ToolExecutors.kt` 错误处理
  - [ ] SubTask D6.2.3: Desktop `ai-tools.js`（浏览器端工具）实现
  - **验证**: 工具调用失败时三端行为对比

- [ ] Task D6.3: 提案审批流程
  - [ ] SubTask D6.3.1: Desktop `ai-agent.js` 提案渲染与按钮逻辑
  - [ ] SubTask D6.3.2: Android `MosaScreen.kt` / `ChatSession.kt` 提案 UI
  - **验证**: 提案流程两端差异

- [ ] Task D6.4: 深度规划模式
  - [ ] SubTask D6.4.1: Desktop `ai-agent.js#openDeepPlanningModal`（上次审计标记 P-A2a 未修复）
  - [ ] SubTask D6.4.2: Android `DeepPlanningSession.kt` 实现
  - **验证**: 深度规划功能两端覆盖度

- [ ] Task D6.5: 上下文管理
  - [ ] SubTask D6.5.1: Desktop `conversationHistory` 长度截断策略
  - [ ] SubTask D6.5.2: Android `MosaViewModel.kt` 的 history 上限
  - [ ] SubTask D6.5.3: token 估算与超限处理
  - **验证**: 上下文截断阈值对比

---

## 🟦 D7. UI 渲染与可访问性

- [ ] Task D7.1: Android Compose UI 审计
  - [ ] SubTask D7.1.1: `ui/screens/` 4 个 screen 完整性
  - [ ] SubTask D7.1.2: `ui/components/` 复用组件（AgentFAB / AgentSheetContent / ThinkingChain 等）
  - [ ] SubTask D7.1.3: `ui/theme/` Color / Type / Theme 是否定义完整
  - **验证**: Compose 组件树与复用度

- [ ] Task D7.2: Uni-app 页面审计
  - [ ] SubTask D7.2.1: 4 个 `.vue` 页面是否完整可运行
  - [ ] SubTask D7.2.2: 是否有未实现的占位/空函数
  - [ ] SubTask D7.2.3: 自定义图标 `customicons.ttf` 是否完整
  - **验证**: Vue 页面功能完成度

- [ ] Task D7.3: 主题与暗色模式
  - [ ] SubTask D7.3.1: Desktop `index.html` 主题切换逻辑
  - [ ] SubTask D7.3.2: Android `theme/Theme.kt` + `profile/common/DarkModeSettingRow.kt`
  - [ ] SubTask D7.3.3: Uni-app 是否有主题切换
  - **验证**: 三端主题一致性

- [ ] Task D7.4: 可访问性
  - [ ] SubTask D7.4.1: Desktop 端键盘导航 / 焦点陷阱（上次 spec 标记 P-B1c 未修）
  - [ ] SubTask D7.4.2: Android 端 `contentDescription` 完整度
  - [ ] SubTask D7.4.3: 三端 `aria-label` / semantic 标注
  - **验证]: 可访问性审计表

---

## 🟦 D8. 错误处理与日志

- [ ] Task D8.1: Desktop 端错误处理一致性
  - [ ] SubTask D8.1.1: 静默 `catch {}` 数量（上次 spec 标记 16 处）
  - [ ] SubTask D8.1.2: 日志中是否含敏感信息（API Key、stack trace、文件路径）
  - **验证**: catch 块统计与日志脱敏审计

- [ ] Task D8.2: Python 端错误处理
  - [ ] SubTask D8.2.1: 异常捕获后是否回滚内存状态
  - [ ] SubTask D8.2.2: 错误响应是否脱敏（上次 spec L5）
  - **验证**: Python 异常路径审计

- [ ] Task D8.3: Android 端错误处理
  - [ ] SubTask D8.3.1: `runCatching` / `try-catch` 完整度
  - [ ] SubTask D8.3.2: 网络层（`AiApiClient.kt` / `SupabaseClient.kt`）错误处理
  - [ ] SubTask D8.3.3: 协程异常传播
  - **验证**: Android 错误处理审计表

- [ ] Task D8.4: Uni-app 错误处理
  - [ ] SubTask D8.4.1: `try-catch` 完整度
  - [ ] SubTask D8.4.2: 异步 API 错误回调处理
  - **验证**: Uni-app 错误处理审计表

---

## 🟦 D9. 网络与 API

- [ ] Task D9.1: Desktop 端网络层
  - [ ] SubTask D9.1.1: `main.js` `http.request` 是否全部 `rejectUnauthorized: true`（上次 spec C3 已修，验证）
  - [ ] SubTask D9.1.2: SSE 流式连接清理（`agent-chat-stream` handler）
  - [ ] SubTask D9.1.3: API 端点白名单（`shell.openExternal` 上次 spec H5）
  - **验证**: 网络配置审计

- [ ] Task D9.2: Android 端网络层
  - [ ] SubTask D9.2.1: OkHttp 客户端证书校验、拦截器
  - [ ] SubTask D9.2.2: `AiApiClient.kt` 端点、超时、限流重试
  - [ ] SubTask D9.2.3: `SupabaseClient.kt` 鉴权、token 刷新
  - **验证**: Android 网络配置审计

- [ ] Task D9.3: Uni-app 端网络
  - [ ] SubTask D9.3.1: `uni.request` 端点、错误处理
  - [ ] SubTask D9.3.2: 是否有原生网络插件
  - **验证**: Uni-app 网络配置审计

---

## 🟦 D10. 性能与资源

- [ ] Task D10.1: Desktop 端性能
  - [ ] SubTask D10.1.1: 日历/词汇表大列表渲染效率
  - [ ] SubTask D10.1.2: 流式渲染 O(n²)（上次 spec P-C2a 已标记）
  - [ ] SubTask D10.1.3: `index.html` 单文件 10000+ 行 拆分可行性
  - **验证**: 性能热点清单

- [ ] Task D10.2: Android 端性能
  - [ ] SubTask D10.2.1: Compose 重组优化
  - [ ] SubTask D10.2.2: 词汇量大数据列表（`LazyColumn` key 稳定性）
  - [ ] SubTask D10.2.3: 图片加载与缓存
  - **验证**: Android 性能热点

- [ ] Task D10.3: Uni-app 端性能
  - [ ] SubTask D10.3.1: 多页面切换性能
  - [ ] SubTask D10.3.2: uni-app 编译模式（VUE3 / uni-app x）
  - **验证**: Uni-app 性能清单

- [ ] Task D10.4: 内存管理（三端共审）
  - [ ] SubTask D10.4.1: Desktop 监听器/定时器泄漏（上次 spec 多项已修）
  - [ ] SubTask D10.4.2: Android Bitmap / Canvas / Coroutine 释放
  - [ ] SubTask D10.4.3: Uni-app 页面栈、storage 清理
  - **验证**: 内存管理审计表

---

## 🟦 D11. 测试与质量保障

- [ ] Task D11.1: Desktop 端测试覆盖
  - [ ] SubTask D11.1.1: `test/cases/*.js` 9 个 case 覆盖范围
  - [ ] SubTask D11.1.2: `test/harness.js` / `runner.js` 是否完整
  - [ ] SubTask D11.1.3: CLI 是否有单元测试
  - **验证**: 测试覆盖矩阵

- [ ] Task D11.2: Android 端测试
  - [ ] SubTask D11.2.1: `app/src/test/java` 是否仅有 `ExampleUnitTest.kt` 占位
  - [ ] SubTask D11.2.2: `app/src/androidTest/java` 是否仅有 `ExampleInstrumentedTest.kt` 占位
  - [ ] SubTask D11.2.3: Repository / ViewModel 是否有测试
  - **验证**: Android 测试覆盖

- [ ] Task D11.3: Uni-app 端测试
  - [ ] SubTask D11.3.1: 是否有任何测试文件
  - **验证**: Uni-app 测试现状

---

## 🟦 D12. 文档与可维护性

- [ ] Task D12.1: 项目级 README
  - [ ] SubTask D12.1.1: 根 README 缺失
  - [ ] SubTask D12.1.2: 三端各自 README 缺失
  - [ ] SubTask D12.1.3: 是否需要 ARCHITECTURE.md / FEATURE_PARITY.md
  - **验证**: 文档缺口清单

- [ ] Task D12.2: 代码内文档
  - [ ] SubTask D12.2.1: 关键函数是否有 JSDoc / KDoc / TSDoc
  - [ ] SubTask D12.2.2: 复杂业务逻辑是否有注释
  - [ ] SubTask D12.2.3: `TODO` / `FIXME` / `XXX` 数量与分布
  - **验证**: 代码内文档统计

- [ ] Task D12.3: 三端功能对照文档
  - [ ] SubTask D12.3.1: 是否有 feature parity 文档
  - [ ] SubTask D12.3.2: 已知差异是否在 README 中说明
  - **验证**: 功能对照表

---

## 🟦 D13. 历史 spec 修复真实性验证（交叉验证）

- [ ] Task D13.1: `comprehensive-code-fix` 修复验证
  - [ ] SubTask D13.1.1: `index.html` 中存在 CSP `<meta>` 标签
  - [ ] SubTask D13.1.2: `main.js` 中无 API Key `substring(0,10)` 日志
  - [ ] SubTask D13.1.3: `main.js` 中 `rejectUnauthorized: true` 硬编码
  - [ ] SubTask D13.1.4: `paths.js` 中 `setActiveUsername` 过滤 `..` `/` `\`
  - [ ] SubTask D13.1.5: `preload.js` 中 `onAgentStreamChunk` 回调不再含 `event` 对象
  - [ ] SubTask D13.1.6: `preload.js` 中 `removeListener` 有 channel 白名单
  - [ ] SubTask D13.1.7: Electron 版本号 ≥ 33（已确认 `33.4.11`）

- [ ] Task D13.2: `deep-quality-audit` 修复验证
  - [ ] SubTask D13.2.1: `main.js` `pythonApi()` 中存在 `timeout: 30000`
  - [ ] SubTask D13.2.2: `server.py` `_write_schedule_data` 使用 `os.replace`
  - [ ] SubTask D13.2.3: `preload.js` `getApiKeys` 返回 `{configured: boolean}` 结构
  - [ ] SubTask D13.2.4: `ai-agent.js` 消息写入无重复
  - [ ] SubTask D13.2.5: `paths.js` `cleanOldBackups` 含 `MAX_SIZE` 检查
  - [ ] SubTask D13.2.6: 切换账号清空缓存逻辑

- [ ] Task D13.3: `ux-interaction-audit` 修复验证
  - [ ] SubTask D13.3.1: 提案按钮点击后禁用
  - [ ] SubTask D13.3.2: `saveSchedule` 等操作有 loading 状态
  - [ ] SubTask D13.3.3: 模态框支持 Escape / 遮罩关闭
  - [ ] SubTask D13.3.4: 关键 `catch` 不再为空
  - [ ] SubTask D13.3.5: `requestSingleInstanceLock` 启用

- [ ] Task D13.4: `electron-security-audit` 修复验证
  - [ ] SubTask D13.4.1: 之前 spec 标记为"未执行"，本轮检查其声明的 11 个任务是否仍未落地
  - **验证**: 输出一份"已修复 / 未修复 / 已退化"对照表

---

# Task Dependencies

- D1–D12 各维度审计可全部**并行执行**（审阅任务，无文件依赖）
- D13（交叉验证）建议在 D1–D12 完成后进行，但也可独立执行
- 整份审阅报告汇总在 spec.md 的"问题清单"小节
- 审阅完成后另开修复 spec，不在本 spec 范围内
