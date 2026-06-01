# 项目文件整理 Spec

## Why
当前项目根目录混杂了桌面端（Electron）源码文件、Android 构建脚本、图片资源等多类文件，结构混乱，不利于维护和导航。

## What Changes
- 新建 `PlanMosaic Desktop/` 文件夹，将 Electron 桌面应用的所有源码和资源移入
- 将 Android 相关的 `.bat` 构建脚本移入 `PlanMosaic AndroidStudio/`
- 修复 `image4.ico` 与 `favicon.ico` 的不一致问题（统一为 `favicon.ico`）
- 在项目根目录创建 `启动PlanMosaic.bat` 快捷脚本
- 调整移动后程序内部的引用路径

## Impact
- Affected specs: 无（纯文件整理，不改变功能逻辑）
- Affected code: `main.js`, `package.json`, `index.html`, `build_apk.bat`, `install_apk.bat`

## ADDED Requirements

### Requirement: 桌面端文件归入独立文件夹
桌面应用（Electron）相关的所有源码、配置、资源文件 SHALL 统一存放在 `PlanMosaic Desktop/` 文件夹中。

#### Scenario: 桌面端文件集中管理
- **WHEN** 开发者查看项目根目录
- **THEN** 根目录仅保留 `LICENSE`、`.gitignore`、快捷脚本和子项目文件夹

### Requirement: Android 脚本归入 Android 项目文件夹
Android 构建和安装脚本 (`build_apk.bat`, `install_apk.bat`) SHALL 移入 `PlanMosaic AndroidStudio/` 文件夹。

#### Scenario: Android 脚本与 Android 项目同目录
- **WHEN** 开发者在 AndroidStudio 目录执行 Android 相关操作
- **THEN** 可直接运行目录内的 bat 脚本完成构建和安装

### Requirement: 根目录 bat 快捷启动
项目根目录 SHALL 提供一个 `启动PlanMosaic.bat` 脚本，可直接启动桌面应用。

#### Scenario: 一键启动桌面应用
- **WHEN** 用户双击运行根目录的 `启动PlanMosaic.bat`
- **THEN** 自动进入 `PlanMosaic Desktop/` 目录并执行 `npm start` 启动 Electron 应用

### Requirement: 图标文件统一命名
桌面应用的图标文件 SHALL 统一命名为 `favicon.ico`，并存在于 `PlanMosaic Desktop/` 目录下。

#### Scenario: 应用图标正确显示
- **WHEN** Electron 应用启动或打包
- **THEN** `main.js` 和 `package.json` 中引用的 `favicon.ico` 文件确实存在

## MODIFIED Requirements

### Requirement: build_apk.bat 路径调整
`build_apk.bat` 移入 `PlanMosaic AndroidStudio/` 后，其内部 `cd /d` 命令 SHALL 指向正确的项目根目录。

#### Scenario: 从 AndroidStudio 目录正确构建
- **WHEN** 在 `PlanMosaic AndroidStudio/` 下运行 `build_apk.bat`
- **THEN** `cd /d "%~dp0"` 定位到 AndroidStudio 目录本身，正常执行 gradlew 构建

### Requirement: install_apk.bat 路径调整
`install_apk.bat` 移入 `PlanMosaic AndroidStudio/` 后，其 APK 相对路径 SHALL 保持不变，直接可用。

#### Scenario: 从 AndroidStudio 目录正确安装
- **WHEN** 在 `PlanMosaic AndroidStudio/` 下运行 `install_apk.bat`
- **THEN** 能正确定位 `app\build\outputs\apk\release\app-release.apk` 并安装到设备