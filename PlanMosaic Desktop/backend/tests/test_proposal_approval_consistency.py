import asyncio
import copy
import json
import pathlib
import sys
import unittest
from unittest import mock


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[3]
DESKTOP_ROOT = PROJECT_ROOT / "PlanMosaic Desktop"
if str(DESKTOP_ROOT) not in sys.path:
    sys.path.insert(0, str(DESKTOP_ROOT))

from backend import data_guard, server, tool_executor  # noqa: E402


class ProposalApprovalConsistencyTest(unittest.TestCase):
    def setUp(self):
        self.base_data = data_guard.normalize_schedule_data(
            {
                "schedules": {
                    "2026-06-09": {
                        "title": "周二安排",
                        "highlights": "",
                        "milestone": "",
                        "timeSlots": [
                            {"time": "09:00-10:00", "activity": "高数", "detail": "A101 * 张老师", "icon": "📚"},
                            {"time": "14:00-15:00", "activity": "英语", "detail": "B201 * 李老师", "icon": "📚"},
                        ],
                        "tasks": [
                            {"name": "写实验报告", "estimated": "60", "actual": "", "note": "", "completed": False},
                        ],
                    },
                    "2026-06-10": {
                        "title": "周三安排",
                        "highlights": "",
                        "milestone": "",
                        "timeSlots": [
                            {"time": "10:00-11:00", "activity": "大学物理", "detail": "C301 * 王老师", "icon": "📚"},
                        ],
                        "tasks": [],
                    },
                },
                "bigTasks": [
                    {
                        "name": "课程设计",
                        "estimated": 240,
                        "ddl": "2026-06-20",
                        "taskType": "short",
                        "startDate": "",
                        "note": "初稿",
                        "completed": False,
                    }
                ],
                "scheduleTemplates": [
                    {
                        "id": 1,
                        "name": "考试周模板",
                        "startDate": "2026-06-09",
                        "totalWeeks": 2,
                        "timeSlots": [
                            {"label": "第1节", "startTime": "08:00", "endTime": "08:45"},
                            {"label": "第2节", "startTime": "09:00", "endTime": "09:45"},
                        ],
                        "oddWeekCourses": {
                            "0-0": {"course": "线性代数", "mergeSpan": 1},
                            "1-0": {"course": "概率论", "mergeSpan": 1},
                        },
                        "evenWeekCourses": {},
                    }
                ],
            }
        )

    def _execute_tool(self, name, arguments, schedule_data=None):
        payload = {
            "function": {
                "name": name,
                "arguments": json.dumps(arguments, ensure_ascii=False),
            }
        }
        working_copy = schedule_data if schedule_data is not None else copy.deepcopy(self.base_data)
        raw = tool_executor.execute_tool_call(payload, working_copy)
        return json.loads(raw), working_copy

    def _approve(self, proposal, *, data=None):
        working_data = copy.deepcopy(data or self.base_data)
        written = {}

        def fake_write(document, expected_version=None):
            normalized = data_guard.normalize_schedule_data(copy.deepcopy(document))
            version = expected_version if isinstance(expected_version, int) else working_data["_meta"]["version"]
            normalized["_meta"]["version"] = version + 1
            written["data"] = normalized
            return normalized

        token = data_guard.issue_proposal_token(proposal, base_version=working_data["_meta"]["version"])
        with mock.patch.object(server, "_read_schedule_data", return_value=copy.deepcopy(working_data)):
            with mock.patch.object(server, "_write_schedule_data", side_effect=fake_write):
                result = server._approve_schedule_proposal(token)
        return result, written.get("data")

    def test_direct_write_tools_refresh_and_mutate_data(self):
        add_schedule_result, add_schedule_data = self._execute_tool(
            "add_schedule",
            {
                "date": "2026-06-11",
                "timeSlots": [{"time": "08:00-09:00", "activity": "晨读", "detail": "英语"}],
            },
        )
        self.assertTrue(add_schedule_result["success"])
        self.assertTrue(add_schedule_result["shouldRefresh"])
        self.assertEqual(add_schedule_data["schedules"]["2026-06-11"]["timeSlots"][0]["activity"], "晨读")

        manage_tasks_result, manage_tasks_data = self._execute_tool(
            "manage_tasks",
            {
                "action": "add",
                "date": "2026-06-11",
                "task_name": "整理错题",
                "estimated_minutes": 30,
            },
            schedule_data=add_schedule_data,
        )
        self.assertTrue(manage_tasks_result["success"])
        self.assertTrue(manage_tasks_result["shouldRefresh"])
        self.assertEqual(manage_tasks_data["schedules"]["2026-06-11"]["tasks"][0]["name"], "整理错题")

        manage_big_tasks_result, manage_big_tasks_data = self._execute_tool(
            "manage_big_tasks",
            {
                "action": "add",
                "task_name": "复习计划",
                "estimated_minutes": 180,
                "ddl": "2026-06-30",
            },
            schedule_data=manage_tasks_data,
        )
        self.assertTrue(manage_big_tasks_result["success"])
        self.assertTrue(manage_big_tasks_result["shouldRefresh"])
        self.assertEqual(manage_big_tasks_data["bigTasks"][-1]["name"], "复习计划")

        manage_courses_result, manage_courses_data = self._execute_tool(
            "manage_courses",
            {
                "action": "create",
                "semester_name": "夏季短学期",
                "start_date": "2026-06-15",
                "end_date": "2026-06-16",
                "courses": [{"name": "算法", "weekday": 0, "time": "08:00-09:00"}],
            },
            schedule_data=manage_big_tasks_data,
        )
        self.assertTrue(manage_courses_result["success"])
        self.assertTrue(manage_courses_result["shouldRefresh"])
        self.assertIn("2026-06-15", manage_courses_data["schedules"])

        manage_templates_result, manage_templates_data = self._execute_tool(
            "manage_templates",
            {
                "action": "create",
                "template_name": "晚间模板",
                "template_data": {"timeSlots": [{"time": "19:00-20:00", "activity": "晚自习"}]},
            },
            schedule_data=manage_courses_data,
        )
        self.assertTrue(manage_templates_result["success"])
        self.assertTrue(manage_templates_result["shouldRefresh"])
        self.assertTrue(any(t["name"] == "晚间模板" for t in manage_templates_data["scheduleTemplates"]))

        check_conflicts_result, _ = self._execute_tool(
            "check_conflicts",
            {"date": "2026-06-09", "time_slot": "09:30-09:45"},
            schedule_data=manage_templates_data,
        )
        self.assertTrue(check_conflicts_result["success"])
        self.assertTrue(check_conflicts_result["hasConflicts"])
        self.assertNotIn("shouldRefresh", check_conflicts_result)

    def test_task_and_big_task_proposals_write_data(self):
        update_task_result, written_task_data = self._approve(
            {
                "type": "update_task",
                "date": "2026-06-09",
                "oldTaskName": "写实验报告",
                "newTaskName": "完成实验报告",
                "newEstimatedMinutes": 90,
            }
        )
        self.assertTrue(update_task_result["success"])
        self.assertEqual(written_task_data["schedules"]["2026-06-09"]["tasks"][0]["name"], "完成实验报告")
        self.assertEqual(written_task_data["schedules"]["2026-06-09"]["tasks"][0]["estimated"], "90")

        update_big_task_result, written_big_task_data = self._approve(
            {
                "type": "update_big_task",
                "oldTaskName": "课程设计",
                "newTaskName": "课程设计终稿",
                "newEstimatedMinutes": 300,
                "newDdl": "2026-06-25",
                "newTaskType": "long",
                "newStartDate": "2026-06-10",
                "newNote": "进入实现阶段",
            }
        )
        self.assertTrue(update_big_task_result["success"])
        self.assertEqual(written_big_task_data["bigTasks"][0]["name"], "课程设计终稿")
        self.assertEqual(written_big_task_data["bigTasks"][0]["ddl"], "2026-06-25")

    def test_task_and_big_task_delete_proposals_write_data(self):
        delete_task_result, written_task_data = self._approve(
            {
                "type": "delete_task",
                "date": "2026-06-09",
                "taskName": "写实验报告",
            }
        )
        self.assertTrue(delete_task_result["success"])
        self.assertEqual(written_task_data["schedules"]["2026-06-09"]["tasks"], [])

        batch_task_data = copy.deepcopy(self.base_data)
        batch_task_data["schedules"]["2026-06-09"]["tasks"].append(
            {"name": "整理笔记", "estimated": "30", "actual": "", "note": "", "completed": False}
        )
        batch_task_data["schedules"]["2026-06-10"]["tasks"] = [
            {"name": "预习物理", "estimated": "20", "actual": "", "note": "", "completed": False}
        ]
        batch_delete_tasks_result, written_batch_task_data = self._approve(
            {
                "type": "batch_delete_tasks",
                "tasks": [
                    {"date": "2026-06-09", "task_name": "写实验报告"},
                    {"date": "2026-06-10", "task_name": "预习物理"},
                ],
            },
            data=batch_task_data,
        )
        self.assertTrue(batch_delete_tasks_result["success"])
        self.assertEqual(batch_delete_tasks_result["deletedCount"], 2)
        self.assertEqual([task["name"] for task in written_batch_task_data["schedules"]["2026-06-09"]["tasks"]], ["整理笔记"])
        self.assertEqual(written_batch_task_data["schedules"]["2026-06-10"]["tasks"], [])

        delete_big_task_result, written_big_task_data = self._approve(
            {
                "type": "delete_big_task",
                "taskName": "课程设计",
            }
        )
        self.assertTrue(delete_big_task_result["success"])
        self.assertEqual(written_big_task_data["bigTasks"], [])

        batch_big_task_data = copy.deepcopy(self.base_data)
        batch_big_task_data["bigTasks"].append(
            {
                "name": "期末复习",
                "estimated": 300,
                "ddl": "2026-06-28",
                "taskType": "short",
                "startDate": "",
                "note": "整理提纲",
                "completed": False,
            }
        )
        batch_delete_big_tasks_result, written_batch_big_task_data = self._approve(
            {
                "type": "batch_delete_big_tasks",
                "taskNames": ["课程设计", "期末复习"],
            },
            data=batch_big_task_data,
        )
        self.assertTrue(batch_delete_big_tasks_result["success"])
        self.assertEqual(written_batch_big_task_data["bigTasks"], [])

    def test_schedule_course_and_template_proposals_write_data(self):
        batch_modify_result, written_schedule_data = self._approve(
            {
                "type": "batch_modify_schedules",
                "operation": "update_all_matching",
                "criteria": {"activity": "高数"},
                "newDetails": {"activity": "高等数学"},
            }
        )
        self.assertTrue(batch_modify_result["success"])
        self.assertEqual(written_schedule_data["schedules"]["2026-06-09"]["timeSlots"][0]["activity"], "高等数学")

        modify_course_result, written_course_data = self._approve(
            {
                "type": "modify_course",
                "oldCourseInfo": {"name": "高数", "weekday": 1, "time": "09:00-10:00"},
                "newCourseInfo": {"name": "高等数学A", "time": "09:30-10:30", "location": "A102"},
            }
        )
        self.assertTrue(modify_course_result["success"])
        updated_slot = written_course_data["schedules"]["2026-06-09"]["timeSlots"][0]
        self.assertEqual(updated_slot["activity"], "高等数学A")
        self.assertEqual(updated_slot["time"], "09:30-10:30")
        self.assertIn("A102", updated_slot["detail"])

        apply_template_result, written_template_data = self._approve(
            {
                "type": "apply_template",
                "templateName": "考试周模板",
                "targetDate": "2026-06-09",
                "templateData": copy.deepcopy(self.base_data["scheduleTemplates"][0]),
            }
        )
        self.assertTrue(apply_template_result["success"])
        applied_slots = written_template_data["schedules"]["2026-06-09"]["timeSlots"]
        self.assertTrue(any(slot["activity"] == "线性代数" for slot in applied_slots))
        self.assertTrue(any(slot["activity"] == "概率论" for slot in applied_slots))

    def test_remove_course_and_swap_courses_proposals_write_data(self):
        remove_course_result, written_remove_data = self._approve(
            {
                "type": "remove_course",
                "courseName": "高数",
                "weekday": 1,
                "time": "09:00-10:00",
            }
        )
        self.assertTrue(remove_course_result["success"])
        self.assertEqual(written_remove_data["schedules"]["2026-06-09"]["timeSlots"], [
            {"time": "14:00-15:00", "activity": "英语", "detail": "B201 * 李老师", "icon": "📚"}
        ])

        swap_data = copy.deepcopy(self.base_data)
        swap_data["schedules"]["2026-06-10"]["timeSlots"].append(
            {"time": "15:00-16:00", "activity": "化学", "detail": "D401 * 赵老师", "icon": "📚"}
        )
        swap_courses_result, written_swap_data = self._approve(
            {
                "type": "swap_courses",
                "course1": {"date": "2026-06-09", "name": "高数", "time": "09:00-10:00"},
                "course2": {"date": "2026-06-10", "name": "大学物理", "time": "10:00-11:00"},
            },
            data=swap_data,
        )
        self.assertTrue(swap_courses_result["success"])
        self.assertEqual(written_swap_data["schedules"]["2026-06-09"]["timeSlots"][0]["activity"], "大学物理")
        self.assertEqual(written_swap_data["schedules"]["2026-06-10"]["timeSlots"][0]["activity"], "高数")

    def test_generic_modify_schedule_proposals_cover_success_and_failure_paths(self):
        delete_slots_result, written_delete_slots_data = self._approve(
            {
                "type": "modify_schedule",
                "date": "2026-06-09",
                "operation": "delete_slots",
                "timeSlots": ["高数"],
            }
        )
        self.assertTrue(delete_slots_result["success"])
        self.assertEqual([slot["activity"] for slot in written_delete_slots_data["schedules"]["2026-06-09"]["timeSlots"]], ["英语"])

        modify_title_result, written_modify_title_data = self._approve(
            {
                "type": "modify_schedule",
                "date": "2026-06-09",
                "operation": "modify_title",
                "title": "全新标题",
            }
        )
        self.assertTrue(modify_title_result["success"])
        self.assertEqual(written_modify_title_data["schedules"]["2026-06-09"]["title"], "全新标题")

        add_slot_result, written_add_slot_data = self._approve(
            {
                "type": "modify_schedule",
                "date": "2026-06-09",
                "operation": "add_slot",
                "newSlotDetails": {"time": "18:00-19:00", "activity": "夜跑", "detail": "操场", "icon": "🏃"},
            }
        )
        self.assertTrue(add_slot_result["success"])
        self.assertEqual(written_add_slot_data["schedules"]["2026-06-09"]["timeSlots"][-1]["activity"], "夜跑")

        replace_slot_result, written_replace_slot_data = self._approve(
            {
                "type": "modify_schedule",
                "date": "2026-06-09",
                "operation": "replace_slot",
                "timeSlots": ["英语"],
                "newSlotDetails": {"time": "16:00-17:00", "activity": "英语口语", "detail": "线上", "icon": "🎧"},
            }
        )
        self.assertTrue(replace_slot_result["success"])
        self.assertTrue(any(slot["activity"] == "英语口语" for slot in written_replace_slot_data["schedules"]["2026-06-09"]["timeSlots"]))

        general_adjustment_result, written_general_adjustment_data = self._approve(
            {
                "type": "modify_schedule",
                "date": "2026-06-09",
                "operation": "general_adjustment",
                "title": "压缩安排",
                "changes": ["下午减少 30 分钟机动时间", "晚间留给复盘"],
            }
        )
        self.assertTrue(general_adjustment_result["success"])
        self.assertEqual(written_general_adjustment_data["schedules"]["2026-06-09"]["title"], "压缩安排")
        self.assertIn("下午减少 30 分钟机动时间", written_general_adjustment_data["schedules"]["2026-06-09"]["highlights"])

        modify_slot_fail_result, written_fail_data = self._approve(
            {
                "type": "modify_schedule",
                "date": "2026-06-09",
                "operation": "modify_slot",
                "timeSlots": ["不存在的课程"],
                "newSlotDetails": {"activity": "占位"},
            }
        )
        self.assertFalse(modify_slot_fail_result["success"])
        self.assertIn("未找到需要修改的日程项", modify_slot_fail_result["error"])
        self.assertIsNone(written_fail_data)

    def test_unsupported_course_proposals_fail_explicitly(self):
        adjust_week_result, written_adjust_week_data = self._approve(
            {
                "type": "adjust_schedule_by_week",
                "sourceDate": "2026-06-09",
                "targetDate": "2026-06-16",
            }
        )
        self.assertFalse(adjust_week_result["success"])
        self.assertIn("暂不支持按周调整课表", adjust_week_result["error"])
        self.assertIsNone(written_adjust_week_data)

        import_course_result, written_import_course_data = self._approve(
            {
                "type": "import_course_schedule",
                "scheduleText": "周二 1-2 节 高数",
            }
        )
        self.assertFalse(import_course_result["success"])
        self.assertIn("暂不支持通过审批直接导入课表文本", import_course_result["error"])
        self.assertIsNone(written_import_course_data)

        batch_manage_result, written_batch_manage_data = self._approve(
            {
                "type": "batch_manage_courses",
                "operation": "change_time_all",
                "courses": [{"name": "高数", "time": "09:00-10:00"}],
                "newTimeSlot": "15:00-16:00",
            }
        )
        self.assertFalse(batch_manage_result["success"])
        self.assertIn("暂不支持批量课程操作", batch_manage_result["error"])
        self.assertIsNone(written_batch_manage_data)

    def test_batch_manage_courses_delete_multiple_removes_all_matches(self):
        base = copy.deepcopy(self.base_data)
        base["schedules"]["2026-06-09"]["timeSlots"].append(
            {"time": "11:00-12:00", "activity": "线性代数", "detail": "D401 * 赵老师", "icon": "📚"}
        )

        result, written = self._approve(
            {
                "type": "batch_manage_courses",
                "operation": "delete_multiple",
                "courses": [
                    {"name": "高数", "weekday": 1, "time": "09:00-10:00"},
                    {"name": "线性代数", "weekday": 1, "time": "11:00-12:00"},
                ],
                "reason": "清理不上的课",
            },
            data=base,
        )
        self.assertTrue(result["success"])
        self.assertEqual(result["deletedCount"], 2)
        self.assertIn("2026-06-09", result["affectedDates"])
        remaining_activities = [slot["activity"] for slot in written["schedules"]["2026-06-09"]["timeSlots"]]
        self.assertNotIn("高数", remaining_activities)
        self.assertNotIn("线性代数", remaining_activities)
        self.assertIn("英语", remaining_activities)

        empty_result, written_empty = self._approve(
            {
                "type": "batch_manage_courses",
                "operation": "delete_multiple",
                "courses": [],
            },
            data=base,
        )
        self.assertFalse(empty_result["success"])
        self.assertIn("缺少 courses", empty_result["error"])
        self.assertIsNone(written_empty)

    def test_unsupported_schedule_proposal_fails_explicitly(self):
        result, written_data = self._approve(
            {
                "type": "modify_schedule",
                "date": "2026-06-09",
                "operation": "archive_slot",
            }
        )
        self.assertFalse(result["success"])
        self.assertIn("未实现的日程提案操作", result["error"])
        self.assertIsNone(written_data)

    def test_manage_courses_add_accepts_one_based_weekday(self):
        result, mutated_data = self._execute_tool(
            "manage_courses",
            {
                "action": "add",
                "course_name": "线性代数",
                "weekday": 1,
                "time": "08:00-09:00",
                "start_date": "2026-06-15",
                "end_date": "2026-06-15",
            },
        )
        self.assertTrue(result["success"])
        self.assertEqual(
            mutated_data["schedules"]["2026-06-15"]["timeSlots"][0]["activity"],
            "线性代数",
        )

    def test_manage_courses_add_template_cell_and_list(self):
        result, mutated_data = self._execute_tool(
            "manage_courses",
            {
                "action": "add",
                "course_cell": {
                    "template_name": "考试周模板",
                    "week_type": "odd",
                    "weekday": 2,
                    "section_start": 1,
                    "section_end": 2,
                    "course_name": "离散数学",
                    "location": "教二-101",
                    "teacher": "陈老师",
                    "note": "需要签到",
                },
            },
        )
        self.assertTrue(result["success"])
        self.assertTrue(result["shouldRefresh"])
        template = mutated_data["scheduleTemplates"][0]
        self.assertEqual(
            template["oddWeekCourses"]["0-1"],
            {
                "course": "离散数学",
                "mergeSpan": 2,
                "location": "教二-101",
                "teacher": "陈老师",
                "note": "需要签到",
            },
        )

        list_result, _ = self._execute_tool(
            "manage_courses",
            {
                "action": "list",
                "template_name": "考试周模板",
                "week_type": "odd",
            },
            schedule_data=mutated_data,
        )
        self.assertTrue(list_result["success"])
        self.assertTrue(any(cell["courseName"] == "离散数学" for cell in list_result["cells"]))

    def test_template_course_cell_proposals_write_template_data(self):
        modify_result, written_modify_data = self._approve(
            {
                "type": "modify_template_course",
                "oldCourseCell": {
                    "templateName": "考试周模板",
                    "weekType": "odd",
                    "weekday": 1,
                    "sectionStart": 1,
                    "sectionEnd": 1,
                    "courseName": "线性代数",
                },
                "newCourseCell": {
                    "templateName": "考试周模板",
                    "weekType": "even",
                    "weekday": 2,
                    "sectionStart": 1,
                    "sectionEnd": 2,
                    "courseName": "高等代数",
                    "location": "A303",
                    "teacher": "周老师",
                    "note": "双周上课",
                },
            }
        )
        self.assertTrue(modify_result["success"])
        template = written_modify_data["scheduleTemplates"][0]
        self.assertEqual(
            template["oddWeekCourses"],
            {"1-0": {"course": "概率论", "mergeSpan": 1}},
        )
        self.assertEqual(
            template["evenWeekCourses"]["0-1"],
            {
                "course": "高等代数",
                "mergeSpan": 2,
                "location": "A303",
                "teacher": "周老师",
                "note": "双周上课",
            },
        )

        remove_result, written_remove_data = self._approve(
            {
                "type": "remove_template_course",
                "courseCell": {
                    "templateName": "考试周模板",
                    "weekType": "odd",
                    "weekday": 1,
                    "sectionStart": 1,
                    "sectionEnd": 1,
                    "courseName": "线性代数",
                },
            }
        )
        self.assertTrue(remove_result["success"])
        self.assertEqual(
            written_remove_data["scheduleTemplates"][0]["oddWeekCourses"],
            {"1-0": {"course": "概率论", "mergeSpan": 1}},
        )

    def test_api_courses_supports_current_and_legacy_slot_fields(self):
        data = data_guard.normalize_schedule_data(
            {
                "schedules": {
                    "2026-06-15": {
                        "title": "",
                        "highlights": "",
                        "milestone": "",
                        "timeSlots": [
                            {"time": "08:00-09:30", "activity": "高数", "detail": "A101 * 张老师 * 1-16周"},
                            {
                                "startTime": "10:00",
                                "endTime": "11:00",
                                "name": "英语",
                                "location": "B201",
                                "type": "course",
                            },
                        ],
                        "tasks": [],
                    }
                }
            }
        )
        with mock.patch.object(server, "_read_schedule_data", return_value=data):
            response = asyncio.run(server.api_courses())
        payload = json.loads(response.body)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["count"], 2)
        first_course = payload["courses"][0]
        self.assertEqual(first_course["name"], "高数")
        self.assertEqual(first_course["startTime"], "08:00")
        self.assertEqual(first_course["endTime"], "09:30")
        self.assertEqual(first_course["location"], "A101")
        self.assertEqual(first_course["teacher"], "张老师")
        self.assertEqual(first_course["weeks"], "1-16周")

    def test_apply_template_respects_template_end_date(self):
        data = data_guard.normalize_schedule_data(
            {
                "scheduleTemplates": [
                    {
                        "name": "短学期模板",
                        "startDate": "2026-06-15",
                        "endDate": "2026-06-28",
                        "totalWeeks": 4,
                        "timeSlots": [
                            {"label": "第1节", "startTime": "08:00", "endTime": "08:45"},
                        ],
                        "oddWeekCourses": {
                            "0-0": {"course": "高数", "mergeSpan": 1, "location": "A101"},
                        },
                        "evenWeekCourses": {},
                    }
                ]
            }
        )

        proposal = {
            "type": "apply_template",
            "templateName": "短学期模板",
            "targetDate": "2026-06-29",
        }
        result, written_data = self._approve(proposal, data=data)
        self.assertFalse(result["success"])
        self.assertIn("结束日期", result["error"])
        self.assertIsNone(written_data)

    def test_startup_scan_includes_tasks_embedded_in_schedule(self):
        fixed_now = server.datetime(2026, 6, 10, 9, 0, tzinfo=server.timezone(server.timedelta(hours=8)))
        data = data_guard.normalize_schedule_data(
            {
                "schedules": {
                    "2026-06-09": {
                        "title": "",
                        "highlights": "",
                        "milestone": "",
                        "timeSlots": [],
                        "tasks": [
                            {"name": "补昨天遗漏任务", "estimated": "45", "completed": False},
                        ],
                    }
                }
            }
        )

        class FixedDateTime(server.datetime):
            @classmethod
            def now(cls, tz=None):
                if tz is None:
                    return fixed_now
                return fixed_now.astimezone(tz)

        with mock.patch.object(server, "_read_schedule_data", return_value=data):
            with mock.patch.object(server, "datetime", FixedDateTime):
                response = asyncio.run(server.startup_scan())
        payload = json.loads(response.body)
        self.assertEqual(payload["today"], "2026-06-10")
        self.assertEqual(
            payload["yesterdayIncompleteTasks"],
            [{"name": "补昨天遗漏任务", "estimated": "45", "type": "task"}],
        )

    def test_build_system_prompt_uses_correct_weekday_name(self):
        fixed_now = server.datetime(2026, 6, 8, 9, 0, tzinfo=server.timezone(server.timedelta(hours=8)))

        class FixedDateTime(server.datetime):
            @classmethod
            def now(cls, tz=None):
                if tz is None:
                    return fixed_now
                return fixed_now.astimezone(tz)

        with mock.patch.object(server, "datetime", FixedDateTime):
            prompt = server._build_system_prompt("")
        self.assertIn("今天是 2026-06-08（周一）", prompt)
        self.assertNotIn("今天是 2026-06-08（周日）", prompt)


if __name__ == "__main__":
    unittest.main()
