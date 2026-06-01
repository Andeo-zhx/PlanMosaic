# 根目录二次清理 Spec

## Why
上一轮 `organize-project-files` 完成后，项目根目录又积累了调试脚本、临时文件和调试文件夹等杂物，影响项目整洁度。

## What Changes
- 删除根目录下所有无引用的 Python 调试/修复脚本（~23 个文件）
- 删除根目录下的 `test_results.txt` 临时输出文件
- 将 `调试文件/` 文件夹移入 `PlanMosaic Desktop/` 目录下
- **明确保留** `backend/` 目录于根目录（Desktop 应用运行时依赖 `python -m backend.server`，cwd 指向根目录）

## Impact
- Affected specs: organize-project-files（延续上一轮整理）
- Affected code: 无功能代码受影响，仅删除/移动无引用文件

## ADDED Requirements

### Requirement: 清理根目录无引用调试脚本
项目根目录 SHALL 不包含无引用的 Python 调试/修复脚本文件。

#### Scenario: 根目录干净整洁
- **WHEN** 开发者查看项目根目录
- **THEN** 根目录仅包含 `.gitignore`、`LICENSE`、`启动PlanMosaic.bat`、`backend/`、`Used/` 及三个子项目文件夹，不包含任何 `.py` 调试脚本

### Requirement: 调试文件归入 Desktop 项目目录
`调试文件/` 文件夹及其内容 SHALL 移入 `PlanMosaic Desktop/` 目录下。

#### Scenario: 调试文件集中管理
- **WHEN** 开发者查看 `PlanMosaic Desktop/调试文件/`
- **THEN** 可以看到原有的 `image.png` 和 `QQ20260521-115216.mp4`

### Requirement: 保留 backend 目录位置
`backend/` 目录 SHALL 保留在项目根目录，不得移动。

#### Scenario: Python 后端正常运行
- **WHEN** Electron 应用通过 `main.js` 启动 Python 后端
- **THEN** `python -m backend.server` 能正确定位 `backend/` 模块并启动服务

## REMOVED Requirements
无（仅删除无引用文件）

## Non-Goals
- 不移动 `Used/` 目录（存放参考文档和废弃代码，已在独立文件夹中）
- 不修改任何源代码引用路径
- 不移动 `backend/` 目录