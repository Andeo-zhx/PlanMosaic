# 日程时间条显示修复 - 任务列表

## 🔴 P0 — 时间条不可见的根本原因

- [x] **Task 1**: 修复 `.day-timebar-bg` 缺少 `position: relative`
  - [x] 1.1 在 index.html 的 `.day-timebar-bg` CSS 规则中添加 `position: relative`
  - [x] 1.2 为 `.day-timebar-fill` 的 `background` 添加 fallback: `background: #6C63FF; background: var(--accent-main, #6C63FF);`
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 2**: 修复周视图 schedule 参数传递（已验证代码一致，无需修改）
  - [x] 2.1 验证所有3行（上周/本周/下周）的 `day.schedule` 赋值逻辑一致
  - [x] 2.2 确认 `createDayCell` 调用正确传递 schedule 参数
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 3**: 修复 `activateScheduleConfirmed` 后日历不刷新
  - [x] 3.1 在 `activateScheduleConfirmed` 末尾（保存成功后）添加 `renderCalendar()` + `renderTimeSidebar()` 调用
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 4**: 修复月视图相邻月份日期无时间条
  - [x] 4.1 上月尾部日期计算正确的 `dateStr` 并获取 schedule 数据
  - [x] 4.2 下月头部日期计算正确的 `dateStr` 并获取 schedule 数据
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

## 🟡 P1 — 数据链路完整性

- [x] **Task 5**: 修复 `applyTemplate` 遗漏 `timeSlots` 初始化（已确认代码正确，无需修改）
  - [x] 5.1 `activateScheduleConfirmed` 中新 schedule 对象已包含完整字段（title/highlights/milestone/timeSlots/tasks）
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 6**: 修复 `scheduleTemplates` 数据结构（已确认代码正确，无需修改）
  - [x] 6.1 `createNewTemplate` 已包含 `timeSlots`（10节课默认时间）
  - [x] 6.2 模板编辑器支持 timeSlots 编辑和增删
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 7**: 修复 AI `manage_schedule` modify action（新增 _execute_manage_schedule 函数）
  - [x] 7.1 新增 `manage_schedule` 路由和 dispatcher
  - [x] 7.2 modify action 按 `time` 字段匹配已有 slot 并原位更新，未匹配项追加
  - [x] 7.3 支持 `removeSlots` 精确删除指定时间段
  - [x] 7.4 支持 `view`/`delete` action
  - [ ] 涉及文件: `backend/tool_executor.py`

## 🟢 P2 — 视觉体验增强

- [x] **Task 8**: 修复深色主题时间条对比度
  - [x] 8.1 新增 `[data-theme="dark"] .day-timebar-bg` 规则（浅色半透明背景）
  - [x] 8.2 新增 `[data-theme="dark"] .day-timebar-fill` 规则（亮紫色 + opacity 0.7）
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 9**: 时间条增加 `icon` 字段渲染支持
  - [x] 9.1 修改填充条 `title` 属性：hover 时显示 icon + time + activity
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

- [x] **Task 10**: 右侧 timeSidebar 时间块颜色与日历格一致
  - [x] 10.1 `.time-block` 背景色改为 `var(--accent-main, #6C63FF)`
  - [ ] 涉及文件: `PlanMosaic Desktop/index.html`

# Task Dependencies

- Task 1 (CSS fix) → 无依赖，最高优先级
- Task 2 (周视图) → 无依赖
- Task 3 (课表刷新) → 无依赖
- Task 4 (月视图相邻月) → 无依赖
- Task 5 (模板 timeSlots) → 无依赖
- Task 6 (模板数据结构) → 可能与 Task 5 相关
- Task 7 (AI modify) → 无依赖
- Task 8 (深色主题) → 依赖 Task 1（CSS 变量标准化后）
- Task 9 (icon 渲染) → 依赖 Task 1
- Task 10 (侧栏颜色) → 依赖 Task 1

**推荐执行顺序**: Task 1（CSS根本修复）→ Task 2/3/4（渲染链路）→ Task 5/6/7（数据完整性）→ Task 8/9/10（视觉增强）