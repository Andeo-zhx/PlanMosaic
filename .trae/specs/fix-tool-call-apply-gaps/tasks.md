# Tasks

- [x] Task 1: 建立可写工具一致性矩阵
  - [x] 盘点 `tools.py` 中所有会修改用户数据的工具与 action
  - [x] 标记每个工具是“直接执行”还是“proposal 确认后执行”
  - [x] 对照 `tool_executor.py` 与 `server.py::_approve_schedule_proposal()`，找出 proposal 类型与审批分支不一致项
  - 完成说明：新增 `audit-matrix.md`，梳理直接执行 / proposal 确认 / 只读三类工具，并标出已落盘与显式失败项

- [x] Task 2: 修复修改类工具的确认后落盘链路
  - [x] 重点验证并修复 `modify_schedule` 相关 proposal 的审批执行逻辑
  - [x] 校验“提案创建成功”与“数据已真实修改”两种语义在返回值中的区分
  - [x] 确认前端刷新信号与后端真实写入结果一致
  - 完成说明：补齐 `batch_modify_schedules` 与 `modify_schedule` 审批分支；审批失败统一返回明确 `error/message`

- [x] Task 3: 补齐课程与模板类 proposal 的审批执行能力
  - [x] 为 `manage_courses` 中所有需要确认的 proposal 类型补齐后端落盘分支
  - [x] 为 `manage_templates apply` proposal 补齐审批执行与目标日期写入
  - [x] 若存在暂不支持的 proposal 类型，返回显式错误并记录日志
  - 完成说明：支持 `modify_course` / `remove_course` / `swap_courses` / `apply_template`；`adjust_schedule_by_week` / `import_course_schedule` / `batch_manage_courses` 显式失败并记日志

- [x] Task 4: 全量排查其他工具是否存在同类问题
  - [x] 逐项核对 `manage_tasks`、`manage_big_tasks`、`add_schedule`、`check_conflicts`、`manage_courses`、`manage_templates`
  - [x] 确认直接执行型工具是否真的写入且 `shouldRefresh` 语义正确
  - [x] 确认只读工具不会错误宣称写入成功
  - 完成说明：`manage_templates` 已切回规范字段 `scheduleTemplates`，并为 `create/delete` 补 `shouldRefresh`

- [x] Task 5: 增加回归验证
  - [x] 为每类可写工具至少补 1 个“成功生效”验证
  - [x] 为未实现或非法 proposal 类型补 1 个“显式失败”验证
  - [x] 运行相关检查并记录通过结果
  - 完成说明：新增后端回归测试 `backend/tests/test_proposal_approval_consistency.py`

- [x] Task 6: 补齐工具审批一致性的自动化覆盖缺口
  - [x] 为 `delete_task`、`batch_delete_tasks`、`delete_big_task`、`batch_delete_big_tasks` 补正式自动化测试
  - [x] 为 `remove_course`、`swap_courses`、`adjust_schedule_by_week`、`import_course_schedule` 补正式自动化测试
  - [x] 为通用 `modify_schedule` 成功/失败路径补正式自动化测试
  - [x] 重新运行测试并确认 checklist 第 10 项可勾选
  - 完成说明：扩展 `backend/tests/test_proposal_approval_consistency.py`，新增删除类、课程类、通用日程审批及显式失败分支断言；`python -m unittest discover -s "PlanMosaic Desktop/backend/tests" -v` 共 8 项通过

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 1
- Task 4 依赖 Task 2 和 Task 3
- Task 5 依赖 Task 2、Task 3、Task 4
- Task 6 依赖 Task 5
