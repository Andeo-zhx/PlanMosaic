package com.example.planmosaic_android.data.repository

import android.util.Log
import com.example.planmosaic_android.data.remote.AiApiClient
import com.example.planmosaic_android.model.AppData
import com.example.planmosaic_android.model.Proposal
import com.example.planmosaic_android.util.AgentTools
import kotlinx.serialization.json.*

/**
 * Orchestrates AI agent conversations including:
 * - System prompt construction
 * - Multi-turn tool calling
 * - Proposal handling
 * - Chat history management
 */
class AgentRepository(
    private val aiApiClient: AiApiClient
) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val lastCompleteMessages = mutableListOf<JsonObject>()

    // ============ Public API ============

    data class ChatResponse(
        val content: String,
        val proposal: Proposal? = null,
        val shouldRefresh: Boolean = false,
        val updatedAppData: AppData? = null
    )

    /**
     * Send a message to the AI agent and get a response.
     * Handles the full tool-calling loop internally.
     */
    suspend fun chat(
        message: String,
        history: List<Map<String, String>>,
        appData: AppData,
        apiKey: String,
        provider: String,
        userProfile: String = ""
    ): ChatResponse {
        if (apiKey.isEmpty()) {
            return ChatResponse(
                content = "AI服务未配置，请在设置中输入API密钥。",
                shouldRefresh = false
            )
        }

        val systemPrompt = buildSystemPrompt(appData, userProfile)
        val messages = mutableListOf<JsonObject>()

        // System message
        messages.add(aiApiClient.textMessage("system", systemPrompt))

        // History (last 10 messages)
        history.takeLast(10).forEach { msg ->
            val role = msg["role"] ?: "user"
            val content = msg["content"] ?: ""
            if (content.isNotEmpty()) {
                messages.add(aiApiClient.textMessage(role, content))
            }
        }

        // Current user message
        messages.add(aiApiClient.textMessage("user", message))

        // Check if reasoning model should be used
        val useReasoner = needsReasoning(message)

        // Call AI with tool support, supporting recursive tool calls
        val result = callWithTools(messages, appData, apiKey, provider, useReasoner, 0)
        lastCompleteMessages.clear()
        lastCompleteMessages.addAll(messages)
        return result
    }

    // ============ System Prompt ============

    private fun buildSystemPrompt(appData: AppData, userProfile: String): String {
        val now = java.time.LocalDateTime.now(java.time.ZoneId.of("UTC+8"))
        val today = now.toLocalDate().toString()
        val tomorrow = now.toLocalDate().plusDays(1).toString()
        val yesterday = now.toLocalDate().minusDays(1).toString()
        val weekdayNames = listOf("日", "一", "二", "三", "四", "五", "六")
        val dateInfo = "今天是 $today（周${weekdayNames[now.dayOfWeek.value % 7]}），昨天是 $yesterday，明天是 $tomorrow。"

        var profileSection = ""
        if (userProfile.isNotBlank()) {
            profileSection = "\n\n【用户画像】\n${userProfile.trim()}"
        }

        return """你是 Mosa，用户的贴心日程伙伴 ☀️ 你的定位不是一个冰冷的工具，而是像朋友一样陪伴用户管理每一天，语气温暖亲切，让人感到被关心和支持。

【当前日期】$dateInfo 时区 UTC+8。工具 date 参数统一用 YYYY-MM-DD 格式。
$profileSection

【我能帮你做什么 💡】
- 📋 日程管理：查看、添加、修改、删除日程和任务
- 🎯 深度规划：帮助拆解目标、规划学习/工作计划
- 📚 词汇学习：管理词库、复习生词
- ⏰ 提醒与检查：DDL 预警、冲突检测
- 🔍 搜索：按关键词查找日程

【回复风格 🌸】
1. 温暖亲切：像朋友一样自然交流，让人感到安心和被理解
2. emoji 点缀：适当使用 ☀️ 📋 ✅ 💡 🎯 ⏰ 📚 🔍 ✨ 💪 🌟 等 emoji，让对话更有温度
3. 非命令式：不说"你必须"、"你应该"，而是用"可以试试"、"不妨考虑"这类柔和表达
4. 温柔引导：遇到错误或异常时，不冷冰冰报错，而是用理解和鼓励的方式说明情况，并给出可行的下一步建议
5. 简洁有温度：回复尽量简短，但不显冷漠。哪怕只是一个确认，也带一点关心的语气

【思路链规范 🧠】
当遇到以下需要复杂推理的场景时，请在回复中用以下标记包裹你的思考过程：
- 日程冲突检测与建议
- 多任务优先级排序
- 时间规划与排期优化
- 学习计划或复习策略分析
- 批量操作的影响评估

格式：
【思考】
（你的推理过程，展示你是如何得出结论的）
【/思考】
（然后给出温暖的最终回复）

注意：简单的查看/添加/删除操作不需要思路链，只对需要推理的场景使用。

【操作规则 ⚙️】
1. 先调用工具获取数据，不要凭空猜测用户的日程内容
2. 一次请求可以连续调用多个工具，完成所有必要操作后再统一回复
3. 需要用户确认的操作（删除/修改日程）必须返回 proposal，不要擅自执行
4. 安全操作（添加任务、完成任务、查看日程）无需确认，直接调用工具执行
5. 所有"删除"和"移除"操作需用户确认后再执行；所有"批量"操作需用户确认
6. 回复时先共情再给出结果，例如"帮你查了一下，明天是这样的 ☀️"而不是直接扔数据

【意图识别 🎯】
- "明天有什么" → view_schedule(date=明天日期)
- "把X改成Y"/"X换成Y" → update_task 或 modify_schedule(action="update")
- "删掉X" → delete_task_proposal(单个) 或 batch_delete_schedule(批量)
- "加个X"/"安排X" → add_task 或 add_schedule
- "所有/全部X" → batch操作
- "完成了X" → complete_task 或 complete_big_task
- "有什么任务/DDL" → view_tasks 或 list_big_tasks
- "X和Y冲突吗" → check_conflicts
- "搜索/找找X" → view_schedule(keyword=X)"""
    }

    // ============ Multi-turn Tool Calling ============

    private suspend fun callWithTools(
        messages: MutableList<JsonObject>,
        appData: AppData,
        apiKey: String,
        provider: String,
        useReasoner: Boolean,
        depth: Int,
        tools: List<JsonObject> = AgentTools.AI_TOOLS_JSON
    ): ChatResponse {
        if (depth > 10) {
            return ChatResponse(content = "工具调用轮次过多，请简化您的请求。")
        }

        val result = try {
            aiApiClient.chat(
                apiKey = apiKey,
                provider = provider,
                messages = messages,
                tools = tools,
                useReasoner = useReasoner
            )
        } catch (e: Exception) {
            return ChatResponse(
                content = when {
                    e.message?.contains("429") == true -> "请求过于频繁，请稍等几秒再试。"
                    e.message?.contains("401") == true -> "API Key 无效，请在设置中检查。"
                    else -> "网络连接失败：${e.message}"
                }
            )
        }

        // If no tool calls, return direct content
        if (result.toolCalls.isEmpty()) {
            return ChatResponse(
                content = result.content.ifEmpty { "我没听懂，再说一遍？" },
                shouldRefresh = false
            )
        }

        // Process tool calls
        messages.add(aiApiClient.assistantMessage(result.content, result.toolCalls, null))

        var hasDataModification = false
        var proposalFromTool: Proposal? = null
        var currentAppData = appData

        for (tc in result.toolCalls) {
            val toolResult = AgentTools.executeTool(tc.function.name, tc.function.arguments, currentAppData)
            if (toolResult.shouldRefresh) hasDataModification = true
            if (toolResult.updatedAppData != null) currentAppData = toolResult.updatedAppData

            // Check for proposal in tool result
            try {
                val resultJson = json.parseToJsonElement(toolResult.json).jsonObject
                if (resultJson.containsKey("proposal")) {
                    val proposalJson = resultJson["proposal"]?.jsonObject
                    if (proposalJson != null) {
                        proposalFromTool = json.decodeFromString<Proposal>(proposalJson.toString())
                    }
                }
            } catch (e: Exception) { Log.w("AgentRepository", "Failed to parse proposal from tool result", e) }

            messages.add(aiApiClient.toolResultMessage(tc.id, toolResult.json))
        }

        // Make follow-up call with tool results, passing accumulated appData
        val followUp = callWithTools(messages, currentAppData, apiKey, provider, useReasoner, depth + 1, tools)

        // Merge results
        return followUp.copy(
            proposal = followUp.proposal ?: proposalFromTool,
            shouldRefresh = hasDataModification || followUp.shouldRefresh,
            updatedAppData = followUp.updatedAppData ?: currentAppData.takeIf { hasDataModification }
        )
    }

    // ============ Reasoning Detection ============

    private fun needsReasoning(message: String): Boolean {
        val keywords = listOf(
            "规划", "计划", "安排", "排", "调整", "优化", "整理", "重新",
            "帮我安排", "帮我规划", "帮我排", "怎么安排", "怎么规划",
            "推荐", "建议", "应该", "好不好", "合理", "更好",
            "冲突", "撞了", "重叠", "空闲", "有空",
            "本周", "下周", "本月", "这个月",
            "周计划", "日计划", "月计划", "学习计划", "复习计划",
            "课表", "选课", "加课", "退课", "换课",
            "添加", "新增", "增加", "删除", "移除", "修改", "改", "换",
            "取消", "推迟", "提前", "延期", "挪", "移",
            "添加日程", "加个", "建一个", "创建", "新建",
            "设置", "设为", "标记", "完成", "未完成",
            "批量", "全部删除", "全部改",
            "分析", "统计", "总结", "回顾", "对比", "比较",
            "多久", "频率", "规律", "习惯", "模式",
            "进度", "ddl", "deadline", "截止"
        )
        return keywords.any { message.contains(it, ignoreCase = true) }
    }

    // ============ Deep Planning ============

    /**
     * Send a message in deep planning mode with specialized system prompt and tools.
     */
    suspend fun deepPlanningChat(
        message: String,
        history: List<Map<String, String>>,
        appData: AppData,
        apiKey: String,
        provider: String,
        userProfile: String = ""
    ): ChatResponse {
        if (apiKey.isEmpty()) {
            return ChatResponse(
                content = "AI服务未配置，请在设置中输入API密钥。",
                shouldRefresh = false
            )
        }

        val systemPrompt = buildDeepPlanningSystemPrompt(userProfile)
        val messages = mutableListOf<JsonObject>()

        messages.add(aiApiClient.textMessage("system", systemPrompt))

        // History (last 15 messages for deep planning - more context needed)
        history.takeLast(15).forEach { msg ->
            val role = msg["role"] ?: "user"
            val content = msg["content"] ?: ""
            if (content.isNotEmpty()) {
                messages.add(aiApiClient.textMessage(role, content))
            }
        }

        messages.add(aiApiClient.textMessage("user", message))

        // Use filtered tools for deep planning
        val tools = AgentTools.DEEP_PLANNING_TOOLS

        val result = callWithTools(messages, appData, apiKey, provider, true, 0, tools)
        lastCompleteMessages.clear()
        lastCompleteMessages.addAll(messages)
        return result
    }

    private fun buildDeepPlanningSystemPrompt(userProfile: String): String {
        val now = java.time.LocalDateTime.now(java.time.ZoneId.of("UTC+8"))
        val today = now.toLocalDate().toString()
        val weekdayNames = listOf("日", "一", "二", "三", "四", "五", "六")
        val dateInfo = "今天是 $today（周${weekdayNames[now.dayOfWeek.value % 7]}）。时区 UTC+8。"

        var profileSection = ""
        if (userProfile.isNotBlank()) {
            profileSection = "\n\n【用户背景】\n${userProfile.trim()}"
        }

        return """你是 Mosa 的【深度规划模式】—— 战略人生顾问。

【当前日期】$dateInfo
$profileSection

【核心身份】
你不是普通的日程管理助手。你是一个有耐心的战略顾问，帮助用户思考5-10年维度的长期方向。

【最重要的原则：慢热与先问后答】

你的工作方式是咨询式的，不是报告生成器。真正的战略规划需要先充分了解一个人，再给出判断。

阶段一：信息收集（前3-5轮对话）
- 用户打招呼/说模糊的话时，不要开始"分析"。先回应，然后问1-2个关键问题。
- 你需要了解的核心信息（按优先级）：
  1. 用户现在在做什么（学生？工作？什么领域？）
  2. 用户有没有一个模糊的方向或困惑
  3. 用户最在意的是什么（钱？自由？成就感？影响力？）
  4. 用户觉得目前最大的瓶颈是什么
- 每次回复只问1-2个问题，不要一次性问太多。让对话自然流动。

阶段二：诊断与挑战（信息基本清楚后）
- 先用你自己的话复述一遍你对用户情况的理解
- 指出你看到的1-2个可能的认知盲区或矛盾点
- 问："我理解得对吗？还有我没覆盖到的重要方面吗？"

阶段三：结构化分析（确认理解之后）
- 只有在你对用户有了足够具体的了解后，才使用量化分析工具和框架
- 分析要有针对性，针对这个具体的人

【对话风格】
- 像一个聪明的朋友在认真听你说话，而不是一个PPT机器
- 简洁。每条回复不超过4-5行。
- 可以用口语化的表达
- 敢于说"我不确定，但我的直觉是..."——这比装作什么都知道更有价值

【核心原则】
1. 远见性思维：引导用户思考更长期的影响
2. 客观理性：不附和。如果想法有明显漏洞，直接指出
3. 量化分析：在适当时机使用数据和量化方法（阶段三）
4. 挑战性提问：提出用户可能忽视的问题

【禁止行为】
- 用户只是打个招呼你就开始"战略分析"
- 在不了解用户的情况下给具体建议
- 说"这个想法很好"之类的空话
- 进行日常日程安排（这不是你的职责范围）
- 一次输出超过6段长文

【可用工具】（仅在阶段三、且确实需要时调用）
- value_monetization: 价值货币化评估
- roi_calculator: ROI投资回报率计算
- milestone_planner: 里程碑拆解
- swot_analysis: SWOT四象限分析
- decision_matrix: 多维度加权决策矩阵
- view_schedule: 查看用户日程（只读）"""
    }

    // ============ ReAct Transcription ============

    fun generateReActLog(): String {
        if (lastCompleteMessages.isEmpty()) return "暂无对话记录"

        val sb = StringBuilder()
        var hasToolCalls = false
        var question = ""

        for (i in lastCompleteMessages.indices) {
            val msg = lastCompleteMessages[i]
            val role = msg["role"]?.jsonPrimitive?.contentOrNull ?: continue

            when (role) {
                "system" -> { /* skip */ }
                "user" -> {
                    val content = msg["content"]?.jsonPrimitive?.contentOrNull ?: ""
                    if (content.isNotEmpty() && question.isEmpty()) {
                        question = content
                        sb.appendLine("Question: $question")
                        sb.appendLine()
                    }
                }
                "assistant" -> {
                    val toolCalls = msg["tool_calls"]?.jsonArray
                    val content = msg["content"]?.jsonPrimitive?.contentOrNull ?: ""

                    if (toolCalls != null && toolCalls.isNotEmpty()) {
                        hasToolCalls = true
                        for (tc in toolCalls) {
                            val tcObj = tc.jsonObject
                            val func = tcObj["function"]?.jsonObject
                            val toolName = func?.get("name")?.jsonPrimitive?.contentOrNull ?: "unknown"
                            val argsStr = func?.get("arguments")?.jsonPrimitive?.contentOrNull ?: "{}"
                            val tcId = tcObj["id"]?.jsonPrimitive?.contentOrNull ?: ""

                            val thoughts = mapOf(
                                "web_search_evaluate" to "用户需要搜索相关信息来获取资料。",
                                "view_schedule" to "我需要先查看相关日期的日程安排，了解当前的时间占用情况。",
                                "add_schedule" to "根据分析结果，我将为用户安排新的日程时段。",
                                "estimate_task_time" to "在规划之前，我需要估算这个任务大概需要多长时间。",
                                "manage_tasks" to "我需要管理任务。",
                                "manage_big_tasks" to "我需要处理大任务。",
                                "check_conflicts" to "我需要检查是否存在日程冲突。",
                                "modify_schedule" to "我需要对日程进行调整。",
                                "analyze" to "我需要分析日程数据。",
                                "manage_courses" to "我需要管理课程信息。",
                                "manage_templates" to "我需要处理日程模板。",
                                "value_monetization" to "我正在评估用户目标的价值潜力。",
                                "roi_calculator" to "我正在计算投入回报率。",
                                "milestone_planner" to "我正在将长期目标拆解为里程碑。",
                                "swot_analysis" to "我正在对相关主题进行结构化SWOT分析。",
                                "decision_matrix" to "我正在构建多维度决策矩阵。"
                            )

                            val thought = thoughts[toolName] ?: "我需要使用 $toolName 工具来完成这个步骤。"
                            sb.append("Thought: $thought\n")
                            sb.append("Action: $toolName($argsStr)\n")

                            for (j in i + 1 until lastCompleteMessages.size) {
                                val futureMsg = lastCompleteMessages[j]
                                if (futureMsg["role"]?.jsonPrimitive?.contentOrNull == "tool" &&
                                    futureMsg["tool_call_id"]?.jsonPrimitive?.contentOrNull == tcId) {
                                    val result = futureMsg["content"]?.jsonPrimitive?.contentOrNull ?: ""
                                    val truncated = if (result.length > 300) result.take(300) + "...(截断)" else result
                                    sb.append("Observation: $truncated\n\n")
                                    break
                                }
                            }
                        }
                    } else if (content.isNotEmpty()) {
                        if (hasToolCalls) {
                            sb.append("Thought: 我已经获得了所需的信息，可以给出最终答案了。\n")
                            sb.append("Final Answer: $content\n")
                        } else if (question.isNotEmpty()) {
                            sb.append("Final Answer: $content\n")
                        }
                    }
                }
            }
        }

        if (!hasToolCalls && question.isNotEmpty()) {
            val lastAnswer = lastCompleteMessages.lastOrNull {
                it["role"]?.jsonPrimitive?.contentOrNull == "assistant" &&
                (it["content"]?.jsonPrimitive?.contentOrNull ?: "").isNotEmpty() &&
                it["tool_calls"] == null
            }?.get("content")?.jsonPrimitive?.contentOrNull ?: "(no response)"
            return "Question: $question\n\nFinal Answer: $lastAnswer\n"
        }

        return sb.toString().ifEmpty { "Question: (empty conversation)\n\nFinal Answer: (no response)" }
    }
}
