# 课表编辑与注入流程 Spec

## Why
当前 Desktop 端虽然已有课程/课表的底层数据结构与部分编辑器雏形，但缺少一个完整、清晰、可直接交付给用户使用的“课表”功能入口。
用户需要像截图那样可视化维护课表，允许 Agent 写入和编辑课程安排，设置课表应用的起止日期，并在确认后按第 1-13 节课对应时间段批量注入到日程中。

## What Changes
- 新增明确的“课表”功能入口与按钮，让用户可直接进入课表编辑器
- 提供类似课程表的可视化编辑界面，支持周一到周日、单周/双周、1-13 节课的二维课表编辑
- 允许 Agent 基于结构化课表数据创建、修改和删除课程格子
- 允许用户设置课表生效起止日期，并在点击“应用”后把课表批量注入到日程数据
- 建立第 1-13 节课到具体时间段的统一映射，用于生成实际 `timeSlots`
- 补充课表编辑、Agent 改课表、应用注入与回显刷新的验证流程

## Impact
- Affected specs: 课表管理、课程注入、AI Agent 结构化编辑、日历时间条回显
- Affected code: `PlanMosaic Desktop/index.html`、`PlanMosaic Desktop/ai-agent.js`、`PlanMosaic Desktop/preload.js`、`PlanMosaic Desktop/backend/tools.py`、`PlanMosaic Desktop/backend/tool_executor.py`、`PlanMosaic Desktop/backend/server.py`、相关测试文件

## ADDED Requirements
### Requirement: 课表功能入口
系统 SHALL 在 Desktop 端提供一个清晰可见的“课表”入口按钮，用户点击后可进入课表编辑器。

#### Scenario: 打开课表编辑器
- **WHEN** 用户点击“课表”按钮
- **THEN** 系统打开课表编辑器，而不是要求用户通过隐蔽入口或临时流程进入

### Requirement: 可视化课表编辑器
系统 SHALL 提供一个类似截图风格的可视化课表编辑器，支持周一到周日、单周/双周、1-13 节课的课程格子编辑。

#### Scenario: 编辑课程格子
- **WHEN** 用户在某一星期、单双周、节次位置添加或编辑课程
- **THEN** 系统保存该格子的课程名称、课程详情、位置及所属单双周信息

#### Scenario: 使用 1-13 节课映射
- **WHEN** 用户保存课表或应用课表
- **THEN** 系统按预设的第 1-13 节课时间段映射，把节次转换为实际 `HH:MM-HH:MM` 时间范围

### Requirement: Agent 可写入与编辑课表
系统 SHALL 允许 Agent 以结构化方式创建、修改、删除和调整课表内容，而不是只能操作普通日程。

#### Scenario: Agent 创建课表
- **WHEN** 用户要求 Agent “帮我写课表”或“按课程信息生成课表”
- **THEN** Agent 可以写入结构化课表数据，并在前端课表编辑器中可见

#### Scenario: Agent 修改课表
- **WHEN** 用户要求 Agent 修改某门课的星期、单双周、节次、地点或名称
- **THEN** Agent 修改的是课表结构数据，并同步更新编辑器展示

### Requirement: 课表起止日期应用
系统 SHALL 允许用户为课表指定应用的起止日期，并在确认后按规则批量注入到日程中。

#### Scenario: 应用课表到日期范围
- **WHEN** 用户设置开始日期、结束日期并点击“应用”
- **THEN** 系统仅在该日期范围内生成对应课程日程
- **AND** 单周/双周课程按周次规则分别注入

#### Scenario: 应用后回显
- **WHEN** 课表应用成功
- **THEN** 日历视图、右侧时间栏与指定日期详情均能看到注入后的课程时间段

## MODIFIED Requirements
### Requirement: 课程管理方式
现有课程管理不再只依赖零散的课程输入弹窗或底层工具调用，而是升级为“可视化课表编辑 + Agent 结构化编辑 + 日期范围应用注入”的统一工作流。

## REMOVED Requirements
### Requirement: 仅通过零散课程输入维护课表
**Reason**: 用户当前需要的是完整课表工作流，单个课程弹窗不足以承担整学期课表编辑、单双周管理和批量注入需求。
**Migration**: 保留现有底层课程数据兼容能力，但前台主流程迁移为新的课表编辑器与应用流程。
