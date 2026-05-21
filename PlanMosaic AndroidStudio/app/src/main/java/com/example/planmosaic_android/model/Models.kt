package com.example.planmosaic_android.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DaySchedule(
    val date: String = "",
    val title: String = "",
    val highlights: String = "",
    val milestone: String = "",
    val timeSlots: List<TimeSlot> = emptyList(),
    val tasks: List<Task> = emptyList()
)

@Serializable
data class TimeSlot(
    val time: String = "",
    val activity: String = "",
    val detail: String = "",
    val icon: String = ""
)

@Serializable
data class Task(
    val name: String = "",
    val estimated: String = "",
    val actual: String = "",
    val note: String = "",
    val completed: Boolean = false
)

@Serializable
data class BigTask(
    val name: String = "",
    val estimated: Int = 0,
    @SerialName("ddl")
    val ddl: String? = null,
    @SerialName("startDate")
    val startDate: String? = null,
    val note: String = "",
    val type: String = "short",
    val completed: Boolean = false,
    @SerialName("createdAt")
    val createdAt: String? = null,
    @SerialName("completedAt")
    val completedAt: String? = null
)

@Serializable
data class ChatMessage(
    val role: String = "user",
    val content: String = "",
    val timestamp: String = "",
    val proposal: Proposal? = null,
    val thinkingContent: String = ""
)

// ============ AI Agent Models ============

@Serializable
data class ApiKeys(
    val deepseek: String = "",
    val qwen: String = ""
)

@Serializable
data class AgentSettings(
    val theme: String = "light",
    val provider: String = "deepseek"
)

@Serializable
sealed class Proposal {
    @Serializable
    @SerialName("batch_delete_schedule")
    data class BatchDeleteSchedule(
        val dates: List<String> = emptyList(),
        val reason: String = ""
    ) : Proposal()

    @Serializable
    @SerialName("delete_task")
    data class DeleteTask(
        val date: String = "",
        val taskName: String = "",
        val reason: String = ""
    ) : Proposal()

    @Serializable
    @SerialName("update_task")
    data class UpdateTask(
        val date: String = "",
        val oldTaskName: String = "",
        val newTaskName: String = "",
        val newEstimatedMinutes: Int = 0,
        val reason: String = ""
    ) : Proposal()

    @Serializable
    @SerialName("delete_big_task")
    data class DeleteBigTask(
        val taskName: String = "",
        val reason: String = ""
    ) : Proposal()

    @Serializable
    @SerialName("update_big_task")
    data class UpdateBigTask(
        val oldTaskName: String = "",
        val newTaskName: String = "",
        val newEstimatedMinutes: Int = 0,
        val newDdl: String = "",
        val reason: String = ""
    ) : Proposal()

    @Serializable
    @SerialName("batch_delete_tasks")
    data class BatchDeleteTasks(
        val tasks: List<ProposalTask> = emptyList(),
        val reason: String = ""
    ) : Proposal()

    @Serializable
    @SerialName("batch_delete_big_tasks")
    data class BatchDeleteBigTasks(
        val taskNames: List<String> = emptyList(),
        val reason: String = ""
    ) : Proposal()

    @Serializable
    @SerialName("modify_schedule")
    data class ModifySchedule(
        val date: String = "",
        val operation: String = "",
        val changes: List<String> = emptyList(),
        val reason: String = "",
        val timeSlots: List<String> = emptyList(),
        val newSlotDetails: TimeSlot? = null,
        val criteria: ProposalCriteria? = null,
        val newDetails: ProposalNewDetails? = null,
        val dates: List<String> = emptyList(),
        val title: String = "",
        val taskName: String = ""
    ) : Proposal()

    @Serializable
    @SerialName("apply_template")
    data class ApplyTemplate(
        val templateName: String = "",
        val targetDate: String = "",
        val templateData: String = ""
    ) : Proposal()
}

@Serializable
data class ProposalTask(
    val date: String = "",
    val task_name: String = ""
)

@Serializable
data class ProposalCriteria(
    val keyword: String = "",
    val day_of_week: String = "",
    val activity: String = ""
)

@Serializable
data class ProposalNewDetails(
    val time: String = "",
    val activity: String = "",
    val detail: String = ""
)

@Serializable
data class ScheduleTemplate(
    val id: Long = 0,
    val name: String = "",
    val startDate: String = "",
    val totalWeeks: Int = 0,
    val timeSlots: List<TemplateTimeSlot> = emptyList(),
    val oddWeekCourses: Map<String, CourseCell> = emptyMap(),
    val evenWeekCourses: Map<String, CourseCell> = emptyMap()
)

@Serializable
data class TemplateTimeSlot(
    val label: String = "",
    val startTime: String = "",
    val endTime: String = ""
)

@Serializable
data class CourseCell(
    val course: String = "",
    val mergeSpan: Int = 1
)

@Serializable
data class AppData(
    val startDate: String = "",
    val endDate: String = "",
    val schedules: Map<String, DaySchedule> = emptyMap(),
    val bigTasks: List<BigTask> = emptyList(),
    val bigTaskHistory: List<BigTask> = emptyList(),
    val scheduleTemplates: List<ScheduleTemplate> = emptyList(),
    val apiKeys: ApiKeys = ApiKeys(),
    val settings: AgentSettings = AgentSettings(),
    val userProfile: String = ""
)
