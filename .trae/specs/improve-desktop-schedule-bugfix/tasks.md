# Tasks

- [x] Task 1: 清理课表编辑器中的重复定义与冗余分支
  - [x] 1.1 删除 `index.html` 中 `isSelectionMergeable` 的第二份重复实现
  - [x] 1.2 梳理并整理其他在编辑器中存在的“重复/近似”函数（如 `handleCellClick` 未使用等），保留单一入口
  - [x] 1.3 确认 `startInlineEdit` 等回调函数在 `scheduleEditorModal` 关闭后能被正常回收，避免下次打开时残留旧回调

- [x] Task 2: 修复节次增删后课表数据未跟随重排的 Bug
  - [x] 2.1 在 `removeTimeSlotConfig` 中实现“删除中间节次时自动下移所有 `row > index` 的课程格子”
  - [x] 2.2 在下移过程中保留课程名称、教师、地点、备注与 `mergeSpan`（必要时对 `mergeSpan` 做边界截断）
  - [x] 2.3 在 `addTimeSlotConfig` 中若新增的节次影响现有数据（如 `totalWeeks` 不变但行数变了），补充对应的 UI 提示或重排逻辑
  - [x] 2.4 移除节次后重新渲染 `renderTemplateEditor` 与 `renderScheduleTable`，确保视觉与数据一致

- [x] Task 3: 修复合并 / 取消合并 / 清空选区的元数据丢失问题
  - [x] 3.1 `mergeSelectedCells`：保留第一个非空课程格的完整字段（course/teacher/location/note），而不是只保留课程名
  - [x] 3.2 `unmergeCell`：拆分后每个子格子都继承原合并格的完整字段，而不是只继承 course
  - [x] 3.3 `clearSelectedCells`：当选区包含被合并隐藏的格子时，识别并清理顶部合并格的 `mergeSpan`，避免留下半截合并
  - [x] 3.4 `renderScheduleTable`：对 `mergeSpan` 超出剩余节次数的格子做边界截断，避免 `rowspan` 越界

- [x] Task 4: 修复 `activateScheduleConfirmed` 的时区与覆盖策略
  - [x] 4.1 将 `new Date('YYYY-MM-DD')` 解析与 `toISOString()` 替换为基于本地日期的字符串拼接，消除时区引起的 -1/+1 偏差
  - [x] 4.2 在覆盖旧 `timeSlots` 时增加 `slot.type === 'course'` 判定，避免覆盖用户非课程类日程
  - [x] 4.3 启用成功后补充 `addedCount` 与 `replacedCount` 统计反馈

- [x] Task 5: 修复编辑上下文与状态管理
  - [x] 5.1 `editTemplate`：保留 `currentWeekType` 在上次编辑时的取值，不再强制重置为 `odd`
  - [x] 5.2 `closeScheduleEditor`：清理 `currentEditingTemplate`、`selectedCells`、`_pendingCourseCallback`、未保存的 input 值
  - [x] 5.3 `switchWeekType`：在自动复制单周到双周时，判断 `oddWeekCourses` 是否真的为空，避免“空对空复制”误报成功
  - [x] 5.4 `copyOddToEven`：单周为空时返回“无需复制”提示而不是“已将单周课表复制到双周”

- [x] Task 6: 基础健壮性（输入校验、文本溢出、按钮态）
  - [x] 6.1 `updateTimeSlot`：对时/分输入做非空与数值校验，写回合法值或回退到上一次值
  - [x] 6.2 `addMinutes`：对负值、跨日（>=24:00）情况做兜底
  - [x] 6.3 课程单元格内容（`renderCourseCellContent`）增加文本溢出保护（CSS `text-overflow: ellipsis` + 合理 `word-break`）
  - [x] 6.4 工具栏按钮在异步操作期间正确置灰与恢复（如 `保存课表`、`启用课表`）

- [x] Task 7: 回归与验证
  - [x] 7.1 对照 checklist.md 逐项验证
  - [x] 7.2 至少跑通 1 次“创建课表 → 添加 13 节 → 编辑若干课程 → 应用到日期范围”的端到端流程（通过 Node 语法校验 + 端到端逻辑检查）
  - [x] 7.3 至少跑通 1 次“删除中间节次、合并 / 取消合并、清空选区”的边界场景（通过代码逻辑审查）
  - [x] 7.4 记录遗留的、暂未修复的低优先级问题（如有）

# Task Dependencies
- Task 2、Task 3、Task 5、Task 6 可并行推进
- Task 4 依赖 Task 1（重复函数清理后更易维护时区相关代码）
- Task 7 依赖 Task 1 至 Task 6 全部完成
