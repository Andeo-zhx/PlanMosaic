AI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "view_schedule",
            "description": "查看日程。获取指定日期的详细安排，或列出所有有安排的日期，或按关键词搜索。在删除或修改多个日期前，必须先使用此工具查看有哪些日期有安排。",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "查看指定日期，YYYY-MM-DD格式"},
                    "list_all": {"type": "boolean", "description": "为true时列出所有有安排的日期"},
                    "keyword": {"type": "string", "description": "搜索关键词"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_schedule",
            "description": "添加日程安排。支持单次添加和周期性重复添加（每天/每周/工作日）。重要：如果用户没有明确说明持续时间，必须先询问用户要添加多少天或到哪天结束。直接添加，不需要确认。",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "目标日期，YYYY-MM-DD（单次添加时必填）"},
                    "start_date": {"type": "string", "description": "开始日期，YYYY-MM-DD（周期性添加时必填）"},
                    "end_date": {"type": "string", "description": "结束日期，YYYY-MM-DD（周期性添加时必填）"},
                    "repeat_pattern": {
                        "type": "string",
                        "enum": ["daily", "weekly", "weekdays"],
                        "description": "重复模式（周期性添加时必填）",
                    },
                    "weekdays": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "当repeat_pattern为weekly时指定星期几(0=周日,1=周一,...,6=周六)",
                    },
                    "timeSlots": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "time": {"type": "string", "description": "时间段，格式HH:MM-HH:MM"},
                                "activity": {"type": "string", "description": "活动名称"},
                                "detail": {"type": "string", "description": "活动详情"},
                                "icon": {"type": "string", "description": "图标符号"},
                            },
                            "required": ["time", "activity"],
                        },
                        "description": "要添加的时间段数组",
                    },
                    "title": {"type": "string", "description": "日程标题（可选）"},
                    "highlights": {"type": "string", "description": "日程重点（可选）"},
                },
                "required": ["timeSlots"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "modify_schedule",
            "description": "修改日程安排（需要用户确认）。支持操作类型：delete_slots（删除时间段）、modify_slot（修改时间段部分字段，只改你提供的字段）、replace_slot（原子替换：删除旧时间段+写入全新时间段，用于时间+内容都变）、add_slot（添加时间段）、modify_title（修改标题）、general_adjustment（一般调整）、delete_all_matching（批量删除匹配项）、update_all_matching（批量更新匹配项）。modify_slot需同时提供timeSlots和newSlotDetails；replace_slot需提供完整新slot。所有操作需用户确认。注意：返回success只表示提案创建成功，不代表数据已修改。",
            "parameters": {
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "enum": [
                            "delete_slots",
                            "modify_slot",
                            "replace_slot",
                            "add_slot",
                            "modify_title",
                            "general_adjustment",
                            "delete_all_matching",
                            "update_all_matching",
                            "batch_delete_dates",
                        ],
                        "description": "操作类型",
                    },
                    "date": {"type": "string", "description": "目标日期，YYYY-MM-DD"},
                    "changes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "具体修改内容描述",
                    },
                    "reason": {"type": "string", "description": "修改理由"},
                    "timeSlots": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "要操作的时间段或活动名称（delete_slots/modify_slot/replace_slot时必填）",
                    },
                    "newSlotDetails": {
                        "type": "object",
                        "description": "新时间段的详细信息。modify_slot时只需提供要修改的字段（activity/time等）；replace_slot时必须提供完整新slot（time+activity必填）。",
                        "properties": {
                            "time": {"type": "string"},
                            "activity": {"type": "string"},
                            "detail": {"type": "string"},
                            "icon": {"type": "string"},
                        },
                    },
                    "criteria": {
                        "type": "object",
                        "description": "批量操作的匹配条件",
                        "properties": {
                            "keyword": {"type": "string", "description": "关键词匹配"},
                            "day_of_week": {"type": "string", "description": "星期几"},
                            "activity": {"type": "string", "description": "活动名称匹配"},
                        },
                    },
                    "new_details": {
                        "type": "object",
                        "description": "批量修改时的新详情",
                        "properties": {
                            "time": {"type": "string"},
                            "activity": {"type": "string"},
                            "detail": {"type": "string"},
                        },
                    },
                    "dates": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "batch_delete_dates 时要删除的日期数组",
                    },
                },
                "required": ["operation", "reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_conflicts",
            "description": "检测日程冲突。检查新安排是否与已有日程冲突，或检测指定日期的所有冲突。",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "日期，YYYY-MM-DD"},
                    "time_slot": {"type": "string", "description": "要检查的时间段，格式HH:MM-HH:MM"},
                    "activity": {"type": "string", "description": "活动名称"},
                },
                "required": ["date", "time_slot"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_tasks",
            "description": "管理日常任务。支持添加、完成、修改、删除任务。add和complete直接执行不需要确认；update和delete需要用户确认。查看指定日期的任务列表。",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["add", "complete", "view", "update", "delete", "batch_delete"],
                        "description": "操作类型",
                    },
                    "date": {"type": "string", "description": "日期，YYYY-MM-DD"},
                    "task_name": {"type": "string", "description": "任务名称"},
                    "estimated_minutes": {"type": "number", "description": "预计用时（分钟）"},
                    "actual_minutes": {"type": "number", "description": "实际用时（分钟，complete时使用）"},
                    "category": {
                        "type": "string",
                        "enum": ["学习", "工作", "生活", "运动", "其他"],
                        "description": "任务时间评估类别（add时建议一并传入）",
                    },
                    "context": {"type": "string", "description": "任务时间评估上下文（add时建议一并传入）"},
                    "structured_features": {
                        "type": "object",
                        "description": "时间评估结构化特征",
                        "properties": {
                            "difficulty": {"type": "number"},
                            "familiarity": {"type": "number"},
                            "steps_count": {"type": "number"},
                            "deadline_pressure": {"type": "number"},
                            "output_type": {"type": "string"},
                        },
                    },
                    "difficulty": {"type": "number", "description": "任务难度 1-5"},
                    "familiarity": {"type": "number", "description": "任务熟悉度 1-5"},
                    "steps_count": {"type": "number", "description": "任务步骤数"},
                    "deadline_pressure": {"type": "number", "description": "截止压力 1-5"},
                    "output_type": {"type": "string", "description": "产出类型，如 deliverable/learning"},
                    "start_time": {"type": "string", "description": "开始时间HH:MM（可选）"},
                    "end_time": {"type": "string", "description": "结束时间HH:MM（可选）"},
                    "note": {"type": "string", "description": "备注（可选）"},
                    "new_task_name": {"type": "string", "description": "新任务名称（update时使用）"},
                    "new_estimated_minutes": {"type": "number", "description": "新预计用时（update时使用）"},
                    "new_note": {"type": "string", "description": "新备注（update时使用）"},
                    "reason": {"type": "string", "description": "修改/删除原因"},
                    "tasks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "date": {"type": "string"},
                                "task_name": {"type": "string"},
                            },
                            "required": ["date", "task_name"],
                        },
                        "description": "batch_delete时要删除的任务列表",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_big_tasks",
            "description": "管理大任务。支持短期任务和长期任务：短期任务只需在DDL前完成即可；长期任务需要在指定时间段内每天坚持。add和complete直接执行不需要确认；update和delete需要用户确认。",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "add",
                            "complete",
                            "view",
                            "update",
                            "delete",
                            "batch_delete",
                            "break_down",
                        ],
                        "description": "操作类型",
                    },
                    "task_name": {"type": "string", "description": "大任务名称"},
                    "estimated_minutes": {
                        "type": "number",
                        "description": "短期任务为预计总用时，长期任务为每天预计用时",
                    },
                    "ddl": {"type": "string", "description": "截止日期YYYY-MM-DD"},
                    "start_date": {
                        "type": "string",
                        "description": "起始日期YYYY-MM-DD（仅长期任务）",
                    },
                    "task_type": {
                        "type": "string",
                        "enum": ["short", "long"],
                        "description": "short短期/long长期",
                    },
                    "note": {"type": "string", "description": "备注（可选）"},
                    "filter": {
                        "type": "string",
                        "enum": ["all", "pending", "completed", "overdue"],
                        "description": "view时的筛选条件",
                    },
                    "new_task_name": {"type": "string", "description": "新名称（update时）"},
                    "new_estimated_minutes": {
                        "type": "number",
                        "description": "新预计用时（update时）",
                    },
                    "new_ddl": {"type": "string", "description": "新截止日期（update时）"},
                    "new_task_type": {
                        "type": "string",
                        "enum": ["short", "long"],
                        "description": "新任务类型（update时）",
                    },
                    "new_start_date": {
                        "type": "string",
                        "description": "新起始日期（update时）",
                    },
                    "new_note": {"type": "string", "description": "新备注（update时）"},
                    "reason": {"type": "string", "description": "修改/删除原因"},
                    "task_names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "batch_delete时要删除的大任务名称列表",
                    },
                    "subtasks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "子任务名称"},
                                "date": {"type": "string", "description": "分配日期YYYY-MM-DD"},
                                "estimated_minutes": {
                                    "type": "number",
                                    "description": "预计用时（分钟）",
                                },
                            },
                            "required": ["name", "date", "estimated_minutes"],
                        },
                        "description": "break_down时的子任务列表",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_courses",
            "description": "管理课程表。支持创建整个学期课表、添加/修改/删除单门课程、列出课程、导入导出课表、周调整，以及按课表编辑器网格结构管理模板格子。对课表编辑器格子操作时，优先传 template_name、week_type、weekday、section_start/section_end 与课程字段。创建和添加直接执行；修改和删除需要用户确认。模板格子修改成功后会自动回显到课表编辑器。weekday 统一使用 0-6 区间（0=周一，6=周日）；1-7 习惯会被自动归一化，非法值会返回错误。",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "create",
                            "add",
                            "modify",
                            "remove",
                            "list",
                            "import",
                            "export",
                            "swap",
                            "adjust_week",
                            "batch_manage",
                            "analyze_load",
                        ],
                        "description": "操作类型",
                    },
                    "semester_name": {"type": "string", "description": "学期名称（create时）"},
                    "start_date": {
                        "type": "string",
                        "description": "开始日期YYYY-MM-DD（create时必填）",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "结束日期YYYY-MM-DD（create时必填）",
                    },
                    "courses": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "课程名称"},
                                "weekday": {"type": "number", "description": "星期几，0-6 区间（0=周一，6=周日）。后端会自动把 1-7 习惯归一化为 0-6；非法值会返回错误。"},
                                "time": {"type": "string", "description": "上课时间HH:MM-HH:MM"},
                                "location": {"type": "string", "description": "地点"},
                                "teacher": {"type": "string", "description": "教师"},
                                "weeks": {"type": "string", "description": "上课周数"},
                            },
                            "required": ["name", "weekday", "time"],
                        },
                        "description": "课程列表",
                    },
                    "skip_dates": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "跳过的日期列表",
                    },
                    "course_name": {
                        "type": "string",
                        "description": "课程名称（add/modify/remove时）",
                    },
                    "weekday": {
                        "type": "number",
                        "description": "星期几，0-6 区间（0=周一，6=周日）。后端会自动把 1-7 习惯归一化为 0-6；非法值会返回错误。add/modify/remove 时使用（不带 template_name 时）。",
                    },
                    "time": {
                        "type": "string",
                        "description": "课程时间 HH:MM-HH:MM（add/modify/remove 时，不带 template_name 时使用）",
                    },
                    "template_name": {
                        "type": "string",
                        "description": "课表模板名称。用于操作课表编辑器中的模板格子；不传时默认操作普通按日期展开的课程安排。",
                    },
                    "week_type": {
                        "type": "string",
                        "enum": ["odd", "even", "all"],
                        "description": "单双周类型。odd=单周，even=双周，all=单双周同时生效。",
                    },
                    "section_start": {
                        "type": "number",
                        "description": "起始节次，1表示第1节。用于课表编辑器格子定位。",
                    },
                    "section_end": {
                        "type": "number",
                        "description": "结束节次，含当前节。未传时默认等于 section_start。",
                    },
                    "merge_span": {
                        "type": "number",
                        "description": "合并节数。与 section_start/section_end 二选一即可，通常无需同时传。",
                    },
                    "location": {"type": "string", "description": "地点"},
                    "teacher": {"type": "string", "description": "教师"},
                    "note": {"type": "string", "description": "备注"},
                    "course_cell": {
                        "type": "object",
                        "description": "课表编辑器中的格子信息。add 时推荐优先使用该结构化对象。",
                        "properties": {
                            "template_name": {"type": "string"},
                            "week_type": {"type": "string", "enum": ["odd", "even", "all"]},
                            "weekday": {"type": "number", "description": "星期几，0-6 区间（0=周一，6=周日）。后端会自动把 1-7 习惯归一化为 0-6；非法值会返回错误。"},
                            "section_start": {"type": "number", "description": "起始节次，从1开始"},
                            "section_end": {"type": "number", "description": "结束节次，从1开始，含当前节"},
                            "merge_span": {"type": "number", "description": "合并节数"},
                            "course_name": {"type": "string", "description": "课程名称"},
                            "location": {"type": "string"},
                            "teacher": {"type": "string"},
                            "note": {"type": "string"},
                        },
                    },
                    "old_course_cell": {
                        "type": "object",
                        "description": "原模板格子信息。modify/remove 时用于定位原格子。",
                        "properties": {
                            "template_name": {"type": "string"},
                            "week_type": {"type": "string", "enum": ["odd", "even", "all"]},
                            "weekday": {"type": "number", "description": "星期几，0-6 区间（0=周一，6=周日）。后端会自动把 1-7 习惯归一化为 0-6；非法值会返回错误。"},
                            "section_start": {"type": "number", "description": "起始节次，从1开始"},
                            "section_end": {"type": "number", "description": "结束节次，从1开始，含当前节"},
                            "merge_span": {"type": "number", "description": "合并节数"},
                            "course_name": {"type": "string", "description": "课程名称"},
                            "location": {"type": "string"},
                            "teacher": {"type": "string"},
                            "note": {"type": "string"},
                        },
                    },
                    "new_course_cell": {
                        "type": "object",
                        "description": "新模板格子信息。modify 时用于给出修改后的结构化课程格子。",
                        "properties": {
                            "template_name": {"type": "string"},
                            "week_type": {"type": "string", "enum": ["odd", "even", "all"]},
                            "weekday": {"type": "number", "description": "星期几，0-6 区间（0=周一，6=周日）。后端会自动把 1-7 习惯归一化为 0-6；非法值会返回错误。"},
                            "section_start": {"type": "number", "description": "起始节次，从1开始"},
                            "section_end": {"type": "number", "description": "结束节次，从1开始，含当前节"},
                            "merge_span": {"type": "number", "description": "合并节数"},
                            "course_name": {"type": "string", "description": "课程名称"},
                            "location": {"type": "string"},
                            "teacher": {"type": "string"},
                            "note": {"type": "string"},
                        },
                    },
                    "old_course_info": {
                        "type": "object",
                        "description": "原课程信息（modify时）",
                        "properties": {
                            "name": {"type": "string"},
                            "weekday": {"type": "number", "description": "星期几，0-6 区间（0=周一，6=周日）。"},
                            "time": {"type": "string"},
                        },
                        "required": ["name", "weekday", "time"],
                    },
                    "new_course_info": {
                        "type": "object",
                        "description": "新课程信息（modify时）",
                        "properties": {
                            "name": {"type": "string"},
                            "weekday": {"type": "number", "description": "星期几，0-6 区间（0=周一，6=周日）。"},
                            "time": {"type": "string"},
                            "location": {"type": "string"},
                            "teacher": {"type": "string"},
                        },
                    },
                    "weekday_filter": {
                        "type": "number",
                        "description": "按星期几筛选（list时），0-6 区间（0=周一，6=周日）。",
                    },
                    "keyword": {"type": "string", "description": "搜索关键词（list时）"},
                    "reason": {"type": "string", "description": "修改/删除原因"},
                    "schedule_text": {
                        "type": "string",
                        "description": "课表文本（import时）",
                    },
                    "export_format": {
                        "type": "string",
                        "enum": ["text", "json", "markdown"],
                        "description": "导出格式",
                    },
                    "course1": {"type": "object", "description": "交换课程1（swap时）"},
                    "course2": {"type": "object", "description": "交换课程2（swap时）"},
                    "source_date": {
                        "type": "string",
                        "description": "原日期（adjust_week时）",
                    },
                    "target_date": {
                        "type": "string",
                        "description": "目标日期（adjust_week时）",
                    },
                    "batch_operation": {
                        "type": "string",
                        "enum": [
                            "add_multiple",
                            "modify_multiple",
                            "delete_multiple",
                            "change_time_all",
                        ],
                        "description": "批量操作类型",
                    },
                    "new_time_slot": {
                        "type": "string",
                        "description": "新时间段（batch_manage时）",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze",
            "description": "智能分析和优化工具。支持分析日程模式、优化安排、检查DDL状态、获取用户习惯等。",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "patterns",
                            "optimize",
                            "ddl_status",
                            "habits",
                            "health_check",
                        ],
                        "description": "分析类型",
                    },
                    "period": {"type": "string", "description": "分析时间段，如\"本周\"、\"本月\""},
                    "date": {"type": "string", "description": "要优化的日期（optimize时）"},
                    "constraints": {"type": "string", "description": "约束条件（optimize时）"},
                    "goals": {"type": "string", "description": "优化目标（optimize时）"},
                    "days_threshold": {
                        "type": "number",
                        "description": "DDL检查天数阈值，默认7天",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_templates",
            "description": "管理日程模板。创建、应用、删除、列出模板。可用预设模板：考试周、周末、工作日、休息日。",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "apply", "delete", "list"],
                        "description": "操作类型",
                    },
                    "template_name": {"type": "string", "description": "模板名称"},
                    "template_data": {
                        "type": "object",
                        "description": "模板数据（create时）",
                    },
                    "target_date": {
                        "type": "string",
                        "description": "目标日期YYYY-MM-DD（apply时）",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "value_monetization",
            "description": "价值货币化评估。将用户的抽象目标转化为可量化的货币价值指标，包括时间价值估算、机会成本分析、潜在收益规模评估等。适用于讨论职业选择、技能投资、人生目标等场景。",
            "parameters": {
                "type": "object",
                "properties": {
                    "goal": {"type": "string", "description": "用户描述的目标或方向"},
                    "timeframe_years": {
                        "type": "number",
                        "description": "评估时间跨度（年）",
                    },
                    "current_investment": {
                        "type": "string",
                        "description": "当前已投入的资源（时间、金钱、精力等）",
                    },
                    "context": {"type": "string", "description": "补充背景信息"},
                },
                "required": ["goal"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "roi_calculator",
            "description": "时间/精力投资回报率计算器。评估某项投入（时间、金钱、精力）与预期收益的对比分析，包括短期牺牲vs长期回报、不同路径的ROI对比。",
            "parameters": {
                "type": "object",
                "properties": {
                    "investment_type": {
                        "type": "string",
                        "enum": ["time", "money", "effort", "mixed"],
                        "description": "投入类型",
                    },
                    "investment_amount": {
                        "type": "string",
                        "description": "投入量描述（如\"每天2小时\"、\"10万元\"等）",
                    },
                    "expected_return": {
                        "type": "string",
                        "description": "预期回报描述",
                    },
                    "time_horizon": {
                        "type": "string",
                        "description": "回报周期（如\"3年\"、\"5年\"）",
                    },
                    "alternatives": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "替代方案列表（可选）",
                    },
                },
                "required": ["investment_type", "investment_amount", "expected_return"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "milestone_planner",
            "description": "里程碑拆解规划工具。将长期目标（5-10年）拆解为可量化的阶段性里程碑，每个里程碑设定可验证的成功标准，标识关键决策节点和时间线。",
            "parameters": {
                "type": "object",
                "properties": {
                    "long_term_goal": {"type": "string", "description": "长期目标描述"},
                    "target_year": {
                        "type": "number",
                        "description": "目标达成年份（距今年数）",
                    },
                    "current_status": {
                        "type": "string",
                        "description": "当前状态/起点",
                    },
                    "constraints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "已知约束条件",
                    },
                    "phases": {
                        "type": "number",
                        "description": "建议拆分为几个阶段（默认4）",
                    },
                },
                "required": ["long_term_goal", "target_year"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "swot_analysis",
            "description": "SWOT结构化分析工具。对某个目标、决策或方向进行优势(Strengths)、劣势(Weaknesses)、机会(Opportunities)、威胁(Threats)的四象限结构化分析。",
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {
                        "type": "string",
                        "description": "分析对象（目标、决策、方向等）",
                    },
                    "user_context": {
                        "type": "string",
                        "description": "用户背景/现状",
                    },
                    "focus_area": {
                        "type": "string",
                        "enum": ["career", "life", "financial", "skill", "general"],
                        "description": "分析领域",
                    },
                },
                "required": ["subject"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "decision_matrix",
            "description": "多维度加权决策矩阵工具。帮助用户在多个选项之间做出理性决策，通过设定评价维度和权重，对各选项进行打分和排序。",
            "parameters": {
                "type": "object",
                "properties": {
                    "decision_topic": {"type": "string", "description": "决策主题"},
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "待选方案列表",
                    },
                    "criteria": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "评价维度（如不提供则自动生成常用维度）",
                    },
                    "context": {"type": "string", "description": "决策背景补充"},
                },
                "required": ["decision_topic", "options"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search_evaluate",
            "description": "搜索网络资源，评估和汇总任务解决方案。用于查找最佳实践、学习路径、方法论等信息。调用前会对 query 做规范化处理（去尾标点、合并空白），返回结果中请优先使用 summary_text 字段（已拼接好的纯文本摘要）作为综合来源，同时使用 citations 数组中的结构化引用。失败时 fallback=true 且 error_code 标识原因（timeout/network_error/rate_limited/api_error/missing_query），可基于已有知识回答。purpose 字段是建议性，不影响搜索行为。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词（必填）"},
                    "purpose": {
                        "type": "string",
                        "description": "搜索目的，如\"学习路径\"、\"最佳实践\"、\"时间评估\"，仅作记录用",
                    },
                    "max_results": {
                        "type": "number",
                        "description": "最大结果数，默认5，最大10",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "estimate_task_time",
            "description": "根据任务描述估算合理完成时间。优先基于任务名、类别和 5 个高影响特征（difficulty、familiarity、steps_count、deadline_pressure、output_type）进行估算；如果现有信息已足够，直接调用，不要为了估时继续追问；如果确实缺少关键信息，最多只补问 1 到 2 个高影响问题，只补少量真正影响用时的信息，不要追问低价值细节。支持 Python 时间估算服务、本地两阶段估算桥接和规则基线降级三种模式，完成任务后记录实际用时可训练模型提升准确度。",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_name": {"type": "string", "description": "任务名称或描述"},
                    "category": {
                        "type": "string",
                        "enum": ["学习", "工作", "生活", "运动", "其他"],
                        "description": "任务类别，优先在学习/工作/生活/运动中选最接近的一类，只有明显无法判断时才用其他",
                    },
                    "context": {
                        "type": "string",
                        "description": "补充背景信息，如\"有一定基础\"、\"初学者\"、\"明天截止\"等",
                    },
                    "structured_features": {
                        "type": "object",
                        "description": "时间估算结构化特征，只补齐少量高影响字段即可",
                        "properties": {
                            "difficulty": {"type": "number", "description": "任务难度 1-5"},
                            "familiarity": {"type": "number", "description": "任务熟悉度 1-5"},
                            "steps_count": {"type": "number", "description": "任务步骤数"},
                            "deadline_pressure": {"type": "number", "description": "截止压力 1-5"},
                            "output_type": {"type": "string", "description": "产出类型，如 deliverable/learning/execution"},
                        },
                    },
                    "difficulty": {"type": "number", "description": "任务难度 1-5"},
                    "familiarity": {"type": "number", "description": "任务熟悉度 1-5"},
                    "steps_count": {"type": "number", "description": "任务步骤数"},
                    "deadline_pressure": {"type": "number", "description": "截止压力 1-5"},
                    "output_type": {"type": "string", "description": "产出类型，如 deliverable/learning/execution"},
                },
                "required": ["task_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_changes",
            "description": "自检工具。在完成任何写操作工具（add_schedule / modify_schedule / manage_tasks / manage_big_tasks / manage_courses / manage_templates）后必须调用一次本工具，从数据源回读实际数据并与期望值对比，确保工具返回 success=true 时数据真的已落盘。支持单条断言（date+slotKey+expect）和批量断言（assertions 数组）。失败时不得对用户宣称完成，必须如实报告。",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "目标日期，YYYY-MM-DD（单条断言时必填）"},
                    "slotKey": {"type": "string", "description": "时间段标识，格式HH:MM-HH:MM（单条断言时使用）"},
                    "expect": {
                        "type": "object",
                        "description": "单条断言的期望值。支持的键：slotExists (boolean)、activity (string)、detail (string)、time (string)、title (string)、highlights (string)。slotExists=false 用于验证删除。",
                        "properties": {
                            "slotExists": {"type": "boolean", "description": "期望该时间段是否存在"},
                            "activity": {"type": "string", "description": "期望的活动名称"},
                            "detail": {"type": "string", "description": "期望的详情"},
                            "time": {"type": "string", "description": "期望的时间段"},
                            "title": {"type": "string", "description": "期望的日程标题"},
                            "highlights": {"type": "string", "description": "期望的日程重点"},
                        },
                    },
                    "assertions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "date": {"type": "string", "description": "日期"},
                                "slotKey": {"type": "string", "description": "时间段"},
                                "expect": {"type": "object", "description": "期望值对象"},
                            },
                            "required": ["date", "expect"],
                        },
                        "description": "批量断言数组。一次性校验多个日期/时间段的写入。",
                    },
                    "scope": {"type": "string", "enum": ["memory", "disk"], "description": "数据源：memory 从内存 schedules dict 读取（默认），disk 从 data.json 重新加载"},
                },
                "required": [],
            },
        },
    },
]
