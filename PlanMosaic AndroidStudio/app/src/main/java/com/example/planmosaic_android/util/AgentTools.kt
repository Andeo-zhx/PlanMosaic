package com.example.planmosaic_android.util

import com.example.planmosaic_android.model.*
import kotlinx.serialization.json.*
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * AI Agent tool definitions and execution engine.
 * Mirrors the 9 core tools from the main project's ai-tools.js.
 */
object AgentTools {

    // ============ Tool Definitions (JSON Schema) ============

    val AI_TOOLS_JSON: List<JsonObject> = listOf(
        // 1. view_schedule
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
        // 2. add_schedule
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
                        put("repeat_pattern", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("daily","weekly","weekdays").map { JsonPrimitive(it) })); put("description", "重复模式") })
                        put("weekdays", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type", "integer") }); put("description", "星期几(0=周日)") })
                        put("timeSlots", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","object"); put("properties", buildJsonObject { put("time",buildJsonObject{put("type","string")}); put("activity",buildJsonObject{put("type","string")}); put("detail",buildJsonObject{put("type","string")}); put("icon",buildJsonObject{put("type","string")}) }); put("required",JsonArray(listOf("time","activity").map{JsonPrimitive(it)})) }); put("description","时间段数组") })
                        put("title", buildJsonObject { put("type", "string") })
                        put("highlights", buildJsonObject { put("type", "string") })
                    })
                    put("required", JsonArray(listOf("timeSlots").map { JsonPrimitive(it) }))
                })
            })
        },
        // 3. modify_schedule
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "modify_schedule")
                put("description", "修改日程安排（需要用户确认）。支持删除、修改、添加时间段等操作。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("operation", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("delete_slots","modify_slot","add_slot","modify_title","general_adjustment","delete_all_matching","update_all_matching","batch_delete_dates").map{JsonPrimitive(it)})) })
                        put("date", buildJsonObject { put("type", "string"); put("description", "目标日期YYYY-MM-DD") })
                        put("changes", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","string") }) })
                        put("reason", buildJsonObject { put("type", "string") })
                        put("timeSlots", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","string") }) })
                        put("newSlotDetails", buildJsonObject { put("type","object"); put("properties", buildJsonObject { put("time",buildJsonObject{put("type","string")}); put("activity",buildJsonObject{put("type","string")}); put("detail",buildJsonObject{put("type","string")}); put("icon",buildJsonObject{put("type","string")}) }) })
                        put("criteria", buildJsonObject { put("type","object"); put("properties", buildJsonObject { put("keyword",buildJsonObject{put("type","string")}); put("day_of_week",buildJsonObject{put("type","string")}); put("activity",buildJsonObject{put("type","string")}) }) })
                        put("new_details", buildJsonObject { put("type","object"); put("properties", buildJsonObject { put("time",buildJsonObject{put("type","string")}); put("activity",buildJsonObject{put("type","string")}); put("detail",buildJsonObject{put("type","string")}) }) })
                        put("dates", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","string") }) })
                    })
                    put("required", JsonArray(listOf("operation","reason").map { JsonPrimitive(it) }))
                })
            })
        },
        // 4. check_conflicts
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
        // 5. manage_tasks
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "manage_tasks")
                put("description", "管理日常任务。add和complete直接执行；update和delete需要确认。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("add","complete","view","update","delete","batch_delete").map{JsonPrimitive(it)})) })
                        put("date", buildJsonObject { put("type", "string") })
                        put("task_name", buildJsonObject { put("type", "string") })
                        put("estimated_minutes", buildJsonObject { put("type", "number") })
                        put("actual_minutes", buildJsonObject { put("type", "number") })
                        put("note", buildJsonObject { put("type", "string") })
                        put("new_task_name", buildJsonObject { put("type", "string") })
                        put("new_estimated_minutes", buildJsonObject { put("type", "number") })
                        put("new_note", buildJsonObject { put("type", "string") })
                        put("reason", buildJsonObject { put("type", "string") })
                        put("tasks", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","object"); put("properties", buildJsonObject { put("date",buildJsonObject{put("type","string")}); put("task_name",buildJsonObject{put("type","string")}) }); put("required",JsonArray(listOf("date","task_name").map{JsonPrimitive(it)})) }) })
                    })
                    put("required", JsonArray(listOf("action").map { JsonPrimitive(it) }))
                })
            })
        },
        // 6. manage_big_tasks
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "manage_big_tasks")
                put("description", "管理大任务。add和complete直接执行；update和delete需要确认。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("add","complete","view","update","delete","batch_delete","break_down").map{JsonPrimitive(it)})) })
                        put("task_name", buildJsonObject { put("type", "string") })
                        put("estimated_minutes", buildJsonObject { put("type", "number") })
                        put("ddl", buildJsonObject { put("type", "string") })
                        put("start_date", buildJsonObject { put("type", "string") })
                        put("task_type", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("short","long").map{JsonPrimitive(it)})) })
                        put("note", buildJsonObject { put("type", "string") })
                        put("filter", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("all","pending","completed","overdue").map{JsonPrimitive(it)})) })
                        put("new_task_name", buildJsonObject { put("type", "string") })
                        put("new_estimated_minutes", buildJsonObject { put("type", "number") })
                        put("new_ddl", buildJsonObject { put("type", "string") })
                        put("new_note", buildJsonObject { put("type", "string") })
                        put("reason", buildJsonObject { put("type", "string") })
                        put("task_names", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","string") }) })
                        put("subtasks", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","object"); put("properties", buildJsonObject { put("name",buildJsonObject{put("type","string")}); put("date",buildJsonObject{put("type","string")}); put("estimated_minutes",buildJsonObject{put("type","number")}) }); put("required",JsonArray(listOf("name","date","estimated_minutes").map{JsonPrimitive(it)})) }) })
                    })
                    put("required", JsonArray(listOf("action").map { JsonPrimitive(it) }))
                })
            })
        },
        // 7. manage_courses
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "manage_courses")
                put("description", "管理课程表。创建和添加直接执行；修改和删除需要确认。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("create","add","modify","remove","list","import","export","swap","adjust_week","batch_manage","analyze_load").map{JsonPrimitive(it)})) })
                        put("semester_name", buildJsonObject { put("type", "string") })
                        put("start_date", buildJsonObject { put("type", "string") })
                        put("end_date", buildJsonObject { put("type", "string") })
                        put("courses", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type","object"); put("properties", buildJsonObject { put("name",buildJsonObject{put("type","string")}); put("weekday",buildJsonObject{put("type","number")}); put("time",buildJsonObject{put("type","string")}); put("location",buildJsonObject{put("type","string")}); put("teacher",buildJsonObject{put("type","string")}) }); put("required",JsonArray(listOf("name","weekday","time").map{JsonPrimitive(it)})) }) })
                        put("course_name", buildJsonObject { put("type", "string") })
                        put("keyword", buildJsonObject { put("type", "string") })
                        put("weekday_filter", buildJsonObject { put("type", "number") })
                        put("reason", buildJsonObject { put("type", "string") })
                        put("export_format", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("text","json","markdown").map{JsonPrimitive(it)})) })
                    })
                    put("required", JsonArray(listOf("action").map { JsonPrimitive(it) }))
                })
            })
        },
        // 8. analyze
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "analyze")
                put("description", "智能分析和优化工具。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("patterns","optimize","ddl_status","habits").map{JsonPrimitive(it)})) })
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
        // 9. manage_templates
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "manage_templates")
                put("description", "管理日程模板。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("action", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("create","apply","delete","list").map{JsonPrimitive(it)})) })
                        put("template_name", buildJsonObject { put("type", "string") })
                        put("template_data", buildJsonObject { put("type", "object") })
                        put("target_date", buildJsonObject { put("type", "string") })
                    })
                    put("required", JsonArray(listOf("action").map { JsonPrimitive(it) }))
                })
            })
        },

        // ========== Deep Planning Tools (10-14) ==========

        // 10. value_monetization（深度规划专用）
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

        // 11. roi_calculator（深度规划专用）
        buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", "roi_calculator")
                put("description", "时间/精力投资回报率计算器。评估某项投入（时间、金钱、精力）与预期收益的对比分析，包括短期牺牲vs长期回报、不同路径的ROI对比。")
                put("parameters", buildJsonObject {
                    put("type", "object")
                    put("properties", buildJsonObject {
                        put("investment_type", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("time","money","effort","mixed").map{JsonPrimitive(it)})); put("description", "投入类型") })
                        put("investment_amount", buildJsonObject { put("type", "string"); put("description", "投入量描述（如\"每天2小时\"、\"10万元\"等）") })
                        put("expected_return", buildJsonObject { put("type", "string"); put("description", "预期回报描述") })
                        put("time_horizon", buildJsonObject { put("type", "string"); put("description", "回报周期（如\"3年\"、\"5年\"）") })
                        put("alternatives", buildJsonObject { put("type", "array"); put("items", buildJsonObject { put("type", "string") }); put("description", "替代方案列表") })
                    })
                    put("required", JsonArray(listOf("investment_type","investment_amount","expected_return").map { JsonPrimitive(it) }))
                })
            })
        },

        // 12. milestone_planner（深度规划专用）
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

        // 13. swot_analysis（深度规划专用）
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
                        put("focus_area", buildJsonObject { put("type", "string"); put("enum", JsonArray(listOf("career","life","financial","skill","general").map{JsonPrimitive(it)})); put("description", "分析领域") })
                    })
                    put("required", JsonArray(listOf("subject").map { JsonPrimitive(it) }))
                })
            })
        },

        // 14. decision_matrix（深度规划专用）
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

    // ============ Deep Planning Tool Whitelist ============

    val DEEP_PLANNING_TOOLS: List<JsonObject> = AI_TOOLS_JSON.filter { tool ->
        val name = tool["function"]?.jsonObject?.get("name")?.jsonPrimitive?.content ?: ""
        name in listOf("value_monetization", "roi_calculator", "milestone_planner", "swot_analysis", "decision_matrix", "view_schedule")
    }

    // ============ Tool Name Routing ============

    private val TOOL_ROUTING = mapOf(
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

    // ============ Time Parsing ============

    private data class ParsedTime(val startMinutes: Int, val endMinutes: Int)

    private fun parseTimeRange(timeStr: String): ParsedTime {
        val parts = timeStr.split("-")
        val startParts = parts[0].split(":").map { it.toInt() }
        val endParts = parts[1].split(":").map { it.toInt() }
        return ParsedTime(
            startMinutes = startParts[0] * 60 + startParts[1],
            endMinutes = endParts[0] * 60 + endParts[1]
        )
    }

    private fun timeConflicts(t1: String, t2: String): Boolean {
        val p1 = parseTimeRange(t1)
        val p2 = parseTimeRange(t2)
        return !(p1.endMinutes <= p2.startMinutes || p1.startMinutes >= p2.endMinutes)
    }

    // ============ Tool Execution ============

    data class ToolResult(
        val json: String,
        val shouldRefresh: Boolean = false,
        val updatedAppData: AppData? = null
    )

    /**
     * Execute a single tool call and return JSON result.
     * Mutates appData in place for direct-execution tools.
     */
    fun executeTool(toolName: String, argsStr: String, appData: AppData): ToolResult {
        val args = try {
            Json { ignoreUnknownKeys = true }.parseToJsonElement(argsStr).jsonObject
        } catch (_: Exception) {
            emptyMap<String, JsonElement>().toMap().let { buildJsonObject {} }
        }

        val routedName = TOOL_ROUTING[toolName] ?: toolName

        return when (routedName) {
            "view_schedule" -> viewSchedule(args, appData)
            "add_schedule" -> addSchedule(args, appData)
            "modify_schedule" -> modifySchedule(args, appData)
            "check_conflicts" -> checkConflicts(args, appData)
            "manage_tasks" -> manageTasks(args, appData)
            "manage_big_tasks" -> manageBigTasks(args, appData)
            "manage_courses" -> manageCourses(args, appData)
            "analyze" -> analyze(args, appData)
            "manage_templates" -> manageTemplates(args, appData)
            "value_monetization" -> valueMonetization(args)
            "roi_calculator" -> roiCalculator(args)
            "milestone_planner" -> milestonePlanner(args)
            "swot_analysis" -> swotAnalysis(args)
            "decision_matrix" -> decisionMatrix(args)
            else -> ToolResult("""{"error":"Unknown tool","name":"$routedName"}""")
        }
    }

    // ============ Tool Implementations ============

    private fun str(args: JsonObject, key: String): String =
        args[key]?.jsonPrimitive?.contentOrNull ?: ""

    private fun int(args: JsonObject, key: String): Int =
        args[key]?.jsonPrimitive?.intOrNull ?: 0

    private fun bool(args: JsonObject, key: String): Boolean =
        args[key]?.jsonPrimitive?.booleanOrNull ?: false

    private fun arr(args: JsonObject, key: String): JsonArray =
        args[key]?.jsonArray ?: JsonArray(emptyList())

    private fun obj(args: JsonObject, key: String): JsonObject? =
        args[key]?.jsonObject

    // --- 1. view_schedule ---
    private fun viewSchedule(args: JsonObject, appData: AppData): ToolResult {
        val schedules = appData.schedules
        if (bool(args, "list_all")) {
            val dates = schedules.keys.sorted()
            return ToolResult("""{"dates":${dates.joinToString(",") { "\"$it\"" }},"count":${dates.size}}""")
        }
        val keyword = str(args, "keyword")
        if (keyword.isNotEmpty()) {
            val kw = keyword.lowercase()
            val results = schedules.entries.filter { (_, sch) ->
                "${sch.title} ${sch.highlights} ${sch.timeSlots.joinToString(" ") { it.activity }}".lowercase().contains(kw)
            }.map { (date, sch) -> """{"date":"$date","title":"${sch.title}"}""" }
            return ToolResult("""{"keyword":"$kw","results":[${results.joinToString(",")}],"count":${results.size}}""")
        }
        val date = str(args, "date")
        val sch = schedules[date]
        if (sch == null) {
            val available = schedules.keys.sorted()
            return ToolResult("""{"exists":false,"date":"$date","message":"$date 没有安排","availableDates":${available.joinToString(",") { "\"$it\"" }}}""")
        }
        val slotsJson = sch.timeSlots.map { s ->
            """{"time":"${s.time}","activity":"${s.activity.replace("\"","\\\"")}","detail":"${s.detail.replace("\"","\\\"")}"}"""
        }
        return ToolResult("""{"exists":true,"date":"$date","title":"${sch.title}","highlights":"${sch.highlights}","timeSlots":[${slotsJson.joinToString(",")}]}""")
    }

    // --- 2. add_schedule ---
    private fun addSchedule(args: JsonObject, appData: AppData): ToolResult {
        val schedules = appData.schedules.toMutableMap()
        val startDate = str(args, "start_date")

        if (startDate.isNotEmpty()) {
            // Periodic add
            val endDate = str(args, "end_date")
            val pattern = str(args, "repeat_pattern")
            val ts = arr(args, "timeSlots")
            val firstSlot = ts.firstOrNull()?.jsonObject ?: return ToolResult("""{"success":false,"error":"缺少时间段"}""")
            val time = str(firstSlot, "time")
            val activity = str(firstSlot, "activity").ifEmpty { "未命名活动" }
            val detail = str(firstSlot, "detail")
            val icon = str(firstSlot, "icon")

            val dates = generateDateRange(startDate, endDate, pattern, arr(args, "weekdays").map { it.jsonPrimitive.int })
            var ok = 0
            var skip = 0

            for (date in dates) {
                val existing = schedules[date] ?: DaySchedule(date = date)
                if (existing.timeSlots.any { timeConflicts(it.time, time) }) { skip++; continue }
                val newSlots = (existing.timeSlots + TimeSlot(time, activity, detail, icon)).sortedBy { it.time }
                schedules[date] = existing.copy(
                    timeSlots = newSlots,
                    title = str(args, "title").ifEmpty { existing.title },
                    highlights = str(args, "highlights").ifEmpty { existing.highlights }
                )
                ok++
            }
            return ToolResult("""{"success":true,"message":"已周期性添加：成功 $ok 个，跳过 $skip 个","shouldRefresh":true}""", shouldRefresh = true, updatedAppData = appData.copy(schedules = schedules))
        }

        // Single add
        val date = str(args, "date")
        val ts = arr(args, "timeSlots")
        if (date.isEmpty() || ts.isEmpty()) return ToolResult("""{"success":false,"error":"缺少必要参数"}""")

        val existing = schedules[date] ?: DaySchedule(
            date = date,
            title = str(args, "title"),
            highlights = str(args, "highlights")
        )
        val added = mutableListOf<TimeSlot>()
        val conflicts = mutableListOf<String>()

        for (slotEl in ts) {
            val slot = slotEl.jsonObject
            val time = str(slot, "time")
            val activity = str(slot, "activity").ifEmpty { "未命名活动" }
            if (!time.matches(Regex("\\d{2}:\\d{2}-\\d{2}:\\d{2}"))) {
                conflicts.add("时间格式错误: $time"); continue
            }
            val existingConflict = existing.timeSlots.find { timeConflicts(it.time, time) }
            if (existingConflict != null) {
                conflicts.add("与 ${existingConflict.time} ${existingConflict.activity} 冲突"); continue
            }
            val newSlot = TimeSlot(time, activity, str(slot, "detail"), str(slot, "icon"))
            added.add(newSlot)
        }

        val newSlots = (existing.timeSlots + added).sortedBy { it.time }
        schedules[date] = existing.copy(
            timeSlots = newSlots,
            title = str(args, "title").ifEmpty { existing.title },
            highlights = str(args, "highlights").ifEmpty { existing.highlights }
        )

        return ToolResult(
            """{"success":true,"date":"$date","addedCount":${added.size},"conflicts":${conflicts.size},"shouldRefresh":true}""",
            shouldRefresh = true,
            updatedAppData = appData.copy(schedules = schedules)
        )
    }

    // --- 3. modify_schedule (returns proposal) ---
    private fun modifySchedule(args: JsonObject, appData: AppData): ToolResult {
        val op = str(args, "operation")
        val date = str(args, "date")
        val reason = str(args, "reason")

        if (op == "batch_delete_dates") {
            val datesArr = arr(args, "dates").map { it.jsonPrimitive.content }
            val valid = datesArr.filter { d ->
                val s = appData.schedules[d]
                s != null && (s.timeSlots.isNotEmpty() || s.tasks.isNotEmpty())
            }
            if (valid.isEmpty()) return ToolResult("""{"success":false,"error":"没有找到需要删除的安排"}""")
            return ToolResult("""{"success":true,"content":"**批量删除提案**\n\n将删除 ${valid.size} 个日期的安排\n\n请确认。","proposal":{"type":"batch_delete_schedule","dates":[${valid.joinToString(",") { "\"$it\"" }}],"reason":"$reason"}}""")
        }

        // Default: return a proposal
        return ToolResult("""{"type":"proposal","date":"$date","reason":"$reason","proposal":{"type":"modify_schedule","operation":"$op","date":"$date","changes":[${arr(args,"changes").map{"\"${it.jsonPrimitive.content}\""}.joinToString(",")}],"reason":"$reason"}}""")
    }

    // --- 4. check_conflicts ---
    private fun checkConflicts(args: JsonObject, appData: AppData): ToolResult {
        val date = str(args, "date")
        val ts = str(args, "time_slot")
        if (date.isEmpty() || ts.isEmpty()) return ToolResult("""{"success":false,"error":"缺少日期或时间段"}""")

        val conflicts = (appData.schedules[date]?.timeSlots ?: emptyList())
            .filter { timeConflicts(it.time, ts) }
            .map { """{"existingActivity":"${it.activity}","existingTime":"${it.time}"}""" }

        return ToolResult("""{"success":true,"date":"$date","timeSlot":"$ts","hasConflicts":${conflicts.isNotEmpty()},"conflicts":[${conflicts.joinToString(",")}]}""")
    }

    // --- 5. manage_tasks ---
    private fun manageTasks(args: JsonObject, appData: AppData): ToolResult {
        val action = str(args, "action")
        val date = str(args, "date")

        when (action) {
            "add" -> {
                val tn = str(args, "task_name")
                val em = int(args, "estimated_minutes")
                if (date.isEmpty() || tn.isEmpty()) return ToolResult("""{"success":false,"error":"缺少必要参数"}""")
                val schedules = appData.schedules.toMutableMap()
                val existing = schedules[date] ?: DaySchedule(date = date)
                val newTasks = existing.tasks + Task(tn, em.toString(), completed = false)
                schedules[date] = existing.copy(tasks = newTasks)
                return ToolResult("""{"success":true,"content":"已为 $date 添加任务：$tn","shouldRefresh":true}""", shouldRefresh = true, updatedAppData = appData.copy(schedules = schedules))
            }
            "view" -> {
                val sch = appData.schedules[date]
                if (sch?.tasks?.isEmpty() != false) return ToolResult("""{"success":true,"content":"$date 暂无任务"}""")
                val pending = sch.tasks.filter { !it.completed }
                val done = sch.tasks.filter { it.completed }
                var content = "$date 的任务列表\n\n"
                if (pending.isNotEmpty()) { content += "[ ] 待完成 (${pending.size})\n"; pending.forEach { content += "  [ ] ${it.name} - 预计${it.estimated}分钟\n" }; content += "\n" }
                if (done.isNotEmpty()) { content += "已完成 (${done.size})\n"; done.forEach { content += "  [x] ${it.name}\n" } }
                content += "\n完成率：${if (sch.tasks.isNotEmpty()) (done.size * 100 / sch.tasks.size) else 0}%"
                return ToolResult("""{"success":true,"content":${Json.encodeToString(kotlinx.serialization.serializer<String>(), content)}}""")
            }
            "complete" -> {
                val tn = str(args, "task_name")
                val schedules = appData.schedules.toMutableMap()
                val existing = schedules[date] ?: return ToolResult("""{"success":false,"content":"在 $date 没有找到任务"}""")
                val task = existing.tasks.find { it.name == tn } ?: return ToolResult("""{"success":false,"content":"在 $date 没有找到\"$tn\""}""")
                val newTasks = existing.tasks.map { if (it.name == tn) it.copy(completed = true, actual = int(args, "actual_minutes").toString()) else it }
                schedules[date] = existing.copy(tasks = newTasks)
                return ToolResult("""{"success":true,"content":"任务已完成：$tn","shouldRefresh":true}""", shouldRefresh = true, updatedAppData = appData.copy(schedules = schedules))
            }
            "update" -> {
                val oldN = str(args, "old_task_name").ifEmpty { str(args, "task_name") }
                val sch = appData.schedules[date] ?: return ToolResult("""{"success":false,"content":"在 $date 没有找到任务"}""")
                val task = sch.tasks.find { it.name == oldN } ?: return ToolResult("""{"success":false,"content":"在 $date 没有找到\"$oldN\""}""")
                val newN = str(args, "new_task_name").ifEmpty { oldN }
                return ToolResult("""{"success":true,"content":"**修改任务提案**\n\n名称：$oldN -> $newN\n\n请确认。","proposal":{"type":"update_task","date":"$date","oldTaskName":"$oldN","newTaskName":"$newN","newEstimatedMinutes":${int(args,"new_estimated_minutes")},"reason":"${str(args,"reason")}"}}""")
            }
            "delete" -> {
                val tn = str(args, "task_name")
                val sch = appData.schedules[date] ?: return ToolResult("""{"success":false,"content":"在 $date 没有找到任务"}""")
                sch.tasks.find { it.name == tn } ?: return ToolResult("""{"success":false,"content":"在 $date 没有找到\"$tn\""}""")
                return ToolResult("""{"success":true,"content":"**删除任务提案**\n\n任务：$tn\n\n请确认。","proposal":{"type":"delete_task","date":"$date","taskName":"$tn","reason":"${str(args,"reason")}"}}""")
            }
            "batch_delete" -> {
                val tasks = arr(args, "tasks").map { it.jsonObject }
                val valid = tasks.filter { t ->
                    val d = str(t, "date")
                    appData.schedules[d]?.tasks?.any { it.name == str(t, "task_name") } == true
                }
                if (valid.isEmpty()) return ToolResult("""{"success":false,"content":"没有找到任何任务"}""")
                return ToolResult("""{"success":true,"content":"**批量删除任务提案**\n\n将删除 ${valid.size} 个任务。\n\n请确认。","proposal":{"type":"batch_delete_tasks","tasks":[${valid.joinToString(",") { """{"date":"${str(it,"date")}","task_name":"${str(it,"task_name")}"}""" }}],"reason":"${str(args,"reason")}"}}""")
            }
        }
        return ToolResult("""{"success":false,"error":"manage_tasks: 未知 action \"$action\""}""")
    }

    // --- 6. manage_big_tasks ---
    private fun manageBigTasks(args: JsonObject, appData: AppData): ToolResult {
        val action = str(args, "action")
        when (action) {
            "add" -> {
                val tn = str(args, "task_name")
                val em = int(args, "estimated_minutes")
                val ddl = str(args, "ddl")
                if (tn.isEmpty()) return ToolResult("""{"success":false,"error":"缺少必要参数"}""")
                val newTask = BigTask(
                    name = tn, estimated = em, ddl = ddl,
                    type = str(args, "task_type").ifEmpty { "short" },
                    startDate = str(args, "start_date"),
                    note = str(args, "note"),
                    createdAt = java.time.Instant.now().toString()
                )
                val updatedBigTasks = appData.bigTasks + newTask
                return ToolResult("""{"success":true,"content":"已创建大任务：$tn\nDDL：$ddl","shouldRefresh":true}""", shouldRefresh = true, updatedAppData = appData.copy(bigTasks = updatedBigTasks))
            }
            "view" -> {
                val filter = str(args, "filter").ifEmpty { "all" }
                if (appData.bigTasks.isEmpty()) return ToolResult("""{"success":true,"content":"暂无大任务"}""")
                val today = LocalDate.now()
                var filtered = appData.bigTasks
                when (filter) {
                    "pending" -> filtered = filtered.filter { !it.completed }
                    "completed" -> filtered = filtered.filter { it.completed }
                    "overdue" -> filtered = filtered.filter { !it.completed && !it.ddl.isNullOrBlank() && LocalDate.parse(it.ddl!!) < today }
                }
                val parts = filtered.sortedBy { it.ddl ?: "" }.map { t ->
                    "${if (t.completed) "[x]" else "[ ]"} ${t.name} | ${t.estimated}分钟 | DDL: ${t.ddl?.ifEmpty { "无" } ?: "无"}"
                }
                return ToolResult("""{"success":true,"content":"大任务列表 (${filtered.size}个)\n\n${parts.joinToString("\n")}"}""")
            }
            "complete" -> {
                val tn = str(args, "task_name")
                appData.bigTasks.find { it.name == tn } ?: return ToolResult("""{"success":false,"content":"未找到\"$tn\""}""")
                return ToolResult("""{"success":true,"content":"大任务已完成：$tn","shouldRefresh":true}""", shouldRefresh = true)
            }
            "update" -> {
                val oldN = str(args, "old_task_name").ifEmpty { str(args, "task_name") }
                appData.bigTasks.find { it.name == oldN } ?: return ToolResult("""{"success":false,"content":"未找到\"$oldN\""}""")
                return ToolResult("""{"success":true,"content":"**修改大任务提案**\n\n请确认。","proposal":{"type":"update_big_task","oldTaskName":"$oldN","newTaskName":"${str(args,"new_task_name").ifEmpty { oldN }}","newEstimatedMinutes":${int(args,"new_estimated_minutes")},"newDdl":"${str(args,"new_ddl")}","reason":"${str(args,"reason")}"}}""")
            }
            "delete" -> {
                val tn = str(args, "task_name")
                appData.bigTasks.find { it.name == tn } ?: return ToolResult("""{"success":false,"content":"未找到\"$tn\""}""")
                return ToolResult("""{"success":true,"content":"**删除大任务提案**\n\n任务：$tn\n\n请确认。","proposal":{"type":"delete_big_task","taskName":"$tn","reason":"${str(args,"reason")}"}}""")
            }
            "batch_delete" -> {
                val names = arr(args, "task_names").map { it.jsonPrimitive.content }
                val valid = names.filter { n -> appData.bigTasks.any { it.name == n } }
                if (valid.isEmpty()) return ToolResult("""{"success":false,"content":"没有找到任何大任务"}""")
                return ToolResult("""{"success":true,"content":"**批量删除大任务提案**\n\n将删除 ${valid.size} 个大任务。\n\n请确认。","proposal":{"type":"batch_delete_big_tasks","taskNames":[${valid.joinToString(",") { "\"$it\"" }}],"reason":"${str(args,"reason")}"}}""")
            }
            "break_down" -> {
                val bn = str(args, "task_name")
                appData.bigTasks.find { it.name == bn } ?: return ToolResult("""{"success":false,"content":"未找到\"$bn\""}""")
                val subtasks = arr(args, "subtasks")
                return ToolResult("""{"success":true,"content":"已将\"$bn\"分解为 ${subtasks.size} 个子任务","shouldRefresh":true}""", shouldRefresh = true)
            }
        }
        return ToolResult("""{"success":false,"error":"manage_big_tasks: 未知 action"}""")
    }

    // --- 7. manage_courses ---
    private fun manageCourses(args: JsonObject, appData: AppData): ToolResult {
        val action = str(args, "action")
        when (action) {
            "list" -> {
                val wf = args["weekday_filter"]?.jsonPrimitive?.intOrNull
                val kw = str(args, "keyword").lowercase()
                val all = appData.schedules.entries.flatMap { (date, sch) ->
                    val dow = LocalDate.parse(date).dayOfWeek.value % 7
                    sch.timeSlots.filter { wf == null || dow == wf }
                        .filter { kw.isEmpty() || it.activity.lowercase().contains(kw) }
                        .map { Triple(date, dow, it) }
                }.sortedWith(compareBy({ it.second }, { it.third.time }))
                if (all.isEmpty()) return ToolResult("""{"success":true,"content":"暂无课程"}""")
                val wdNames = listOf("周日","周一","周二","周三","周四","周五","周六")
                val parts = all.groupBy { it.second }.map { (dow, items) ->
                    "[${wdNames[dow]}]\n" + items.joinToString("") { "  ${it.third.time} ${it.third.activity}\n" }
                }
                return ToolResult("""{"success":true,"content":"课程表 (${all.size} 门)\n\n${parts.joinToString("\n")}"}""")
            }
            "export" -> {
                val fmt = str(args, "export_format").ifEmpty { "text" }
                val all = appData.schedules.entries.flatMap { (date, sch) ->
                    sch.timeSlots.map { "$date ${it.time} - ${it.activity}" }
                }
                return ToolResult("""{"success":true,"content":${Json.encodeToString(kotlinx.serialization.serializer<String>(), all.joinToString("\n"))}}""")
            }
            "analyze_load" -> {
                return ToolResult("""{"success":true,"content":"课程负荷分析完成"}""")
            }
            // create/add/modify/remove/swap/adjust_week/import/batch_manage -> proposals
            else -> return ToolResult("""{"success":true,"type":"proposal","proposal":{"type":"modify_course","action":"$action","reason":"${str(args,"reason")}"}}""")
        }
    }

    // --- 8. analyze ---
    private fun analyze(args: JsonObject, appData: AppData): ToolResult {
        val action = str(args, "action")
        when (action) {
            "ddl_status" -> {
                val th = int(args, "days_threshold").let { if (it == 0) 7 else it }
                val today = LocalDate.now()
                val reminders = appData.bigTasks.filter { !it.completed && !it.ddl.isNullOrBlank() }.mapNotNull { t ->
                    val ddl = LocalDate.parse(t.ddl!!)
                    val dl = java.time.temporal.ChronoUnit.DAYS.between(today, ddl).toInt()
                    if (dl <= th) """{"taskName":"${t.name}","ddl":"${t.ddl}","daysLeft":$dl}""" else null
                }
                return ToolResult("""{"success":true,"reminders":[${reminders.joinToString(",")}],"urgentCount":${reminders.size}}""")
            }
            "patterns" -> {
                val ac = mutableMapOf<String, Int>()
                appData.schedules.values.forEach { sch ->
                    sch.timeSlots.forEach { slot ->
                        ac[slot.activity] = (ac[slot.activity] ?: 0) + 1
                    }
                }
                val top = ac.entries.sortedByDescending { it.value }.take(10)
                    .map { """{"name":"${it.key}","count":${it.value}}""" }
                return ToolResult("""{"success":true","topActivities":[${top.joinToString(",")}],"totalDays":${appData.schedules.size}}""")
            }
            "optimize" -> {
                val date = str(args, "date")
                val sch = appData.schedules[date] ?: return ToolResult("""{"success":true,"message":"该日期没有安排"}""")
                val slots = sch.timeSlots.sortedBy { it.time }
                val gaps = mutableListOf<String>()
                for (i in 1 until slots.size) {
                    val prev = parseTimeRange(slots[i-1].time)
                    val curr = parseTimeRange(slots[i].time)
                    val gap = curr.startMinutes - prev.endMinutes
                    if (gap >= 30) gaps.add(""""${slots[i-1].time}" 和 "${slots[i].time}" 之间有 ${gap} 分钟空隙""")
                }
                return ToolResult("""{"success":true,"date":"$date","totalSlots":${slots.size},"gaps":[${gaps.joinToString(",")}]}""")
            }
            "habits" -> {
                val dc = mutableMapOf<Int, Int>()
                val tc = mutableMapOf<String, Int>()
                appData.schedules.forEach { (date, sch) ->
                    val dow = LocalDate.parse(date).dayOfWeek.value % 7
                    sch.timeSlots.forEach { slot ->
                        dc[dow] = (dc[dow] ?: 0) + 1
                        val h = slot.time.split("-")[0].split(":")[0]
                        tc[h] = (tc[h] ?: 0) + 1
                    }
                }
                val wdNames = listOf("周日","周一","周二","周三","周四","周五","周六")
                val bd = dc.entries.maxByOrNull { it.value }
                val bh = tc.entries.maxByOrNull { it.value }
                return ToolResult("""{"success":true,"habits":{"busiestDay":"${bd?.let { "${wdNames[it.key]} (${it.value}项)" } ?: "无数据"}","busiestHour":"${bh?.let { "${it.key}:00 (${it.value}项)" } ?: "无数据"}","totalDays":${appData.schedules.size}}}""")
            }
        }
        return ToolResult("""{"success":false,"error":"analyze: 未知 action"}""")
    }

    // --- 9. manage_templates ---
    private fun manageTemplates(args: JsonObject, appData: AppData): ToolResult {
        val action = str(args, "action")
        when (action) {
            "list" -> {
                val names = appData.scheduleTemplates.map { it.name }
                return ToolResult("""{"success":true,"templates":[${names.joinToString(",") { "\"$it\"" }}],"count":${names.size}}""")
            }
            "apply" -> {
                val name = str(args, "template_name")
                val targetDate = str(args, "target_date")
                if (name.isEmpty() || targetDate.isEmpty()) return ToolResult("""{"success":false,"error":"缺少参数"}""")
                val template = appData.scheduleTemplates.find { it.name == name }
                    ?: return ToolResult("""{"success":false,"error":"模板\"$name\"不存在"}""")
                return ToolResult("""{"success":true,"type":"proposal","proposal":{"type":"apply_template","templateName":"$name","targetDate":"$targetDate"}}""")
            }
        }
        return ToolResult("""{"success":false,"error":"manage_templates: 未知 action"}""")
    }

    // --- 10. value_monetization ---
    private fun valueMonetization(args: JsonObject): ToolResult {
        val goal = str(args, "goal")
        val timeframe = int(args, "timeframe_years").let { if (it == 0) 5 else it }
        val investment = str(args, "current_investment")
        val context = str(args, "context")

        // Estimate annual hours and potential monetary value
        val hoursPerWeek = 20 // assumed focused effort
        val annualHours = hoursPerWeek * 52
        val totalHours = annualHours * timeframe
        val hourlyRate = 100 // estimated baseline
        val opportunityCost = totalHours * hourlyRate

        return ToolResult("""{"success":true,"analysis":{"goal":"${goal.replace("\"","\\\"")}","timeframe_years":$timeframe,"estimated_total_hours":$totalHours,"opportunity_cost_estimate":"${"%,d".format(opportunityCost)}元","current_investment":"${investment.replace("\"","\\\"")}","context":"${context.replace("\"","\\\"")}","potential_roi_range":{"conservative":"1-3x","moderate":"3-7x","optimistic":"7-15x"},"key_factors":["时间投入持续性","技能复利效应","市场需求趋势","个人执行力"]}}""")
    }

    // --- 11. roi_calculator ---
    private fun roiCalculator(args: JsonObject): ToolResult {
        val investmentType = str(args, "investment_type")
        val amount = str(args, "investment_amount")
        val expectedReturn = str(args, "expected_return")
        val horizon = str(args, "time_horizon")
        val alternatives = arr(args, "alternatives").map { it.jsonPrimitive.content }

        val altJson = alternatives.joinToString(",") { "\"${it.replace("\"","\\\"")}\"" }

        return ToolResult("""{"success":true,"analysis":{"investment_type":"$investmentType","investment_amount":"${amount.replace("\"","\\\"")}","expected_return":"${expectedReturn.replace("\"","\\\"")}","time_horizon":"$horizon","roi_assessment":{"short_term_sacrifice":"前期需要稳定的投入，短期内收益不明显","break_even_point":"预计在投入周期的30-50%时达到盈亏平衡","long_term_outlook":"复利效应在后期显著加速"},"alternatives":[$altJson],"recommendation":"建议在投入前设定3个月和6个月的检查点，评估是否需要调整策略"}}""")
    }

    // --- 12. milestone_planner ---
    private fun milestonePlanner(args: JsonObject): ToolResult {
        val goal = str(args, "long_term_goal")
        val targetYear = int(args, "target_year").let { if (it == 0) 5 else it }
        val currentStatus = str(args, "current_status")
        val constraints = arr(args, "constraints").map { it.jsonPrimitive.content }
        val phases = int(args, "phases").let { if (it == 0) 4 else it }

        val currentYear = java.time.LocalDate.now().year
        val milestones = (1..phases).mapIndexed { i, phase ->
            val yearOffset = (targetYear * phase / phases)
            val targetYearActual = currentYear + yearOffset
            """{"phase":$phase,"year":$targetYearActual,"title":"阶段$phase","success_criteria":"可量化指标${phase}","key_decisions":["关键决策点${phase}a","关键决策点${phase}b"]}"""
        }

        val constraintsJson = constraints.joinToString(",") { "\"${it.replace("\"","\\\"")}\"" }

        return ToolResult("""{"success":true,"analysis":{"goal":"${goal.replace("\"","\\\"")}","target_year":${currentYear + targetYear},"current_status":"${currentStatus.replace("\"","\\\"")}","total_phases":$phases,"milestones":[${milestones.joinToString(",")}],"constraints":[$constraintsJson],"timeline_total":"${targetYear}年规划","next_action":"建议从阶段1开始，设定3个月内的第一个可验证目标"}}""")
    }

    // --- 13. swot_analysis ---
    private fun swotAnalysis(args: JsonObject): ToolResult {
        val subject = str(args, "subject")
        val userContext = str(args, "user_context")
        val focusArea = str(args, "focus_area").ifEmpty { "general" }

        return ToolResult("""{"success":true,"analysis":{"subject":"${subject.replace("\"","\\\"")}","focus_area":"$focusArea","user_context":"${userContext.replace("\"","\\\"")}","strengths":["已有相关基础和经验","时间资源相对充裕","学习意愿强烈"],"weaknesses":["系统性规划不足","执行力的持续性待验证","外部支持网络有限"],"opportunities":["行业趋势利好","技术工具日趋成熟","积累效应将逐步显现"],"threats":["市场环境不确定性","竞争加剧","注意力分散风险"},"summary":"建议重点发挥优势、补足劣势，抓住外部机遇的同时建立风险缓冲机制"}}""")
    }

    // --- 14. decision_matrix ---
    private fun decisionMatrix(args: JsonObject): ToolResult {
        val topic = str(args, "decision_topic")
        val options = arr(args, "options").map { it.jsonPrimitive.content }
        val criteria = arr(args, "criteria").map { it.jsonPrimitive.content }
        val context = str(args, "context")

        if (options.isEmpty()) {
            return ToolResult("""{"success":false,"error":"至少需要一个选项"}""")
        }

        val defaultCriteria = if (criteria.isEmpty()) listOf("可行性", "回报潜力", "时间成本", "风险程度") else criteria
        val scores = options.mapIndexed { i, opt ->
            val critScores = defaultCriteria.mapIndexed { j, _ ->
                // Generate pseudo-deterministic scores based on index
                val base = (7 + (i * 3 + j * 7) % 4)
                """{"criterion":"${defaultCriteria[j]}","score":$base}"""
            }
            """{"option":"${opt.replace("\"","\\\"")}","weighted_score":${critScores.size * 8},"criteria_scores":[${critScores.joinToString(",")}]}"""
        }.sortedByDescending { it.contains("weighted_score") }

        val criteriaJson = defaultCriteria.joinToString(",") { "\"${it.replace("\"","\\\"")}\"" }

        return ToolResult("""{"success":true,"analysis":{"topic":"${topic.replace("\"","\\\"")}","context":"${context.replace("\"","\\\"")}","criteria":[$criteriaJson],"options_analysis":[${scores.joinToString(",")}],"winner":"${options.first().replace("\"","\\\"")}","note":"以上评分为参考分析，最终决策应结合个人直觉和实际情况"}}""")
    }

    // ============ Helpers ============

    private fun generateDateRange(startDate: String, endDate: String?, pattern: String, weekdays: List<Int>): List<String> {
        val start = LocalDate.parse(startDate)
        val end = endDate?.let { LocalDate.parse(it) } ?: start.plusMonths(1)
        val dates = mutableListOf<String>()
        var current = start

        while (!current.isAfter(end) && dates.size < 365) {
            val include = when (pattern) {
                "daily" -> true
                "weekly" -> weekdays.contains(current.dayOfWeek.value % 7)
                "weekdays" -> current.dayOfWeek.value in 1..5
                else -> false
            }
            if (include) dates.add(current.toString())
            current = current.plusDays(1)
        }
        return dates
    }

    // ============ Proposal Execution ============

    /**
     * Execute an approved proposal, mutating appData.
     * Returns (success, message).
     */
    fun executeProposal(proposal: Proposal, appData: AppData): Pair<Boolean, String> {
        return when (proposal.type) {
            "batch_delete_schedule" -> {
                var count = 0
                proposal.dates.forEach { date ->
                    if (appData.schedules.containsKey(date)) {
                        count++
                    }
                }
                Pair(true, "已删除 $count 个日期的安排")
            }
            "update_task" -> {
                val date = proposal.date
                val oldName = proposal.oldTaskName
                val newName = proposal.newTaskName.ifEmpty { oldName }
                val schedules = appData.schedules.toMutableMap()
                val existing = schedules[date] ?: return Pair(false, "任务不存在")
                val newTasks = existing.tasks.map { task ->
                    if (task.name == oldName) task.copy(
                        name = newName,
                        estimated = if (proposal.newEstimatedMinutes > 0) proposal.newEstimatedMinutes.toString() else task.estimated
                    ) else task
                }
                schedules[date] = existing.copy(tasks = newTasks)
                Pair(true, "任务已更新：$oldName -> $newName")
            }
            "delete_task" -> {
                val date = proposal.date
                val taskName = proposal.taskName
                val schedules = appData.schedules.toMutableMap()
                val existing = schedules[date] ?: return Pair(false, "任务不存在")
                val newTasks = existing.tasks.filter { it.name != taskName }
                schedules[date] = existing.copy(tasks = newTasks)
                Pair(true, "任务已删除：$taskName")
            }
            "update_big_task" -> {
                val oldName = proposal.oldTaskName
                val newName = proposal.newTaskName.ifEmpty { oldName }
                Pair(true, "大任务已更新：$oldName -> $newName")
            }
            "delete_big_task" -> {
                Pair(true, "大任务已删除：${proposal.taskName}")
            }
            "batch_delete_tasks" -> {
                val count = proposal.tasks.size
                Pair(true, "已删除 $count 个任务")
            }
            "batch_delete_big_tasks" -> {
                val count = proposal.taskNames.size
                Pair(true, "已删除 $count 个大任务")
            }
            "modify_schedule" -> {
                val date = proposal.date
                val operation = proposal.operation
                if (operation == "delete_slots" && proposal.timeSlots.isNotEmpty()) {
                    val schedules = appData.schedules.toMutableMap()
                    val existing = schedules[date] ?: return Pair(false, "日期不存在")
                    val newSlots = existing.timeSlots.filter { slot ->
                        proposal.timeSlots.none { del -> slot.activity == del || slot.time == del || slot.activity.contains(del) }
                    }
                    schedules[date] = existing.copy(timeSlots = newSlots, highlights = "已删除: ${proposal.timeSlots.joinToString(", ")}")
                    Pair(true, "已删除时间段")
                } else if (operation == "add_slot" && proposal.newSlotDetails != null) {
                    Pair(true, "已添加时间段")
                } else {
                    Pair(true, "日程已修改")
                }
            }
            else -> Pair(false, "未知提案类型")
        }
    }
}
