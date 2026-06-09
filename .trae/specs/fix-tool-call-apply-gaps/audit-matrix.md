# 可写工具一致性矩阵

## 直接执行型

| 工具 | action / 场景 | 写入目标 | 返回语义 |
| --- | --- | --- | --- |
| `add_schedule` | 单次 / 周期性添加 | `schedules` | `success=true` 且 `shouldRefresh=true` 表示已写入内存并会落盘 |
| `manage_tasks` | `add` / `complete` | `schedules[*].tasks` | `success=true` 且 `shouldRefresh=true` |
| `manage_big_tasks` | `add` / `complete` / `break_down` | `bigTasks`、`schedules[*].tasks` | `success=true` 且 `shouldRefresh=true` |
| `manage_courses` | `create` / `add` | `schedules[*].timeSlots` | `success=true` 且 `shouldRefresh=true` |
| `manage_templates` | `create` / `delete` | `scheduleTemplates` | `success=true` 且 `shouldRefresh=true` |

## Proposal 确认后执行型

| 工具 | proposal.type | 审批结果 |
| --- | --- | --- |
| `modify_schedule` | `modify_schedule` | 已实现真实落盘 |
| `modify_schedule` | `batch_delete_schedule` | 已实现真实落盘 |
| `modify_schedule` | `batch_modify_schedules` | 已实现真实落盘 |
| `manage_tasks` | `update_task` / `delete_task` / `batch_delete_tasks` | 已实现真实落盘 |
| `manage_big_tasks` | `update_big_task` / `delete_big_task` / `batch_delete_big_tasks` | 已实现真实落盘 |
| `manage_courses` | `modify_course` / `remove_course` / `swap_courses` | 已实现真实落盘 |
| `manage_courses` | `adjust_schedule_by_week` / `import_course_schedule` / `batch_manage_courses` | 审批时显式失败并记录日志 |
| `manage_templates` | `apply_template` | 已实现真实落盘 |

## 只读工具

| 工具 | action / 场景 | 约束 |
| --- | --- | --- |
| `view_schedule` | 全部 | 不写入，不返回 `shouldRefresh=true` |
| `check_conflicts` | 全部 | 不写入，不返回 `shouldRefresh=true` |
| `manage_tasks` | `view` | 不写入 |
| `manage_big_tasks` | `view` | 不写入 |
| `manage_courses` | `list` / `export` / `analyze_load` | 不写入 |
| `manage_templates` | `list` | 不写入 |
