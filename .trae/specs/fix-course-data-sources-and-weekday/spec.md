# 课表数据源打通 + 星期口径统一 Spec

## Why
当前课表存在两套互不连通的存储：`schedules[date].timeSlots`（Agent 的 `create` / `add` 默认写这里）与 `scheduleTemplates[]`（课表编辑器与 Agent 带 `template_name` 的 `add` 写这里）。用户点开"课表编辑器"只能看到后者，于是 Agent 通过 `create` 写入的整张课表被编辑器视作"空"。

同时，"星期"字段在两处存在歧义：
- `courses[].weekday` 描述 "0-6"
- `course_cell.weekday` 描述 "兼容0-6或1-7"
- `date_weekday_candidates()` 在匹配日历时把"今天"映射成 `{0,1,1,1}` / `{1,2,2,2}` … 等 4 个候选，导致 Agent 用 1-7 习惯传 `weekday=1` 时同时命中周一和周二，"部署日期往后延一天"。

本 Spec 集中解决这两类问题。

## What Changes
- 在后端把"星期"统一归一化为 **0-6 区间（0=周一，6=周日）**：所有 parser、helpers、写入 key 处都按这一口径运行
- 收敛 `date_weekday_candidates()` 的多候选输出，避免一次匹配命中多天
- 统一 `manage_courses` 工具 schema 中 `weekday` 的描述文案（0-6 唯一）
- 让"课表编辑器"在没有模板时，反向从 `schedules` 汇总展示 Agent 写入的课程，并在有模板时也提供"模板外的日程"入口
- 给 `manage_courses list` 增加聚合视图，合并 `schedules` + `scheduleTemplates` 的结果

## Impact
- Affected specs: Agent 课表写入、课表编辑器、课表启用、课程查询
- Affected code:
  - `PlanMosaic Desktop/backend/tool_executor.py`（`parse_weekday_candidates`、`date_weekday_candidates`、`_upsert_template_cell`、`_execute_manage_courses` 的 list / create 路径、`_normalize_template_course_cell`、`_iter_template_cells`、`_find_template_cell`、`_remove_template_overlaps`）
  - `PlanMosaic Desktop/backend/tools.py`（`manage_courses` 工具 schema 中 `weekday` 描述）
  - `PlanMosaic Desktop/index.html`（`renderScheduleEditorList`、`openScheduleEditor`，以及 AI 工具回显）
  - 后端测试样例（`backend/tests` 中涉及 weekday 的用例）

## ADDED Requirements

### Requirement: 星期字段统一为 0-6
系统 SHALL 在所有与课表相关的 Agent 工具接口、内部数据、渲染 key 中，星期字段统一使用 **0-6 区间**（0=周一，6=周日），禁止再用 1-7 区间。

#### Scenario: Agent 用 1-7 习惯传 weekday
- **WHEN** Agent 传入 `weekday=1` 期望代表"周一"
- **THEN** 后端归一化为 `weekday=0`
- **AND** 仅匹配实际的周一，不会再命中周二

#### Scenario: Agent 传 weekday=0
- **WHEN** Agent 传入 `weekday=0`
- **THEN** 仍按 0-6 规则匹配周一

#### Scenario: 星期参数非数字（如"周一"）
- **WHEN** Agent 传入 `weekday="周一"` / `"星期天"` 等中文
- **THEN** 解析为对应的 0-6 数字（周一→0、周日→6）

#### Scenario: 非法 weekday
- **WHEN** Agent 传入 `weekday=10` / `"unknown"` 等非法值
- **THEN** 后端在写模板或部署时返回明确错误，而不是静默写入或错误命中

### Requirement: 单值 weekday 匹配
系统 SHALL 在按日期匹配某天的星期时，仅使用 Python `datetime.weekday()`（0=周一 … 6=周日）的单值，不输出多候选集合，从而避免一次匹配同时命中两天。

#### Scenario: 部署整学期课表
- **WHEN** Agent 用 `manage_courses action=create` 部署课表
- **AND** 某课程 `weekday=1`（经归一化为 0=周一）
- **THEN** 该课程仅出现在周一对应的日期
- **AND** 不会出现在周二

#### Scenario: 添加单门课程（不带模板）
- **WHEN** Agent 用 `manage_courses action=add` 不带 `template_name`
- **AND** 传入 `weekday=2`（周三）
- **THEN** 该课程仅出现在周三对应的日期

#### Scenario: 写入模板格子
- **WHEN** Agent 用 `course_cell` 写入模板格子
- **AND** `weekday` 传 1（1-7 习惯）期望"周一"
- **THEN** 写入模板时实际使用的 day index 为 0
- **AND** 编辑器网格中课程落在周一列

### Requirement: 课表编辑器汇总 Agent 写入的课程
系统 SHALL 让"课表编辑器"在 `scheduleTemplates` 为空时也能展示 Agent 通过 `create` / 普通 `add` 写入 `schedules` 的课程。

#### Scenario: 编辑器无模板但日程有课
- **WHEN** `scheduleTemplates` 为空
- **AND** `schedules` 中存在带有 `type === 'course'` 的 `timeSlots`
- **THEN** 编辑器在"课表列表"中展示一个只读的"Agent 课表汇总"分组
- **AND** 列出每个日期、节次、课程名、教师、地点

#### Scenario: 编辑器有模板 + 模板外还有课程
- **WHEN** `scheduleTemplates` 非空
- **AND** `schedules` 中存在不属于任何模板节次的课程
- **THEN** 编辑器列表中提供"模板外的课程"分组入口
- **AND** 用户可一眼看到遗漏的安排

#### Scenario: 课程反向生成模板（可选）
- **WHEN** 用户点击"将 Agent 课表转为模板"
- **THEN** 系统根据 `schedules` 中的课程反推出一个草稿模板（timeSlots 段取出现过的最大节次数）
- **AND** 用户可以在编辑器中进一步调整

### Requirement: `manage_courses list` 聚合视图
系统 SHALL 在 `manage_courses action=list` 不传 `template_name` 时，把 `schedules` 中的课程与 `scheduleTemplates` 中的模板格子（如果 `active` 或最近一次部署过）合并展示。

#### Scenario: 同时存在 schedule 课程与模板
- **WHEN** 用户/Agent 调用 `list` 不带 `template_name`
- **THEN** 返回结果包含 `schedules` 中的实际日程
- **AND** 若 `scheduleTemplates` 中有非空格子，也一并返回 `templates` 段落

#### Scenario: 只存在模板
- **WHEN** `schedules` 为空但 `scheduleTemplates` 有内容
- **THEN** 返回结果中 `templates` 段落列出所有非空格子

### Requirement: 工具 schema 文案统一
系统 SHALL 在 `manage_courses` 工具的 JSON Schema 中，所有 `weekday` 字段的描述统一为"0-6 区间（0=周一，6=周日）"，并在 `course_cell.weekday` 描述中显式说明后端会自动把 1-7 归一化为 0-6。

## MODIFIED Requirements

### Requirement: 课表编辑器列表视图
原来仅展示 `scheduleTemplates`；改为同时汇总 `schedules` 中 Agent 写入的课程。

### Requirement: 课表工具 `add` 路径的 weekday 归一化
原来 `_upsert_template_cell` 直接把 `cell_ref.get('weekday')` 拼到 key 中（[tool_executor.py:825](file:///d:/Trae%20CN/Projects/PlanMosaic/PlanMosaic%20Desktop/backend/tool_executor.py#L825)），未做 1-7→0-6 的归一化；改为经过 `parse_template_weekday` / 等价归一化函数后再写入 key。

## REMOVED Requirements
无。
