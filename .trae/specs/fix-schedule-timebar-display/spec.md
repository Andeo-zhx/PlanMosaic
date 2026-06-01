# 日程时间条显示修复 Spec

## Why
用户反馈：在日历的日/周/月视图中，已经安排好的日程内容（时间槽 `timeSlots`）没有以可视化的"时间条"（time bar）形式展示。经全局代码审计，发现 `createDayCell` 中已有时间条渲染逻辑（`.day-timebar` / `.day-timebar-fill`），但存在 **CSS 定位缺陷**、**数据链路断裂**、**CSS 变量缺失** 等多处问题，导致时间条不可见或行为异常。

## What Changes
- 修复 `.day-timebar-bg` 缺少 `position: relative` 导致绝对定位填充条错位
- 为 `var(--accent-main)` 添加 fallback 颜色，防止未定义时透明
- 修复周视图中 `createDayCell` 未正确传递 `schedule` 参数导致上一周/下一周的日程不显示时间条
- 修复 `activateScheduleConfirmed`（课表激活）后日历不自动刷新，导致课程时间条不显示
- 修复 AI 工具 `manage_schedule` 中 `modify` action 删除所有 `timeSlots` 而非仅删除匹配项，导致时间条被错误清空
- 修复 `applyTemplate` 生成新日程时遗漏 `timeSlots` 数组初始化
- 修复时间条在深色主题下对比度不足的问题
- 修复月视图相邻月份日期（灰色日期）的日程时间条被完全忽略
- 增强右侧时间轴（timeSidebar）与日历网格的时间条数据一致性
- 修复含 `icon` 字段的 timeSlot 在时间条中不渲染图标的问题

## Impact
- Affected specs: scenario-driven-usage-audit-v2（日程同步相关）
- Affected code:
  - `PlanMosaic Desktop/index.html` — CSS 样式 + `createDayCell` + `renderWeekView` + `renderMonthView` + `activateScheduleConfirmed` + `applyTemplate`
  - `PlanMosaic Desktop/ai-agent.js` — `refreshScheduleData` 日历刷新链
  - `backend/tool_executor.py` — `_execute_manage_schedule` modify action

## ADDED Requirements

### Requirement: 时间条 CSS 定位修复
系统 SHALL 确保 `.day-timebar-fill`（绝对定位）相对于 `.day-timebar-bg` 正确定位。

#### Scenario: 时间条在日历单元格中正确定位
- **WHEN** 日历日单元格包含 timeSlots
- **THEN** 每个时间条填充块应精确对齐在时间条背景条内
- **AND** `left` 百分比和 `width` 百分比相对于 bg 容器计算

### Requirement: CSS 变量 fallback
系统 SHALL 为 `.day-timebar-fill` 的 `background` 提供 fallback 颜色。

#### Scenario: accent-main 变量未定义
- **WHEN** `--accent-main` CSS 变量在主题中未定义
- **THEN** 时间条填充块仍应有可见颜色（fallback: `#6C63FF`）

### Requirement: 周视图 schedule 参数修正
系统 SHALL 为周视图中所有 21 个日期（上周/本周/下周）正确传递 `schedule` 参数给 `createDayCell`。

#### Scenario: 周视图上周日期显示时间条
- **WHEN** 上周某天有 timeSlots 数据
- **THEN** 该单元格应显示时间条，而非仅本周才显示

### Requirement: 课表激活后自动刷新
系统 SHALL 在 `activateScheduleConfirmed` 完成后自动调用 `renderCalendar()`。

#### Scenario: 激活课表后日历立即刷新
- **WHEN** 用户激活学期课表模板
- **THEN** 日历应立即重新渲染，课程时间条可见

### Requirement: AI schedule modify 精确删除
系统 SHALL 在 AI 修改单日日程时，仅删除/替换指定的 timeSlot，而非清空全部。

#### Scenario: AI 修改某一天的某个时段
- **WHEN** AI 调用 manage_schedule 的 modify action 并指定新的 timeSlots
- **THEN** 仅更新指定的 timeSlot，保留其他未涉及的 timeSlot
- **AND** 如果 newSlots 为空且意图是删除，则仅删除匹配指定时间的 slot

### Requirement: 模板应用时初始化 timeSlots
系统 SHALL 在 `applyTemplate` 生成新日程条目时包含空的 `timeSlots` 数组。

#### Scenario: 应用模板创建新日程
- **WHEN** 用户应用日程模板到某日期
- **THEN** 新创建的 schedule 对象应包含 `timeSlots: []` 字段

### Requirement: 深色主题时间条对比度
系统 SHALL 确保时间条在深色主题下有足够的视觉对比度。

#### Scenario: 深色模式下查看日历
- **WHEN** 应用处于深色主题
- **THEN** 时间条填充块应与背景有 ≥ 3:1 的对比度

### Requirement: 月视图相邻月日期时间条
系统 SHALL 为月视图中属于相邻月份的日期也尝试渲染其时间条。

#### Scenario: 月视图灰色日期有日程
- **WHEN** 月视图显示上月最后几天或下月前几天
- **THEN** 这些单元格应获取对应日期的 schedule 数据并渲染时间条

### Requirement: 右侧时间轴数据同步
系统 SHALL 确保右侧 timeSidebar 显示的时间条与日历网格数据一致。

#### Scenario: 点击日期后右侧栏显示
- **WHEN** 用户点击日历中的日期
- **THEN** 右侧时间轴的时间块渲染应与该日期的 timeSlots 数据完全一致
- **AND** 时间块应使用与日历格中相同的颜色/样式

## MODIFIED Requirements

### Requirement: createDayCell 时间条渲染（已有代码）
系统 SHALL 在日历单元格中为包含 `timeSlots` 的日期渲染可视化时间条。CSS 修复后：
- `.day-timebar-bg` 增加 `position: relative`
- `.day-timebar-fill` 的 `background` 增加 fallback: `background: #6C63FF; background: var(--accent-main, #6C63FF);`

## REMOVED Requirements
无