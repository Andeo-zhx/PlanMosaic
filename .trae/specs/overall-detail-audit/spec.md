# 整体细节审阅 Spec

## Why

项目已经历 6+ 轮专项审计（`code-vulnerability-audit`/`v2`、`comprehensive-code-fix`、`deep-quality-audit`、`scenario-driven-usage-audit`/`v2`、`ux-interaction-audit`、`electron-security-audit`），重点集中在 **Electron 桌面端 + Python 后端** 的安全 / 质量 / 交互维度。但仍有以下盲区未被系统排查：

1. **Android Kotlin 端** 从未审计 — `PlanMosaic AndroidStudio/` 包含 30+ Kotlin 文件，但所有历史 spec 都不涉及
2. **Uni-app 端** 从未审计 — `PlanMosaic Uni-app/` 包含 4 个页面 + 完整 uni_modules 套件
3. **跨端一致性** — 三端数据模型、API Key 管理、对话历史持久化、Supabase 集成是否对齐
4. **CLI 子系统** — `PlanMosaic Desktop/cli/` 12 个模块未单独审计
5. **测试覆盖** — `PlanMosaic Desktop/test/` 9 个 case 是否覆盖关键路径
6. **构建/打包/分发** — `package.json`、Gradle 配置、`build_apk.bat` 等脚本的安全性
7. **项目根级卫生** — `.gitignore`、根目录散落文件（`planmosaic-export.csv`、调试视频、README 缺失等）
8. **依赖卫生** — 锁文件一致性、未使用依赖、过期包

本 spec 以"从细节出发"为原则，对项目整体进行最后一轮系统审阅，覆盖之前审计未触及的角落，并交叉验证前几轮修复是否真正落地。

## What Changes

本 spec **不直接修改代码**。本 spec 是一次系统审阅任务，产出物为：

- **审阅报告** — 一份按维度组织的"问题清单"，标注严重度、影响面、可复现性
- **修复建议** — 对每个问题给出最小代价的修复方向
- **交叉验证** — 抽查前几轮 spec 的修复是否在当前代码中真实存在

审阅完成后，由用户决定是否进入"修复阶段"另开 spec。

---

## 审阅范围（Scope）

### R1. PlanMosaic Desktop（Electron + Python）
- `main.js` / `preload.js` / `paths.js` / `ai-agent.js` / `ai-tools.js` / `index.html` / `package.json`
- `backend/server.py` / `tool_executor.py` / `tools.py` / `config.py` / `paths.py` / `cli.py` / `requirements.txt`
- `cli/*.js`（12 个子模块）
- `test/cases/*.js`（9 个测试用例）
- `调试文件/`（杂项）

### R2. PlanMosaic AndroidStudio（Kotlin）
- `app/src/main/AndroidManifest.xml`
- `app/build.gradle.kts` / `build.gradle.kts` / `settings.gradle.kts` / `gradle.properties`
- `app/src/main/java/com/example/planmosaic_android/` 全树
  - model / storage / util / data / ui（components + screens）
  - 重点：`util/AgentTools.kt`、`util/agent/ToolDefinitions.kt`、`util/agent/ToolExecutors.kt`
- `app/src/main/assets/vocab/*.json`
- `app/src/main/res/`

### R3. PlanMosaic Uni-app（Vue 3 + uni-app）
- `App.vue` / `main.js` / `pages.json` / `manifest.json` / `uni.scss`
- `pages/mosa/mosa.vue` / `pages/schedule/schedule.vue` / `pages/timetable/timetable.vue` / `pages/profile/profile.vue`
- `store/schedule.ts` / `constants/storage-keys.ts`
- `uni_modules/`（30+ 第三方组件，不深入审阅，仅核对引用合规性）

### R4. 根目录与跨项目
- `.gitignore` / `LICENSE`（项目根）
- `PlanMosaic Desktop/planmosaic-export.csv`（散落在仓库的导出文件）
- 三个 `项目目录` 间的命名/结构一致性

---

## 审阅维度（Dimensions）

### D1. 项目结构与卫生
- 包名、目录命名是否合规
- 散落文件、调试文件、临时文件清理
- `.gitignore` 完整度（是否覆盖 `release/`、`__pycache__/`、`build/`、`.gradle/`、uni-app 编译产物等）
- README / 文档缺失

### D2. 依赖与供应链
- `package.json` 锁文件一致性
- 后端 `requirements.txt` 版本锁定情况
- Android Gradle 依赖版本合理性
- uni-app 第三方组件来源合规性
- 已知 CVE 抽查（electron / okhttp / androidx 等）

### D3. 构建与发布
- `electron-builder` 配置（白名单文件、签名、便携式 artifact 命名）
- Gradle 构建配置（`signingConfig`、`minSdk`/`targetSdk`、`proguard`）
- `build_apk.bat` / `install_apk.bat` / `build_helper.bat` 脚本内容
- HBuilderX `launch.json` 配置

### D4. 配置与密钥管理
- `config.json` 字段 schema 与校验
- API Key 流转路径（UI → IPC → 持久化 → 云同步）
- 默认值、占位符（如 `com.example.planmosaic_android`）
- 环境变量与硬编码常量

### D5. 数据模型与持久化
- `data.json` / `agent-log.json` 字段在三端是否一致
- 账号隔离（`paths.js` 已实现，Android `FileSystemUserStorage.kt` / `DataStorePreferencesStorage.kt` 实现是否对齐）
- Supabase 同步策略（哪些数据上行、密钥是否带上去）
- localStorage / DataStore / 文件存储 三套实现的语义对齐

### D6. AI Agent 子系统
- 工具定义（`ai-tools.js` / `ToolDefinitions.kt`）三端是否一致
- 工具执行器（`tool_executor.py` / `ToolExecutors.kt` / `ai-tools.js`）的原子性、错误处理、回滚
- 提案/审批流程实现
- 深度规划（Deep Planning）模式
- 上下文管理（conversationHistory 截断、token 限制）

### D7. UI 渲染与可访问性
- Compose（Android）/ Vue 3（uni-app）/ 传统 DOM（Desktop）三端的渲染策略
- 主题/暗色模式支持
- 字体、间距、国际化（i18n）支持
- 焦点管理、键盘导航

### D8. 错误处理与日志
- 异常捕获策略（吞 vs 报 vs 重试）
- 日志输出位置、格式、脱敏
- 崩溃上报 / 错误回放
- 网络超时、磁盘满、磁盘权限三类典型故障路径

### D9. 网络与 API
- HTTPS 强制、证书校验
- API 端点白名单
- 流式（SSE）连接的保活、断开、错误恢复
- 跨端 API Key 同步（云端）安全

### D10. 性能与资源
- 大数据量渲染（年视图、词汇量列表）
- 图片压缩、缓存、Bitmap / Canvas 释放
- 内存泄漏（监听器、定时器、协程、Flow）

### D11. 测试与质量保障
- `test/cases/*.js` 覆盖度
- 是否有 Android 单元测试、UI 测试
- 是否有 E2E 测试

### D12. 文档与可维护性
- 是否有项目级 README
- 关键流程是否在代码中有注释说明
- 三端 feature parity 是否有文档描述

---

## 审阅方法

每个维度的子任务按以下流程执行：

1. **盘查（Inventory）** — 列出该维度下涉及的所有文件 / 函数 / 配置项
2. **逐项检查（Line-by-line）** — 定位可疑点（异常吞、错误处理、并发、密钥、超时、限流、边界值）
3. **交叉验证（Cross-check）** — 抽查前几轮 spec 修复的真实性
4. **记录（Document）** — 写入本 spec 的"问题清单"小节，附严重度 + 复现步骤 + 建议修复

---

## Impact

- **不直接修改任何代码**（这是审阅 spec）
- 审阅报告将影响：
  - 后续可能产生的"修复 spec"
  - 跨端一致性的重构 spec
  - 测试覆盖补全 spec

---

## 已知待验证项（审阅启动前预判）

以下是基于前几轮 spec + 当前文件结构快速浏览后预判的可能问题，仅作为审阅起点，**不构成结论**：

### Desktop 端
- `electron-builder` 配置中 `sign: null` — 未签名直接发布存在信任链问题
- `electron-builder.files` 是否覆盖 `cli/` 全部子模块？还是 CLI 入口 `cli.js` 引用的子模块会被遗漏
- `package.json` 引用 `../backend` 作为 `extraResources` — 路径相对 `app/` 目录的解析是否在打包后仍正确
- `index.html` 单文件 ~10462 行 — 上次审计已标记 L4，本轮需评估拆分可行性
- `preload.js` 虽修复了 `event` 泄露，但 `removeAllAgentListeners` 只移除 3 个 channel，`onAgentStreamError` 不在其中 — 上一轮 spec 漏掉了它

### Android 端
- 包名 `com.example.planmosaic_android` — 仍是 Google 模板名，发布到 Google Play 会立即被拒
- `MainActivity.kt` 与 `PlanMosaicApplication.kt` 是否包含被 `comprehensive-code-fix` 同类问题（如 API Key 日志泄露、innerHTML 等同类的 setText XSS）
- `app/build.gradle.kts` 是否启用 `minifyEnabled` / `shrinkResources`
- `proguard-rules.pro` 是否足够保护 Supabase URL、AuthManager 等敏感类
- `util/agent/ToolDefinitions.kt` 工具列表与 `ai-tools.js` / `tool_executor.py` 是否完全一致
- `data/remote/SupabaseClient.kt` 与 `data/remote/AiApiClient.kt` 的 API Key 传递方式
- `BuildConfig` 是否注入了 API Key（不推荐做法）
- `vocab/college1-3.json` / `medical.json` — 是否包含敏感词或版权内容

### Uni-app 端
- 4 个页面是否完整，是否有占位/未实现功能
- `store/schedule.ts` 是否包含与 Desktop 等价的 IPC 调用或本地存储
- `pages.json` 路由、tabBar 是否合理
- `manifest.json` 中的 `appid` / `appname` / 权限配置
- 是否调用了原生插件，权限是否过度申请

### 跨端
- Android 与 Desktop 的"数据迁移" / "账号登录" 流程是否打通
- uni-app 是否同步了同一份对话历史
- Supabase 数据表 schema 是否在三端一致

### 项目根级
- 根目录无 `README.md` — 缺少项目总体说明
- `planmosaic-export.csv` 散落在仓库 — 不应入库
- `PlanMosaic Desktop/调试文件/` 含 `QQ20260521-115216.mp4` 调试录屏 — 不应入库
- `PlanMosaic Desktop/CLI_UI_BRIDGE_DEFECT_REPORT.md` — 是否已转化为正式 spec 还是孤立文档
- 三个项目根目录的 `.gitignore` 是否各自合理
- `LICENSE` 文件存在但根目录无版权/作者信息

---

## ADDED Requirements

### Requirement R-1: 审阅报告 MUST 按维度组织
审阅报告必须按 D1–D12 维度分组呈现，每条问题标注：
- 严重度（🔴 紧急 / 🟠 高 / 🟡 中 / 🟢 低 / ℹ️ 建议）
- 涉及文件 + 行号
- 复现步骤
- 最小修复方向

### Requirement R-2: 审阅 MUST 验证前几轮修复
对以下已声明完成的修复，在当前代码中**实际查找**确认存在：
- [ ] `comprehensive-code-fix` 的 CSP `<meta>` 在 `index.html` 中存在
- [ ] `deep-quality-audit` 的 `timeout: 30000` 在 `main.js` 中存在
- [ ] `deep-quality-audit` 的 `os.replace()` 原子写入在 `server.py` 中存在
- [ ] `deep-quality-audit` 的 `getApiKeys` 修复在 `preload.js` 中存在
- [ ] `ux-interaction-audit` 的 toast 替换 alert 是否到位
- [ ] `electron-security-audit` 的 `requestSingleInstanceLock`（如已修复）

### Requirement R-3: 审阅 MUST 覆盖三大端
审阅必须包含：
- 至少 10 处 Android 端具体问题定位
- 至少 5 处 Uni-app 端具体问题定位
- 至少 20 处 Desktop 端具体问题定位
- 至少 5 处跨端一致性问题
- 至少 5 处项目根级/构建/依赖问题

### Requirement R-4: 审阅报告 MUST 区分"已修复"和"未修复"
对每条历史 spec 中的任务，标注其在当前代码中的实际状态（已落地 / 部分落地 / 未落地 / 已退化）。

### Requirement R-5: 不在 spec 阶段直接修改代码
本 spec 是审阅任务，**不进行任何代码变更**。所有发现汇总至 `spec.md` 的"问题清单"小节。
