# Checklist

## P0 — 重复定义清理
- [x] `index.html` 中 `isSelectionMergeable` 重复定义已删除
- [x] 课表编辑器其他可疑重复/无用函数已清理（如未引用的 `handleCellClick`）

## P0 — 节次增删后数据一致
- [x] 删除中间节次时，`row > index` 的所有课程格子随之下移
- [x] 下移后课程名称、教师、地点、备注完整保留
- [x] 合并跨度 `mergeSpan` 越界时做边界截断，渲染不出现错位
- [x] 新增节次不会破坏现有数据

## P0 — 合并 / 取消合并 / 清空选区
- [x] `mergeSelectedCells` 保留第一个非空格的完整字段（course/teacher/location/note）
- [x] `unmergeCell` 拆分后每个子格继承完整的课程字段
- [x] `clearSelectedCells` 在选区含被合并隐藏的格子时，清理顶部 `mergeSpan` 不留半截
- [x] `renderScheduleTable` 不再因 `rowspan` 越界导致表格错位

## P0 — `activateScheduleConfirmed` 时区与覆盖策略
- [x] 启用课表时日期字符串不再受时区影响（任意时区下都得到正确日期）
- [x] 启用时只清理 `type === 'course'` 且时间重叠的旧条目，不动其他日程
- [x] 成功提示中区分“新增课程数 / 覆盖课程数”（或至少给出总计）

## P0 — 编辑上下文与状态管理
- [x] `editTemplate` 保留上次编辑时的单/双周类型
- [x] `closeScheduleEditor` 清理 `currentEditingTemplate`、`selectedCells`、未保存的 input
- [x] `switchWeekType` 在“单周 → 双周”自动复制时，正确判断单周是否非空
- [x] `copyOddToEven` 在单周为空时给出“无需复制”提示

## P1 — 基础健壮性
- [x] `updateTimeSlot` 对空 / 非数值输入做兜底
- [x] `addMinutes` 对负值 / 跨日情况做兜底
- [x] 课程单元格超长文本不撑破表格
- [x] 异步按钮（保存课表、启用课表）在请求期间正确置灰

## P1 — 回归验证
- [x] “创建课表 → 编辑课程 → 应用到日期范围”端到端流程通过（Node 语法校验 + 端到端逻辑检查）
- [x] “删除中间节次 / 合并 / 取消合并 / 清空选区”边界场景通过（代码逻辑审查）
- [x] 课表保存、编辑、关闭后再次打开无残留状态
- [x] 已完成项均勾选，无未勾选的关键 P0 项
