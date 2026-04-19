# PlanMosaic 便携版重新打包规格

## Why
当前release中的portable exe打包结果不满足用户需求，存在以下问题：
1. 打包结果是包含多个文件的目录，而非单个可执行文件
2. 用户希望点开即用，无需其他文件
3. 需要确保不保留大模型的API Key
4. 需要优化运行和启动速度
5. 需要确保exe图标正确显示
6. 需要确保WordMosaic等子应用正常可用

## What Changes
- 修改electron-builder配置，使用NSIS打包为单个便携式exe文件
- 输出文件名改为 `PlanMosaic1.1.0-Portable.exe`
- 确保打包时不包含用户的API Key配置
- 优化应用启动速度和运行性能
- 确保exe图标使用favicon.ico
- 确保WordMosaic子应用资源正确打包
- **BREAKING**: 打包格式从zip目录变为单个NSIS便携式exe

## Impact
- Affected specs: 打包配置、应用启动流程、子应用资源
- Affected code: package.json (build配置)、main.js (启动优化)

## ADDED Requirements

### Requirement: 单文件便携式打包
系统 SHALL 将应用打包为单个便携式exe文件，用户无需安装即可运行。

#### Scenario: 用户下载并运行
- **WHEN** 用户下载 `PlanMosaic1.1.0-Portable.exe`
- **THEN** 双击该文件即可直接运行应用，无需解压或安装

### Requirement: 多账户数据隔离
系统 SHALL 确保不同账户的数据存储在独立的文件夹中。

#### Scenario: 不同用户登录
- **WHEN** 用户A和用户B分别登录应用
- **THEN** 用户A的数据存储在 `%APPDATA%\PlanMosaic\用户A\`
- **AND** 用户B的数据存储在 `%APPDATA%\PlanMosaic\用户B\`

### Requirement: API Key 安全
系统 SHALL 确保打包后的应用不包含任何大模型API Key。

#### Scenario: 打包后检查
- **WHEN** 打包完成后
- **THEN** 应用内不包含任何硬编码的API Key
- **AND** 用户需要自行配置API Key

### Requirement: 启动速度优化
系统 SHALL 优化应用启动速度，减少用户等待时间。

#### Scenario: 应用启动
- **WHEN** 用户启动应用
- **THEN** 应用应在合理时间内显示主界面
- **AND** 非必要模块应延迟加载

### Requirement: 应用图标
系统 SHALL 使用favicon.ico作为打包后exe文件的图标。

#### Scenario: 查看exe图标
- **WHEN** 用户在文件管理器中查看打包后的exe文件
- **THEN** exe文件显示favicon.ico图标

### Requirement: WordMosaic子应用可用
系统 SHALL 确保WordMosaic子应用在打包后正常运行。

#### Scenario: 使用WordMosaic功能
- **WHEN** 用户在应用中访问WordMosaic功能
- **THEN** WordMosaic界面正常加载
- **AND** 词书数据正常加载
- **AND** AI对话功能正常工作

## MODIFIED Requirements

### Requirement: 打包配置
原有打包配置生成zip目录，现修改为生成单个NSIS便携式exe。

**修改内容**:
- `package.json` 中的 `build.win.target` 从 `zip` 改为 `nsis`
- 配置NSIS为便携式模式（one-click: false, perMachine: false）
- 设置 `artifactName` 为 `PlanMosaic1.1.0-Portable.exe`
- 确保WordMosaic资源正确打包到extraResources

## REMOVED Requirements

### Requirement: 无
本次修改不删除任何现有功能。
