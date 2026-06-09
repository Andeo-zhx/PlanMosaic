# Checklist

## P0 — weekday 归一化
- [x] `parse_template_weekday` 把 1-7 数字与 "周一"～"周日" 中文都归一化为 0-6
- [x] `parse_template_weekday` 对非法值（None、负数、>7、字符串乱码）返回 None 而不是静默通过
- [x] `parse_weekday_candidates` 对数字入参先归一化到 0-6
- [x] `date_weekday_candidates` 只返回 `{weekday}` 单值
- [x] `_normalize_template_course_cell` 走 `parse_template_weekday`
- [x] `_upsert_template_cell` 写入 key 前 weekday 是 0-6 整数
- [x] `_iter_template_cells` / `_find_template_cell` / `_remove_template_overlaps` 内部统一 0-6

## P0 — 工具 schema 描述
- [x] `courses[].weekday` 描述为 0-6 区间
- [x] `course_cell.weekday` 描述明确"后端会自动把 1-7 归一化为 0-6"
- [x] `manage_courses add` 的顶层 `weekday` 描述同步

## P0 — `manage_courses create / add` 命中校验
- [x] `create` 时 `weekday=1` 仅命中周一对应的日期
- [x] `create` 时 `weekday=2` 仅命中周二
- [x] `create` 时 `weekday=6` 仅命中周六
- [x] `create` 时 `weekday=7` 仅命中周日
- [x] `add`（不带 template_name）路径仅命中预期的星期
- [x] `add` 写 `course_cell` 时 weekday=1 写入 day 0
- [x] 非法 weekday 返回明确错误而不写脏数据

## P0 — `manage_courses list` 聚合
- [x] 不带 `template_name` 时返回 `actual[]` + `templates[]`
- [x] `actual[]` 受 `keyword` / `weekday_filter` 过滤
- [x] `templates[]` 受 `templateName` 过滤
- [x] 至少包含日期、时间、课程名、教师、地点等字段

## P0 — 课表编辑器汇总视图
- [x] `scheduleTemplates` 为空时，从 `schedules` 展示 "Agent 课表汇总" 分组
- [x] 汇总分组只读显示日期/节次/课程名/教师/地点
- [x] `scheduleTemplates` 非空时，提供 "模板外的课程" 入口
- [x] 提供 "将 Agent 课表转为模板" 按钮（可选能力，按钮可见即可）

## P1 — 测试与回归
- [x] 新增/扩展 `backend/tests` 用例覆盖以上 5 个 P0 类
- [x] `python -m unittest discover -s tests` 全部通过（23 tests OK）
- [x] `index.html` JS 语法校验通过（3 inline script blocks OK）

## P1 — 文档同步
- [x] 在 `tools.py` 中 `manage_courses` description 注明"weekday 统一 0-6，1-7 自动归一化"
- [x] 任何用 `0-6` / `1-7` 习惯的地方在注释里说明
