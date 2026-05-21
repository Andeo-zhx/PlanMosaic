package com.example.planmosaic_android.util.agent

import kotlinx.serialization.json.*

object ToolDefinitions {

    val AI_TOOLS_JSON: List<JsonObject> = listOf(
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "view_schedule")
                put("description", "查看日程。获取指定日期的详细安排，或列出所有有安排的日期，或按关键词搜索。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("date", buildJsonObject { put("type", "string"); put("description", "查看指定日期，YYYY-MM-DD格式") })
                        put("list_all", buildJsonObject { put("type", "boolean"); put("description", "为true时列出所有有安排的日期") })
                        put("keyword", buildJsonObject { put("type", "string"); put("description", "搜索关键词") })
                    })
                })
            })
        },
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "add_schedule")
                put("description", "添加日程安排。支持单次添加和周期性重复添加。直接添加，不需要确认。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("date", buildJsonObject { put("type", "string"); put("description", "目标日期YYYY-MM-DD") })
                        put("start_date", buildJsonObject { put("type", "string"); put("description", "开始日期（周期性添加时必填）") })
                        put("end_date", buildJsonObject { put("type", "string"); put("description", "结束日期（周期性添加时必填）") })
                        put("repeat_pattern", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf("daily", "weekly", "weekdays").map { JsonPrimitive(it) }))
                                    put("description", "重复模式")
                                })
                                put("weekdays", buildJsonObject {
                                    put("type", "array")
                                    put("items", buildJsonObject { put("type", "integer") })
                                    put("description", "星期几(0=周日)")
                                })
                        put("timeSlots", buildJsonObject {
                                    put("type", "array")
                                    put("items", buildJsonObject {
                                        put("type", "object")
                                        put("properties", buildJsonObject {
                                            put("time", buildJsonObject { put("type", "string") })
                                            put("activity", buildJsonObject { put("type", "string") })
                                            put("detail", buildJsonObject { put("type", "string") })
                                            put("icon", buildJsonObject { put("type", "string") })
                                        })
                                        put("required", JsonArray(listOf("time", "activity").map { JsonPrimitive(it) }))
                                    })
                                    put("description", "时间段数组")
                                })
                        put("title", buildJsonObject { put("type", "string") })
                        put("highlights", buildJsonObject { put("type", "string") })
                    })
                    put("required", JsonArray(listOf("timeSlots").map { JsonPrimitive(it) }))
                })
            })
        },
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "modify_schedule")
                put("description", "修改日程安排（需要用户确认）。支持删除、修改、添加时间段等操作。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("operation", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf(
                                        "delete_slots", "modify_slot", "add_slot",
                                        "modify_title", "general_adjustment", "delete_all_matching",
                                        "update_all_matching", "batch_delete_dates"
                                    ).map { JsonPrimitive(it) }))
                                })
                        put("date", buildJsonObject { put("type", "string"); put("description", "目标日期YYYY-MM-DD") })
                        put("changes", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","string") }) })
                        put("reason", buildJsonObject { put("type", "string") })
                        put("timeSlots", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","string") }) })
                        put("newSlotDetails", buildJsonObject {
                                    put("type", "object")
                                    put("properties", buildJsonObject {
                                        put("time", buildJsonObject { put("type", "string") })
                                        put("activity", buildJsonObject { put("type", "string") })
                                        put("detail", buildJsonObject { put("type", "string") })
                                        put("icon", buildJsonObject { put("type", "string") })
                                    })
                                })
                        put("criteria", buildJsonObject {
                                    put("type", "object")
                                    put("properties", buildJsonObject {
                                        put("keyword", buildJsonObject { put("type", "string") })
                                        put("day_of_week", buildJsonObject { put("type", "string") })
                                        put("activity", buildJsonObject { put("type", "string") })
                                    })
                                })
                        put("new_details", buildJsonObject {
                                    put("type", "object")
                                    put("properties", buildJsonObject {
                                        put("time", buildJsonObject { put("type", "string") })
                                        put("activity", buildJsonObject { put("type", "string") })
                                        put("detail", buildJsonObject { put("type", "string") })
                                    })
                                })
                        put("dates", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","string") }) })
                    })
                    put("required", JsonArray(listOf("operation","reason").map { JsonPrimitive(it) }))
                })
            })
        },
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "check_conflicts")
                put("description", "检测日程冲突。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("date", buildJsonObject { put("type", "string") })
                        put("time_slot", buildJsonObject { put("type", "string"); put("description", "HH:MM-HH:MM") })
                        put("activity", buildJsonObject { put("type", "string") })
                    })
                    put("required", JsonArray(listOf("date","time_slot").map { JsonPrimitive(it) }))
                })
            })
        },
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "manage_tasks")
                put("description", "管理日常任务。add和complete直接执行；update和delete需要确认。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf(
                                        "add", "complete", "view", "update", "delete", "batch_delete"
                                    ).map { JsonPrimitive(it) }))
                                })
                        put("date", buildJsonObject { put("type", "string") })
                        put("task_name", buildJsonObject { put("type", "string") })
                        put("estimated_minutes", buildJsonObject { put("type", "number") })
                        put("actual_minutes", buildJsonObject { put("type", "number") })
                        put("note", buildJsonObject { put("type", "string") })
                        put("new_task_name", buildJsonObject { put("type", "string") })
                        put("new_estimated_minutes", buildJsonObject { put("type", "number") })
                        put("new_note", buildJsonObject { put("type", "string") })
                        put("reason", buildJsonObject { put("type", "string") })
                        put("tasks", buildJsonObject {
                                    put("type", "array")
                                    put("items", buildJsonObject {
                                        put("type", "object")
                                        put("properties", buildJsonObject {
                                            put("date", buildJsonObject { put("type", "string") })
                                            put("task_name", buildJsonObject { put("type", "string") })
                                        })
                                        put("required", JsonArray(listOf("date", "task_name").map { JsonPrimitive(it) }))
                                    })
                                })
                    })
                    put("required", JsonArray(listOf("action").map { JsonPrimitive(it) }))
                })
            })
        },
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "manage_big_tasks")
                put("description", "管理大任务。add和complete直接执行；update和delete需要确认。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf(
                                        "add", "complete", "view", "update", "delete", "batch_delete", "break_down"
                                    ).map { JsonPrimitive(it) }))
                                })
                        put("task_name", buildJsonObject { put("type", "string") })
                        put("estimated_minutes", buildJsonObject { put("type", "number") })
                        put("ddl", buildJsonObject { put("type", "string") })
                        put("start_date", buildJsonObject { put("type", "string") })
                        put("task_type", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf("short", "long").map { JsonPrimitive(it) }))
                                })
                        put("note", buildJsonObject { put("type", "string") })
                        put("filter", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf("all", "pending", "completed", "overdue").map { JsonPrimitive(it) }))
                                })
                        put("new_task_name", buildJsonObject { put("type", "string") })
                        put("new_estimated_minutes", buildJsonObject { put("type", "number") })
                        put("new_ddl", buildJsonObject { put("type", "string") })
                        put("new_note", buildJsonObject { put("type", "string") })
                        put("reason", buildJsonObject { put("type", "string") })
                        put("task_names", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","string") }) })
                        put("subtasks", buildJsonObject {
                                    put("type", "array")
                                    put("items", buildJsonObject {
                                        put("type", "object")
                                        put("properties", buildJsonObject {
                                            put("name", buildJsonObject { put("type", "string") })
                                            put("date", buildJsonObject { put("type", "string") })
                                            put("estimated_minutes", buildJsonObject { put("type", "number") })
                                        })
                                        put("required", JsonArray(listOf("name", "date", "estimated_minutes").map { JsonPrimitive(it) }))
                                    })
                                })
                    })
                    put("required", JsonArray(listOf("action").map { JsonPrimitive(it) }))
                })
            })
        },
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "manage_courses")
                put("description", "管理课程表。创建和添加直接执行；修改和删除需要确认。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf(
                                        "create", "add", "modify", "remove", "list",
                                        "import", "export", "swap", "adjust_week",
                                        "batch_manage", "analyze_load"
                                    ).map { JsonPrimitive(it) }))
                                })
                        put("semester_name", buildJsonObject { put("type", "string") })
                        put("start_date", buildJsonObject { put("type", "string") })
                        put("end_date", buildJsonObject { put("type", "string") })
                        put("courses", buildJsonObject {
                                    put("type", "array")
                                    put("items", buildJsonObject {
                                        put("type", "object")
                                        put("properties", buildJsonObject {
                                            put("name", buildJsonObject { put("type", "string") })
                                            put("weekday", buildJsonObject { put("type", "number") })
                                            put("time", buildJsonObject { put("type", "string") })
                                            put("location", buildJsonObject { put("type", "string") })
                                            put("teacher", buildJsonObject { put("type", "string") })
                                        })
                                        put("required", JsonArray(listOf("name", "weekday", "time").map { JsonPrimitive(it) }))
                                    })
                                })
                        put("course_name", buildJsonObject { put("type", "string") })
                        put("keyword", buildJsonObject { put("type", "string") })
                        put("weekday_filter", buildJsonObject { put("type", "number") })
                        put("reason", buildJsonObject { put("type", "string") })
                        put("export_format", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf("text", "json", "markdown").map { JsonPrimitive(it) }))
                                })
                    })
                    put("required", JsonArray(listOf("action").map { JsonPrimitive(it) }))
                })
            })
        },
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "analyze")
                put("description", "智能分析和优化工具。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf(
                                        "patterns", "optimize", "ddl_status", "habits"
                                    ).map { JsonPrimitive(it) }))
                                })
                        put("period", buildJsonObject { put("type", "string") })
                        put("date", buildJsonObject { put("type", "string") })
                        put("constraints", buildJsonObject { put("type", "string") })
                        put("goals", buildJsonObject { put("type", "string") })
                        put("days_threshold", buildJsonObject { put("type", "number") })
                    })
                    put("required", JsonArray(listOf("action").map { JsonPrimitive(it) }))
                })
            })
        },
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "manage_templates")
                put("description", "管理日程模板。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf(
                                        "create", "apply", "delete", "list"
                                    ).map { JsonPrimitive(it) }))
                                })
                        put("template_name", buildJsonObject { put("type", "string") })
                        put("template_data", buildJsonObject { put("type", "object") })
                        put("target_date", buildJsonObject { put("type", "string") })
                    })
                    put("required", JsonArray(listOf("action").map { JsonPrimitive(it) }))
                })
            })
        },

        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "value_monetization")
                put("description", "价值货币化评估。将用户的抽象目标转化为可量化的货币价值指标，包括时间价值估算、机会成本分析、潜在收益规模评估等。适用于讨论职业选择、技能投资、人生目标等场景。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("goal", buildJsonObject { put("type", "string"); put("description", "用户描述的目标或方向") })
                        put("timeframe_years", buildJsonObject { put("type", "number"); put("description", "评估时间跨度（年）") })
                        put("current_investment", buildJsonObject { put("type", "string"); put("description", "当前已投入的资源（时间、金钱、精力等）") })
                        put("context", buildJsonObject { put("type", "string"); put("description", "补充背景信息") })
                    })
                    put("required", JsonArray(listOf("goal").map { JsonPrimitive(it) }))
                })
            })
        },

        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "roi_calculator")
                put("description", "时间/精力投资回报率计算器。评估某项投入（时间、金钱、精力）与预期收益的对比分析，包括短期牺牲vs长期回报、不同路径的ROI对比。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("investment_type", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf("time", "money", "effort", "mixed").map { JsonPrimitive(it) }))
                                    put("description", "投入类型")
                                })
                        put("investment_amount", buildJsonObject { put("type", "string"); put("description", "投入量描述（如\"每天2小时\"、\"10万元\"等）") })
                        put("expected_return", buildJsonObject { put("type", "string"); put("description", "预期回报描述") })
                        put("time_horizon", buildJsonObject { put("type", "string"); put("description", "回报周期（如\"3年\"、\"5年\"）") })
                        put("alternatives", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type", "string") }); put("description", "替代方案列表") })
                    })
                    put("required", JsonArray(listOf("investment_type","investment_amount","expected_return").map { JsonPrimitive(it) }))
                })
            })
        },

        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "milestone_planner")
                put("description", "里程碑拆解规划工具。将长期目标（5-10年）拆解为可量化的阶段性里程碑，每个里程碑设定可验证的成功标准，标识关键决策节点和时间线。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("long_term_goal", buildJsonObject { put("type", "string"); put("description", "长期目标描述") })
                        put("target_year", buildJsonObject { put("type", "number"); put("description", "目标达成年份（距今年数）") })
                        put("current_status", buildJsonObject { put("type", "string"); put("description", "当前状态/起点") })
                        put("constraints", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type", "string") }); put("description", "已知约束条件") })
                        put("phases", buildJsonObject { put("type", "number"); put("description", "建议拆分为几个阶段（默认4）") })
                    })
                    put("required", JsonArray(listOf("long_term_goal","target_year").map { JsonPrimitive(it) }))
                })
            })
        },

        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "swot_analysis")
                put("description", "SWOT结构化分析工具。对某个目标、决策或方向进行优势(Strengths)、劣势(Weaknesses)、机会(Opportunities)、威胁(Threats)的四象限结构化分析。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("subject", buildJsonObject { put("type", "string"); put("description", "分析对象（目标、决策、方向等）") })
                        put("user_context", buildJsonObject { put("type", "string"); put("description", "用户背景/现状") })
                        put("focus_area", buildJsonObject {
                                    put("type", "string")
                                    put("enum", JsonArray(listOf(
                                        "career", "life", "financial", "skill", "general"
                                    ).map { JsonPrimitive(it) }))
                                    put("description", "分析领域")
                                })
                    })
                    put("required", JsonArray(listOf("subject").map { JsonPrimitive(it) }))
                })
            })
        },

        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "decision_matrix")
                put("description", "多维度加权决策矩阵工具。帮助用户在多个选项之间做出理性决策，通过设定评价维度和权重，对各选项进行打分和排序。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("decision_topic", buildJsonObject { put("type", "string"); put("description", "决策主题") })
                        put("options", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type", "string") }); put("description", "待选方案列表") })
                        put("criteria", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type", "string") }); put("description", "评价维度") })
                        put("context", buildJsonObject { put("type", "string"); put("description", "决策背景补充") })
                    })
                    put("required", JsonArray(listOf("decision_topic","options").map { JsonPrimitive(it) }))
                })
            })
        }
    )

    val DEEP_PLANNING_TOOLS: List<JsonObject> = AI_TOOLS_JSON.filter { tool ->
        val name = tool["function"]?.jsonObject?.get("name")?.jsonPrimitive?.content ?: ""
        name in listOf("value_monetization", "roi_calculator", "milestone_planner", "swot_analysis", "decision_matrix", "view_schedule")
    }

    internal val TOOL_ROUTING = mapOf(
        "list_schedules" to "view_schedule", "list_all_dates" to "view_schedule",
        "search_schedules" to "view_schedule", "search_keyword" to "view_schedule",
        "get_date_schedule" to "view_schedule",
        "add_recurring_schedule" to "add_schedule",
        "propose_schedule_change" to "modify_schedule", "suggest_schedule_edit" to "modify_schedule",
        "edit_time_slot" to "modify_schedule",
        "batch_modify_schedules" to "modify_schedule", "batch_delete_schedule" to "modify_schedule",
        "detect_schedule_conflicts" to "check_conflicts",
        "add_task" to "manage_tasks", "view_tasks" to "manage_tasks",
        "complete_task" to "manage_tasks", "update_task" to "manage_tasks",
        "delete_task_proposal" to "manage_tasks", "delete_task" to "manage_tasks",
        "batch_delete_tasks" to "manage_tasks",
        "add_big_task" to "manage_big_tasks", "list_big_tasks" to "manage_big_tasks",
        "complete_big_task" to "manage_big_tasks", "update_big_task" to "manage_big_tasks",
        "delete_big_task_proposal" to "manage_big_tasks", "delete_big_task" to "manage_big_tasks",
        "batch_delete_big_tasks" to "manage_big_tasks", "break_down_big_task" to "manage_big_tasks",
        "suggest_optimization" to "analyze", "analyze_schedule_patterns" to "analyze",
        "check_ddl_status" to "analyze", "suggest_time_for_activity" to "analyze",
        "get_user_habits" to "analyze", "smart_reschedule" to "analyze",
        "create_course_schedule" to "manage_courses", "add_course" to "manage_courses",
        "modify_course" to "manage_courses", "remove_course" to "manage_courses",
        "list_courses" to "manage_courses", "swap_courses" to "manage_courses",
        "adjust_schedule_by_week" to "manage_courses", "analyze_course_load" to "manage_courses",
        "import_course_schedule" to "manage_courses", "export_course_schedule" to "manage_courses",
        "batch_manage_courses" to "manage_courses",
        "apply_schedule_template" to "manage_templates",
        "deep_value_monetization" to "value_monetization",
        "deep_roi_calculator" to "roi_calculator",
        "deep_milestone_planner" to "milestone_planner",
        "deep_swot_analysis" to "swot_analysis",
        "deep_decision_matrix" to "decision_matrix"
    )
}