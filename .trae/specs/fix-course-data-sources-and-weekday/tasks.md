# Tasks

- [x] Task 1: 在后端统一 weekday 口径为 0-6
  - [x] 1.1 新增/确认 `parse_template_weekday` 已是 0-6 归一化的统一入口，并补充对边界值（负数、超过 7、浮点、None）的处理
  - [x] 1.2 调整 `parse_weekday_candidates`：对数字入参统一先走 `parse_template_weekday` 归一化到 0-6，再返回 `{value}` 集合
  - [x] 1.3 调整 `date_weekday_candidates`：仅返回 `{weekday}`（Python weekday 即 0-6），不再输出多候选
  - [x] 1.4 调整 `_normalize_template_course_cell`：把 `weekday` 强制经过 `parse_template_weekday` 归一化
  - [x] 1.5 调整 `_upsert_template_cell`：写入模板 key 前再次校验 weekday 是 0-6 整数，否则返回明确错误
  - [x] 1.6 调整 `_iter_template_cells` / `_find_template_cell` / `_remove_template_overlaps`：内部 day 索引统一 0-6，文档注释明确
  - [x] 1.7 在 `manage_courses create` 路径中：当 `courses[].weekday` 经 `parse_template_weekday` 归一化失败时返回错误，并指出原值

- [x] Task 2: 工具 schema 描述统一
  - [x] 2.1 `tools.py` 中 `courses[].weekday` 描述改为 "0-6 区间，0=周一，6=周日；后端会自动把 1-7 归一化为 0-6"
  - [x] 2.2 `course_cell.weekday` / `old_course_cell.weekday` / `new_course_cell.weekday` 描述保持/强化为同一口径
  - [x] 2.3 `manage_courses add` 的 `weekday` 顶层参数描述同步

- [x] Task 3: `manage_courses list` 聚合视图
  - [x] 3.1 在 `_execute_manage_courses` 的 `list` action 中：未传 `template_name` 时，除了 `schedules` 的实际课程，再聚合 `scheduleTemplates` 中非空的 `oddWeekCourses` / `evenWeekCourses` 模板格子
  - [x] 3.2 返回结构包含 `actual[]`（来自 `schedules`）与 `templates[]`（来自模板），并在 `content` 文案中分别说明来源
  - [x] 3.3 保留 `keyword` / `weekday_filter` 仍作用于 `actual`；对 `templates` 提供 `templateName` 过滤

- [x] Task 4: 课表编辑器汇总 Agent 写入的课程
  - [x] 4.1 `renderScheduleEditorList` 在 `scheduleTemplates` 为空时，从 `schedules` 聚合展示 "Agent 课表汇总" 分组，按日期排序
  - [x] 4.2 汇总分组只读显示：日期、节次、课程名、教师、地点
  - [x] 4.3 在 `scheduleTemplates` 非空时，新增 "模板外的课程" 入口：把 `schedules` 中存在的课程与所有模板节次做差集，列出未覆盖的安排
  - [x] 4.4 提供 "将 Agent 课表转为模板" 按钮：根据 `schedules` 反推节次（最大节次数 + startTime/endTime 取最早/最晚），生成一份草稿模板

- [x] Task 5: 单元测试与回归
  - [x] 5.1 跑通完整后端测试 `python -m unittest discover -s tests` (23 tests OK)
  - [x] 5.2 在 index.html 的 JS 上做语法校验（3 inline script blocks OK）
  - [x] 5.3 新增针对前端 `collectAgentCourseEntries` / `collectTemplateCoverageSet` / `convertAgentCoursesToTemplate` / `renderScheduleEditorList` 的功能校验（7 个分支用例通过）
