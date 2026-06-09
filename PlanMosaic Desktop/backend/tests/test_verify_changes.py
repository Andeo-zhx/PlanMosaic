"""自检工具 verify_changes 的单元测试。

覆盖 5 个用例：
- 单条断言通过
- 单条断言失败
- 批量断言通过
- 批量断言部分失败
- 日期不存在
"""
import copy
import json
import os
import pathlib
import sys
import unittest

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[3]
DESKTOP_ROOT = PROJECT_ROOT / "PlanMosaic Desktop"
if str(DESKTOP_ROOT) not in sys.path:
    sys.path.insert(0, str(DESKTOP_ROOT))

from backend import data_guard, tool_executor  # noqa: E402


class VerifyChangesToolTest(unittest.TestCase):
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
                "bigTasks": [],
                "scheduleTemplates": [],
            }
        )

    def _invoke(self, args, schedule_data=None):
        working = schedule_data if schedule_data is not None else copy.deepcopy(self.base_data)
        raw = tool_executor.execute_tool_call(
            {"function": {"name": "verify_changes", "arguments": json.dumps(args, ensure_ascii=False)}},
            working,
        )
        return json.loads(raw)

    # ---------- 用例 1：单条断言通过 ----------
    def test_single_assertion_pass(self):
        # 先写入一个新时间段
        add_result = tool_executor.execute_tool_call(
            {
                "function": {
                    "name": "add_schedule",
                    "arguments": json.dumps(
                        {
                            "date": "2026-06-11",
                            "timeSlots": [{"time": "15:00-16:00", "activity": "开会", "detail": "项目评审"}],
                        },
                        ensure_ascii=False,
                    ),
                }
            },
            copy.deepcopy(self.base_data),
        )
        self.assertTrue(json.loads(add_result)["success"])
        updated = copy.deepcopy(self.base_data)
        updated["schedules"]["2026-06-11"] = {
            "title": "",
            "highlights": "",
            "milestone": "",
            "timeSlots": [
                {"time": "15:00-16:00", "activity": "开会", "detail": "项目评审", "icon": "📌"},
            ],
            "tasks": [],
        }

        res = self._invoke(
            {
                "date": "2026-06-11",
                "slotKey": "15:00-16:00",
                "expect": {"slotExists": True, "activity": "开会"},
            },
            schedule_data=updated,
        )
        self.assertTrue(res["passed"], msg=res)
        self.assertEqual(res["passed_count"], 2)
        self.assertEqual(res["total_count"], 2)
        self.assertEqual(res["source"], "memory")
        keys = {a["key"] for a in res["assertions"]}
        self.assertIn("slotExists", keys)
        self.assertIn("activity", keys)

    # ---------- 用例 2：单条断言失败 ----------
    def test_single_assertion_fail_on_mismatch(self):
        res = self._invoke(
            {
                "date": "2026-06-10",
                "slotKey": "10:00-11:00",
                "expect": {"activity": "高数"},
            },
            schedule_data=copy.deepcopy(self.base_data),
        )
        self.assertFalse(res["passed"])
        self.assertEqual(res["passed_count"], 0)
        self.assertEqual(res["total_count"], 1)
        self.assertEqual(res["assertions"][0]["key"], "activity")
        self.assertEqual(res["assertions"][0]["actual"], "大学物理")
        self.assertEqual(res["assertions"][0]["expected"], "高数")

    # ---------- 用例 3：批量断言通过 ----------
    def test_batch_assertions_all_pass(self):
        # 先在 3 个日期各写入一段
        for offset, (act, det) in enumerate(
            [("晨跑", "5km"), ("健身", "胸肌"), ("瑜伽", "拉伸")]
        ):
            day = f"2026-06-1{2 + offset}"
            self.base_data["schedules"][day] = {
                "title": "",
                "highlights": "",
                "milestone": "",
                "timeSlots": [{"time": "07:00-08:00", "activity": act, "detail": det, "icon": "🏃"}],
                "tasks": [],
            }

        assertions = []
        for offset, (act, _) in enumerate(
            [("晨跑", "5km"), ("健身", "胸肌"), ("瑜伽", "拉伸")]
        ):
            day = f"2026-06-1{2 + offset}"
            assertions.append(
                {
                    "date": day,
                    "slotKey": "07:00-08:00",
                    "expect": {"activity": act},
                }
            )

        res = self._invoke({"assertions": assertions})
        self.assertTrue(res["passed"], msg=res)
        self.assertEqual(res["passed_count"], 3)
        self.assertEqual(res["total_count"], 3)
        self.assertEqual(res["source"], "memory")

    # ---------- 用例 4：批量断言部分失败 ----------
    def test_batch_assertions_partial_fail(self):
        # 准备：2026-06-12 存在 "07:00-08:00 / 阅读"，2026-06-13 不存在
        self.base_data["schedules"]["2026-06-12"] = {
            "title": "",
            "highlights": "",
            "milestone": "",
            "timeSlots": [
                {"time": "07:00-08:00", "activity": "阅读", "detail": "《代码大全》", "icon": "📖"},
            ],
            "tasks": [],
        }

        assertions = [
            {"date": "2026-06-12", "slotKey": "07:00-08:00", "expect": {"activity": "阅读"}},
            {"date": "2026-06-13", "slotKey": "07:00-08:00", "expect": {"activity": "写作"}},
            {"date": "2026-06-12", "slotKey": "07:00-08:00", "expect": {"activity": "错误的活动"}},
        ]

        res = self._invoke({"assertions": assertions})
        self.assertFalse(res["passed"])
        self.assertEqual(res["total_count"], 3)
        self.assertEqual(res["passed_count"], 1)
        reasons = [a.get("reason", "") for a in res["assertions"] if not a["pass"]]
        # 第二条断言：日期不存在
        self.assertTrue(any("无该日期" in r for r in reasons))
        # 第三条断言：活动不匹配
        self.assertTrue(any(a.get("key") == "activity" and a.get("actual") == "阅读" for a in res["assertions"]))

    # ---------- 用例 5：日期不存在 ----------
    def test_date_not_found(self):
        res = self._invoke(
            {
                "date": "2099-01-01",
                "expect": {"slotExists": True},
            },
        )
        self.assertFalse(res["passed"])
        self.assertEqual(res["passed_count"], 0)
        self.assertEqual(res["total_count"], 1)
        self.assertIn("无该日期", res["assertions"][0]["reason"])

    # ---------- 补充用例：参数缺失 ----------
    def test_missing_arguments(self):
        res = self._invoke({})
        self.assertFalse(res["passed"])
        self.assertIn("缺少参数", res.get("error", ""))

    # ---------- 补充用例：slotExists=false 用于校验删除 ----------
    def test_slot_exists_false_for_delete(self):
        res = self._invoke(
            {
                "date": "2026-06-09",
                "slotKey": "99:00-99:00",
                "expect": {"slotExists": False},
            },
        )
        self.assertTrue(res["passed"], msg=res)
        self.assertEqual(res["passed_count"], 1)


if __name__ == "__main__":
    unittest.main()
