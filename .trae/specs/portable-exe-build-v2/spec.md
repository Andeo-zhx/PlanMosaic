# 桌面端单文件便携 exe 打包规格

## Why
用户希望把 PlanMosaic 桌面端打包成「单个 .exe 便携程序」，下载后双击即可运行，无需安装、解压或附带其他依赖文件。

上一份 `portable-exe-repackage` 规范的勾选状态与实际产物不一致：任务清单全部标记完成，但 `planmosaic desktop/release/` 目录里实际只有 `win-unpacked/` 解包目录与构建日志，并不存在 `PlanMosaic1.1.0-Portable.exe` 这个最终交付物。本次规范重新聚焦在「真正产出可用的单文件便携 exe」上。

## What Changes
- 使用 `electron-builder` 的 `portable` 目标（NSIS 之外的单 exe 模式）输出单个可执行文件
- 输出文件名固定为 `PlanMosaic${version}-Portable.exe`
- 确保桌面端运行所需的所有资源（`main.js`、`preload.js`、`ai-*.js`、`backend/`、`Image/`、`favicon.ico` 等）随 exe 一起分发
- 保留多账户数据隔离（数据写到 `%APPDATA%\PlanMosaic\{userHash}\`）
- 确保打包产物不携带任何硬编码的 API Key
- **BREAKING**：交付物由「目录 + 多个 dll」改为「单个 .exe 文件」

## Impact
- Affected specs：桌面端打包与发布流程
- Affected code：
  - `planmosaic desktop/package.json`（`build.win.target`、`build.portable`、`build.files`、`build.extraResources`）
  - `planmosaic desktop/main.js`（打包后启动路径、用户数据目录）
  - `planmosaic desktop/paths.js`（`%APPDATA%` 数据目录、首次清理逻辑）

## ADDED Requirements

### Requirement: 单文件便携 exe 产物
系统 SHALL 产出唯一可执行文件 `PlanMosaic1.1.0-Portable.exe`，用户双击即可启动应用，无需安装步骤或附带 dll/资源目录。

#### Scenario: 用户下载并运行
- **WHEN** 用户从 `planmosaic desktop/release/` 取走 `PlanMosaic1.1.0-Portable.exe`
- **THEN** 双击后桌面端主窗口正常弹出
- **AND** 该 exe 是 release 目录中唯一需要分发的文件

### Requirement: 资源完整随包
系统 SHALL 把桌面端运行所必需的所有代码与静态资源打进单个 exe，包括但不限于：
- 主进程 / 预加载脚本（`main.js`、`preload.js`、`paths.js`、`ai-agent.js`、`ai-tools.js`）
- 前端入口（`index.html`、`favicon.ico`、`Image/**`）
- Python 后端（`backend/**`）

#### Scenario: 离线 / 隔离环境运行
- **WHEN** 用户在没有源码、只携带 exe 的机器上运行
- **THEN** 应用不报「找不到模块 / 找不到资源」

### Requirement: 多账户数据隔离
系统 SHALL 沿用 `%APPDATA%\PlanMosaic\{userHash}\` 目录结构，确保不同账户的数据相互隔离。

#### Scenario: 多账户切换
- **WHEN** 用户 A 和用户 B 先后登录
- **THEN** 用户 A 的数据保存在自己的 hash 子目录
- **AND** 用户 B 的数据保存在不同的 hash 子目录

### Requirement: API Key 不随包泄露
系统 SHALL 确保打包后的产物不包含任何大模型 API Key。

#### Scenario: 产物检查
- **WHEN** 打包完成
- **THEN** 在 `release/` 产物中搜索常见 Key 前缀均无命中
- **AND** 用户首次启动需要自行配置 API Key

### Requirement: 图标与版本号
系统 SHALL 使用 `favicon.ico` 作为 exe 图标，版本号与 `package.json` 中保持一致（当前 `1.1.0`）。

#### Scenario: 查看产物
- **WHEN** 用户在文件管理器中查看产物
- **THEN** exe 显示 favicon.ico 图标
- **AND** exe 文件名包含 `1.1.0`

## MODIFIED Requirements

### Requirement: 打包目标
原有 `build.win.target` 实际为 NSIS（产出 `win-unpacked/` 目录与多个 dll），需修正为 `portable`，并显式声明 `build.portable.artifactName`。

**修改内容**：
- `package.json` → `build.win.target`：`nsis` → `portable`
- `package.json` → `build.portable.artifactName`：`PlanMosaic${version}-Portable.exe`
- `package.json` → `build.files`：确保 `backend/**`、`Image/**` 不会被默认过滤规则剔除

## REMOVED Requirements

### Requirement: 旧 NSIS 多文件目录
**Reason**：旧的 `nsis` 目标会输出多文件目录与若干 dll，不再符合「单文件便携 exe」需求。
**Migration**：使用 `portable` 目标重新构建；旧的 `win-unpacked/` 目录在构建前清理。
