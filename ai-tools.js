// AI Agent 工具定义 - 共享文件（精简版）
// 此文件被 main.js 和 server.js 共享引用
//
// 从 40+ 工具精简为 9 个核心工具，通过 action 参数区分具体操作。
// 所有需要用户确认的修改操作返回 proposal 对象，由前端展示确认。

const AI_TOOLS = [
    // ========== 1. 日程查看 ==========
    {
        type: 'function',
        function: {
            name: 'view_schedule',
            description: '查看日程。获取指定日期的详细安排，或列出所有有安排的日期，或按关键词搜索。在删除或修改多个日期前，必须先使用此工具查看有哪些日期有安排。',
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: '查看指定日期，YYYY-MM-DD格式' },
                    list_all: { type: 'boolean', description: '为true时列出所有有安排的日期' },
                    keyword: { type: 'string', description: '搜索关键词' }
                },
                required: []
            }
        }
    },

    // ========== 2. 添加日程 ==========
    {
        type: 'function',
        function: {
            name: 'add_schedule',
            description: '添加日程安排。支持单次添加和周期性重复添加（每天/每周/工作日）。重要：如果用户没有明确说明持续时间，必须先询问用户要添加多少天或到哪天结束。直接添加，不需要确认。',
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: '目标日期，YYYY-MM-DD（单次添加时必填）' },
                    start_date: { type: 'string', description: '开始日期，YYYY-MM-DD（周期性添加时必填）' },
                    end_date: { type: 'string', description: '结束日期，YYYY-MM-DD（周期性添加时必填）' },
                    repeat_pattern: { type: 'string', enum: ['daily', 'weekly', 'weekdays'], description: '重复模式（周期性添加时必填）' },
                    weekdays: { type: 'array', items: { type: 'integer' }, description: '当repeat_pattern为weekly时指定星期几(0=周日,1=周一,...,6=周六)' },
                    timeSlots: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                time: { type: 'string', description: '时间段，格式HH:MM-HH:MM' },
                                activity: { type: 'string', description: '活动名称' },
                                detail: { type: 'string', description: '活动详情' },
                                icon: { type: 'string', description: '图标符号' }
                            },
                            required: ['time', 'activity']
                        },
                        description: '要添加的时间段数组'
                    },
                    title: { type: 'string', description: '日程标题（可选）' },
                    highlights: { type: 'string', description: '日程重点（可选）' }
                },
                required: ['timeSlots']
            }
        }
    },

    // ========== 3. 修改日程（提案） ==========
    {
        type: 'function',
        function: {
            name: 'modify_schedule',
            description: '修改日程安排（需要用户确认）。支持以下操作类型：delete_slots（删除时间段）、modify_slot（修改时间段内容）、add_slot（添加时间段）、modify_title（修改标题）、general_adjustment（一般调整）、delete_all_matching（批量删除匹配项）、update_all_matching（批量更新匹配项）。所有操作需要用户确认后才执行。',
            parameters: {
                type: 'object',
                properties: {
                    operation: {
                        type: 'string',
                        enum: ['delete_slots', 'modify_slot', 'add_slot', 'modify_title', 'general_adjustment', 'delete_all_matching', 'update_all_matching', 'batch_delete_dates'],
                        description: '操作类型'
                    },
                    date: { type: 'string', description: '目标日期，YYYY-MM-DD' },
                    changes: { type: 'array', items: { type: 'string' }, description: '具体修改内容描述' },
                    reason: { type: 'string', description: '修改理由' },
                    timeSlots: { type: 'array', items: { type: 'string' }, description: '要操作的时间段或活动名称' },
                    newSlotDetails: {
                        type: 'object',
                        description: '新时间段的详细信息',
                        properties: {
                            time: { type: 'string' },
                            activity: { type: 'string' },
                            detail: { type: 'string' },
                            icon: { type: 'string' }
                        }
                    },
                    criteria: {
                        type: 'object',
                        description: '批量操作的匹配条件',
                        properties: {
                            keyword: { type: 'string', description: '关键词匹配' },
                            day_of_week: { type: 'string', description: '星期几' },
                            activity: { type: 'string', description: '活动名称匹配' }
                        }
                    },
                    new_details: {
                        type: 'object',
                        description: '批量修改时的新详情',
                        properties: {
                            time: { type: 'string' },
                            activity: { type: 'string' },
                            detail: { type: 'string' }
                        }
                    },
                    dates: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'batch_delete_dates 时要删除的日期数组'
                    }
                },
                required: ['operation', 'reason']
            }
        }
    },

    // ========== 4. 检测冲突 ==========
    {
        type: 'function',
        function: {
            name: 'check_conflicts',
            description: '检测日程冲突。检查新安排是否与已有日程冲突，或检测指定日期的所有冲突。',
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: '日期，YYYY-MM-DD' },
                    time_slot: { type: 'string', description: '要检查的时间段，格式HH:MM-HH:MM' },
                    activity: { type: 'string', description: '活动名称' }
                },
                required: ['date', 'time_slot']
            }
        }
    },

    // ========== 5. 任务管理 ==========
    {
        type: 'function',
        function: {
            name: 'manage_tasks',
            description: '管理日常任务。支持添加、完成、修改、删除任务。add和complete直接执行不需要确认；update和delete需要用户确认。查看指定日期的任务列表。',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['add', 'complete', 'view', 'update', 'delete', 'batch_delete'],
                        description: '操作类型'
                    },
                    date: { type: 'string', description: '日期，YYYY-MM-DD' },
                    task_name: { type: 'string', description: '任务名称' },
                    estimated_minutes: { type: 'number', description: '预计用时（分钟）' },
                    actual_minutes: { type: 'number', description: '实际用时（分钟，complete时使用）' },
                    start_time: { type: 'string', description: '开始时间HH:MM（可选）' },
                    end_time: { type: 'string', description: '结束时间HH:MM（可选）' },
                    note: { type: 'string', description: '备注（可选）' },
                    new_task_name: { type: 'string', description: '新任务名称（update时使用）' },
                    new_estimated_minutes: { type: 'number', description: '新预计用时（update时使用）' },
                    new_note: { type: 'string', description: '新备注（update时使用）' },
                    reason: { type: 'string', description: '修改/删除原因' },
                    tasks: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                date: { type: 'string' },
                                task_name: { type: 'string' }
                            },
                            required: ['date', 'task_name']
                        },
                        description: 'batch_delete时要删除的任务列表'
                    }
                },
                required: ['action']
            }
        }
    },

    // ========== 6. 大任务管理 ==========
    {
        type: 'function',
        function: {
            name: 'manage_big_tasks',
            description: '管理大任务。支持短期任务和长期任务：短期任务只需在DDL前完成即可；长期任务需要在指定时间段内每天坚持。add和complete直接执行不需要确认；update和delete需要用户确认。',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['add', 'complete', 'view', 'update', 'delete', 'batch_delete', 'break_down'],
                        description: '操作类型'
                    },
                    task_name: { type: 'string', description: '大任务名称' },
                    estimated_minutes: { type: 'number', description: '短期任务为预计总用时，长期任务为每天预计用时' },
                    ddl: { type: 'string', description: '截止日期YYYY-MM-DD' },
                    start_date: { type: 'string', description: '起始日期YYYY-MM-DD（仅长期任务）' },
                    task_type: { type: 'string', enum: ['short', 'long'], description: 'short短期/long长期' },
                    note: { type: 'string', description: '备注（可选）' },
                    filter: { type: 'string', enum: ['all', 'pending', 'completed', 'overdue'], description: 'view时的筛选条件' },
                    new_task_name: { type: 'string', description: '新名称（update时）' },
                    new_estimated_minutes: { type: 'number', description: '新预计用时（update时）' },
                    new_ddl: { type: 'string', description: '新截止日期（update时）' },
                    new_task_type: { type: 'string', enum: ['short', 'long'], description: '新任务类型（update时）' },
                    new_start_date: { type: 'string', description: '新起始日期（update时）' },
                    new_note: { type: 'string', description: '新备注（update时）' },
                    reason: { type: 'string', description: '修改/删除原因' },
                    task_names: { type: 'array', items: { type: 'string' }, description: 'batch_delete时要删除的大任务名称列表' },
                    subtasks: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: '子任务名称' },
                                date: { type: 'string', description: '分配日期YYYY-MM-DD' },
                                estimated_minutes: { type: 'number', description: '预计用时（分钟）' }
                            },
                            required: ['name', 'date', 'estimated_minutes']
                        },
                        description: 'break_down时的子任务列表'
                    }
                },
                required: ['action']
            }
        }
    },

    // ========== 7. 课表管理 ==========
    {
        type: 'function',
        function: {
            name: 'manage_courses',
            description: '管理课程表。支持创建整个学期课表、添加/修改/删除单门课程、列出课程、导入导出课表、周调整等。创建和添加直接执行；修改和删除需要用户确认。',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['create', 'add', 'modify', 'remove', 'list', 'import', 'export', 'swap', 'adjust_week', 'batch_manage', 'analyze_load'],
                        description: '操作类型'
                    },
                    semester_name: { type: 'string', description: '学期名称（create时）' },
                    start_date: { type: 'string', description: '开始日期YYYY-MM-DD（create时必填）' },
                    end_date: { type: 'string', description: '结束日期YYYY-MM-DD（create时必填）' },
                    courses: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: '课程名称' },
                                weekday: { type: 'number', description: '星期几0-6' },
                                time: { type: 'string', description: '上课时间HH:MM-HH:MM' },
                                location: { type: 'string', description: '地点' },
                                teacher: { type: 'string', description: '教师' },
                                weeks: { type: 'string', description: '上课周数' }
                            },
                            required: ['name', 'weekday', 'time']
                        },
                        description: '课程列表'
                    },
                    skip_dates: { type: 'array', items: { type: 'string' }, description: '跳过的日期列表' },
                    course_name: { type: 'string', description: '课程名称（add/modify/remove时）' },
                    old_course_info: {
                        type: 'object',
                        description: '原课程信息（modify时）',
                        properties: {
                            name: { type: 'string' },
                            weekday: { type: 'number' },
                            time: { type: 'string' }
                        },
                        required: ['name', 'weekday', 'time']
                    },
                    new_course_info: {
                        type: 'object',
                        description: '新课程信息（modify时）',
                        properties: {
                            name: { type: 'string' },
                            weekday: { type: 'number' },
                            time: { type: 'string' },
                            location: { type: 'string' },
                            teacher: { type: 'string' }
                        }
                    },
                    weekday_filter: { type: 'number', description: '按星期几筛选（list时）' },
                    keyword: { type: 'string', description: '搜索关键词（list时）' },
                    reason: { type: 'string', description: '修改/删除原因' },
                    schedule_text: { type: 'string', description: '课表文本（import时）' },
                    export_format: { type: 'string', enum: ['text', 'json', 'markdown'], description: '导出格式' },
                    course1: { type: 'object', description: '交换课程1（swap时）' },
                    course2: { type: 'object', description: '交换课程2（swap时）' },
                    source_date: { type: 'string', description: '原日期（adjust_week时）' },
                    target_date: { type: 'string', description: '目标日期（adjust_week时）' },
                    batch_operation: { type: 'string', enum: ['add_multiple', 'modify_multiple', 'delete_multiple', 'change_time_all'], description: '批量操作类型' },
                    new_time_slot: { type: 'string', description: '新时间段（batch_manage时）' }
                },
                required: ['action']
            }
        }
    },

    // ========== 8. 智能分析 ==========
    {
        type: 'function',
        function: {
            name: 'analyze',
            description: '智能分析和优化工具。支持分析日程模式、优化安排、检查DDL状态、获取用户习惯等。',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['patterns', 'optimize', 'ddl_status', 'habits'],
                        description: '分析类型'
                    },
                    period: { type: 'string', description: '分析时间段，如"本周"、"本月"' },
                    date: { type: 'string', description: '要优化的日期（optimize时）' },
                    constraints: { type: 'string', description: '约束条件（optimize时）' },
                    goals: { type: 'string', description: '优化目标（optimize时）' },
                    days_threshold: { type: 'number', description: 'DDL检查天数阈值，默认7天' }
                },
                required: ['action']
            }
        }
    },

    // ========== 9. 模板管理 ==========
    {
        type: 'function',
        function: {
            name: 'manage_templates',
            description: '管理日程模板。创建、应用、删除、列出模板。可用预设模板：考试周、周末、工作日、休息日。',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['create', 'apply', 'delete', 'list'],
                        description: '操作类型'
                    },
                    template_name: { type: 'string', description: '模板名称' },
                    template_data: { type: 'object', description: '模板数据（create时）' },
                    target_date: { type: 'string', description: '目标日期YYYY-MM-DD（apply时）' }
                },
                required: ['action']
            }
        }
    },

    // ========== 10. 价值货币化评估（深度规划专用） ==========
    {
        type: 'function',
        function: {
            name: 'value_monetization',
            description: '价值货币化评估。将用户的抽象目标转化为可量化的货币价值指标，包括时间价值估算、机会成本分析、潜在收益规模评估等。适用于讨论职业选择、技能投资、人生目标等场景。',
            parameters: {
                type: 'object',
                properties: {
                    goal: { type: 'string', description: '用户描述的目标或方向' },
                    timeframe_years: { type: 'number', description: '评估时间跨度（年）' },
                    current_investment: { type: 'string', description: '当前已投入的资源（时间、金钱、精力等）' },
                    context: { type: 'string', description: '补充背景信息' }
                },
                required: ['goal']
            }
        }
    },

    // ========== 11. ROI计算器（深度规划专用） ==========
    {
        type: 'function',
        function: {
            name: 'roi_calculator',
            description: '时间/精力投资回报率计算器。评估某项投入（时间、金钱、精力）与预期收益的对比分析，包括短期牺牲vs长期回报、不同路径的ROI对比。',
            parameters: {
                type: 'object',
                properties: {
                    investment_type: { type: 'string', enum: ['time', 'money', 'effort', 'mixed'], description: '投入类型' },
                    investment_amount: { type: 'string', description: '投入量描述（如"每天2小时"、"10万元"等）' },
                    expected_return: { type: 'string', description: '预期回报描述' },
                    time_horizon: { type: 'string', description: '回报周期（如"3年"、"5年"）' },
                    alternatives: { type: 'array', items: { type: 'string' }, description: '替代方案列表（可选）' }
                },
                required: ['investment_type', 'investment_amount', 'expected_return']
            }
        }
    },

    // ========== 12. 里程碑规划（深度规划专用） ==========
    {
        type: 'function',
        function: {
            name: 'milestone_planner',
            description: '里程碑拆解规划工具。将长期目标（5-10年）拆解为可量化的阶段性里程碑，每个里程碑设定可验证的成功标准，标识关键决策节点和时间线。',
            parameters: {
                type: 'object',
                properties: {
                    long_term_goal: { type: 'string', description: '长期目标描述' },
                    target_year: { type: 'number', description: '目标达成年份（距今年数）' },
                    current_status: { type: 'string', description: '当前状态/起点' },
                    constraints: { type: 'array', items: { type: 'string' }, description: '已知约束条件' },
                    phases: { type: 'number', description: '建议拆分为几个阶段（默认4）' }
                },
                required: ['long_term_goal', 'target_year']
            }
        }
    },

    // ========== 13. SWOT分析（深度规划专用） ==========
    {
        type: 'function',
        function: {
            name: 'swot_analysis',
            description: 'SWOT结构化分析工具。对某个目标、决策或方向进行优势(Strengths)、劣势(Weaknesses)、机会(Opportunities)、威胁(Threats)的四象限结构化分析。',
            parameters: {
                type: 'object',
                properties: {
                    subject: { type: 'string', description: '分析对象（目标、决策、方向等）' },
                    user_context: { type: 'string', description: '用户背景/现状' },
                    focus_area: { type: 'string', enum: ['career', 'life', 'financial', 'skill', 'general'], description: '分析领域' }
                },
                required: ['subject']
            }
        }
    },

    // ========== 14. 决策矩阵（深度规划专用） ==========
    {
        type: 'function',
        function: {
            name: 'decision_matrix',
            description: '多维度加权决策矩阵工具。帮助用户在多个选项之间做出理性决策，通过设定评价维度和权重，对各选项进行打分和排序。',
            parameters: {
                type: 'object',
                properties: {
                    decision_topic: { type: 'string', description: '决策主题' },
                    options: { type: 'array', items: { type: 'string' }, description: '待选方案列表' },
                    criteria: { type: 'array', items: { type: 'string' }, description: '评价维度（如不提供则自动生成常用维度）' },
                    context: { type: 'string', description: '决策背景补充' }
                },
                required: ['decision_topic', 'options']
            }
        }
    }
];

// 导出工具定义
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AI_TOOLS };
}
