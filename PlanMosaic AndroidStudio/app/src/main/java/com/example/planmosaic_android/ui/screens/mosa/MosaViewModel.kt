package com.example.planmosaic_android.ui.screens.mosa

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.planmosaic_android.AppContainer
import com.example.planmosaic_android.PlanMosaicApplication
import com.example.planmosaic_android.data.repository.AgentRepository
import com.example.planmosaic_android.data.repository.ScheduleRepository
import com.example.planmosaic_android.model.AppData
import com.example.planmosaic_android.model.ChatMessage
import com.example.planmosaic_android.model.Proposal
import com.example.planmosaic_android.util.AgentTools
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

enum class MosaTab { CHAT, DEEP_PLANNING }

data class MosaUiState(
    val currentTab: MosaTab = MosaTab.CHAT,
    val messages: List<ChatMessage> = listOf(
        ChatMessage(role = "assistant", content = "在。", timestamp = Instant.now().toString())
    ),
    val inputText: String = "",
    val isTyping: Boolean = false,
    val activeProposal: Proposal? = null,
    val pendingProposalMessageIndex: Int = -1,
    val error: String = "",
    val dpMessages: List<ChatMessage> = listOf(
        ChatMessage(
            role = "assistant",
            content = "你好。我是Mosa的战略规划模式。\n\n在这个模式下，我们可以一起探讨你的长期目标、人生方向和战略决策。不需要寒暄，直接告诉我你在思考什么。",
            timestamp = Instant.now().toString()
        )
    ),
    val dpInputText: String = "",
    val dpIsTyping: Boolean = false,
    val dpError: String = "",
    val startupMessage: String? = null,
    val isStartupScanning: Boolean = false,
    val todayScheduleSummary: String = "",
    val hasConflict: Boolean = false,
    val conflictMessage: String = "",
    val suggestedAlternative: String = "",
    val pendingConflictText: String = "",
    val reactLogText: String = "",
    val showReActDialog: Boolean = false,
    val isGeneratingReAct: Boolean = false
)

sealed interface MosaEvent {
    data class SwitchTab(val tab: MosaTab) : MosaEvent
    data class UpdateInput(val text: String) : MosaEvent
    data object SendMessage : MosaEvent
    data class ApproveProposal(val appData: AppData) : MosaEvent
    data object RejectProposal : MosaEvent
    data class UpdateDpInput(val text: String) : MosaEvent
    data object SendDpMessage : MosaEvent
    data class SendQuickPrompt(val prompt: String) : MosaEvent
    data class SendChatQuickPrompt(val prompt: String) : MosaEvent
    data object ForceAddTask : MosaEvent
    data object AdjustTaskTime : MosaEvent
    data object GenerateReActLog : MosaEvent
    data object DismissReActDialog : MosaEvent
}

class MosaViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "MosaViewModel"
    }

    private val _uiState = MutableStateFlow(MosaUiState())
    val uiState: StateFlow<MosaUiState> = _uiState.asStateFlow()

    private val container = AppContainer.from(getApplication<PlanMosaicApplication>())
    private val scheduleRepository = ScheduleRepository(
        container.userFileStorage, container.authManager, container.supabaseClient
    )

    private val agentRepository = AgentRepository(container.aiApiClient)

    private val normalChatSession = NormalChatSession(
        agentRepository,
        container.userFileStorage
    )

    private val deepPlanningSession = DeepPlanningSession(
        agentRepository,
        container.userFileStorage
    )

    private var appData: AppData = AppData()

    var onThemeChangeRequest: ((String) -> Unit)? = null

    init {
        loadAppData()
        loadSessions()
        observeUserSwitch()
    }

    private fun loadAppData() {
        viewModelScope.launch {
            val userId = container.authManager.userId
            appData = if (userId != null) {
                try {
                    scheduleRepository.fullSync(userId)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to load app data sync", e)
                    scheduleRepository.loadLocalData(userId) ?: AppData()
                }
            } else {
                AppData()
            }
        }
    }

    private fun loadSessions() {
        viewModelScope.launch {
            val userId = container.authManager.userId
            if (userId != null) {
                normalChatSession.loadHistory(userId)
                deepPlanningSession.loadHistory(userId)
            }
            updateUiStateFromSessions()
        }
    }

    private fun updateUiStateFromSessions() {
        _uiState.update { state ->
            state.copy(
                messages = normalChatSession.messages.value,
                inputText = normalChatSession.inputText.value,
                isTyping = normalChatSession.isTyping.value,
                error = normalChatSession.error.value,
                dpMessages = deepPlanningSession.messages.value,
                dpInputText = deepPlanningSession.inputText.value,
                dpIsTyping = deepPlanningSession.isTyping.value,
                dpError = deepPlanningSession.error.value
            )
        }
    }

    private fun observeUserSwitch() {
        viewModelScope.launch {
            var lastUserId: String? = null
            container.authManager.currentUser.collect { user ->
                val currentUserId = user?.userId
                if (currentUserId != lastUserId) {
                    lastUserId = currentUserId
                    normalChatSession.clearHistory()
                    deepPlanningSession.clearHistory()
                    if (user != null) {
                        loadAppData()
                        normalChatSession.loadHistory(user.userId)
                        deepPlanningSession.loadHistory(user.userId)
                    }
                    updateUiStateFromSessions()
                }
            }
        }
    }

    fun onEvent(event: MosaEvent) {
        when (event) {
            is MosaEvent.SwitchTab -> {
                _uiState.update { it.copy(currentTab = event.tab) }
            }
            is MosaEvent.UpdateInput -> {
                normalChatSession.updateInput(event.text)
                updateUiStateFromSessions()
            }
            is MosaEvent.SendMessage -> {
                viewModelScope.launch {
                    val text = normalChatSession.inputText.value.trim()
                    if (text.isBlank()) return@launch
                    _uiState.update { it.copy(hasConflict = false, conflictMessage = "", suggestedAlternative = "", pendingConflictText = "") }
                    val intent = detectIntent(text)
                    handleChatIntent(text, intent)
                }
            }
            is MosaEvent.ApproveProposal -> {
                val proposal = _uiState.value.activeProposal ?: return
                val (success, msg) = AgentTools.executeProposal(proposal, event.appData)
                if (success) {
                    appData = event.appData
                    viewModelScope.launch {
                        val userId = container.authManager.userId
                        if (userId != null) {
                            scheduleRepository.saveLocalData(userId, appData)
                            scheduleRepository.saveCloudData(userId, appData)
                        }
                    }
                }
                val responseMsg = if (success) "已完成。$msg" else "操作失败：$msg"
                normalChatSession.addAssistantMessage(responseMsg)
                _uiState.update { state ->
                    state.copy(
                        messages = normalChatSession.messages.value,
                        activeProposal = null,
                        isTyping = false
                    )
                }
                viewModelScope.launch {
                    val userId = container.authManager.userId ?: return@launch
                    normalChatSession.saveHistory(userId)
                }
            }
            is MosaEvent.RejectProposal -> {
                normalChatSession.addAssistantMessage("已取消。")
                _uiState.update { state ->
                    state.copy(
                        messages = normalChatSession.messages.value,
                        activeProposal = null,
                        isTyping = false
                    )
                }
                viewModelScope.launch {
                    val userId = container.authManager.userId ?: return@launch
                    normalChatSession.saveHistory(userId)
                }
            }
            is MosaEvent.UpdateDpInput -> {
                deepPlanningSession.updateInput(event.text)
                updateUiStateFromSessions()
            }
            is MosaEvent.SendDpMessage -> {
                viewModelScope.launch {
                    val text = deepPlanningSession.inputText.value.trim()
                    if (text.isBlank()) return@launch
                    sendDeepPlanningMessage(text)
                }
            }
            is MosaEvent.SendQuickPrompt -> {
                if (deepPlanningSession.isTyping.value) return
                viewModelScope.launch {
                    sendDeepPlanningMessage(event.prompt)
                }
            }
            is MosaEvent.SendChatQuickPrompt -> {
                viewModelScope.launch {
                    val text = event.prompt.trim()
                    if (text.isBlank()) return@launch
                    _uiState.update { it.copy(hasConflict = false, conflictMessage = "", suggestedAlternative = "", pendingConflictText = "") }
                    val intent = detectIntent(text)
                    handleChatIntent(text, intent)
                }
            }
            is MosaEvent.ForceAddTask -> {
                viewModelScope.launch {
                    val pendingText = _uiState.value.pendingConflictText
                    _uiState.update { it.copy(hasConflict = false, conflictMessage = "", suggestedAlternative = "", pendingConflictText = "") }
                    handleGeneralChat(pendingText)
                }
            }
            is MosaEvent.AdjustTaskTime -> {
                viewModelScope.launch {
                    val pendingText = _uiState.value.pendingConflictText
                    val alt = _uiState.value.suggestedAlternative
                    val adjustedText = buildAdjustedText(pendingText, alt)
                    _uiState.update { it.copy(hasConflict = false, conflictMessage = "", suggestedAlternative = "", pendingConflictText = "") }
                    if (adjustedText != null) {
                        handleGeneralChat(adjustedText)
                    } else {
                        normalChatSession.addAssistantMessage("无法自动调整时间，请手动修改后重试～")
                        updateUiStateFromSessions()
                        saveChatHistory()
                    }
                }
            }
            is MosaEvent.GenerateReActLog -> {
                _uiState.update { it.copy(isGeneratingReAct = true) }
                val log = agentRepository.generateReActLog()
                _uiState.update { it.copy(
                    reactLogText = log,
                    showReActDialog = true,
                    isGeneratingReAct = false
                ) }
            }
            is MosaEvent.DismissReActDialog -> {
                _uiState.update { it.copy(showReActDialog = false, reactLogText = "") }
            }
        }
    }

    private suspend fun sendDeepPlanningMessage(text: String) {
        loadAppDataSync()
        val apiKey = getCurrentApiKey()
        val provider = appData.settings.provider
        try {
            deepPlanningSession.sendMessage(text, appData, apiKey, provider, appData.userProfile)
            updateUiStateFromSessions()
            val userId = container.authManager.userId
            if (userId != null) {
                deepPlanningSession.saveHistory(userId)
            }
        } catch (e: Exception) {
            updateUiStateFromSessions()
        }
    }

    private suspend fun loadAppDataSync() {
        val userId = container.authManager.userId
        appData = if (userId != null) {
            try {
                scheduleRepository.fullSync(userId)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to load app data sync", e)
                scheduleRepository.loadLocalData(userId) ?: AppData()
            }
        } else {
            AppData()
        }
    }

    private fun getCurrentApiKey(): String {
        return when (appData.settings.provider) {
            "qwen" -> appData.apiKeys.qwen
            else -> appData.apiKeys.deepseek
        }
    }

    private fun handleDataRefresh(response: AgentRepository.ChatResponse) {
        if (response.shouldRefresh) {
            if (response.updatedAppData != null) {
                appData = response.updatedAppData
            }
            viewModelScope.launch {
                val userId = container.authManager.userId
                if (userId != null) {
                    scheduleRepository.saveLocalData(userId, appData)
                    scheduleRepository.saveCloudData(userId, appData)
                }
            }
        }
    }

    private suspend fun handleChatIntent(text: String, intent: String) {
        when (intent) {
            "toggle_theme" -> {
                val newTheme = if (appData.settings.theme == "dark") "light" else "dark"
                appData = appData.copy(settings = appData.settings.copy(theme = newTheme))
                saveAppData()
                onThemeChangeRequest?.invoke(newTheme)
                normalChatSession.addUserMessage(text)
                normalChatSession.addAssistantMessage("已切换到${if (newTheme == "dark") "深色" else "浅色"}模式～")
                updateUiStateFromSessions()
                saveChatHistory()
            }
            "dark_mode" -> {
                appData = appData.copy(settings = appData.settings.copy(theme = "dark"))
                saveAppData()
                onThemeChangeRequest?.invoke("dark")
                normalChatSession.addUserMessage(text)
                normalChatSession.addAssistantMessage("已切换到深色模式，保护眼睛～🌙")
                updateUiStateFromSessions()
                saveChatHistory()
            }
            "light_mode" -> {
                appData = appData.copy(settings = appData.settings.copy(theme = "light"))
                saveAppData()
                onThemeChangeRequest?.invoke("light")
                normalChatSession.addUserMessage(text)
                normalChatSession.addAssistantMessage("已切换到浅色模式～☀️")
                updateUiStateFromSessions()
                saveChatHistory()
            }
            "view_today_schedule" -> {
                loadAppDataSync()
                val today = LocalDate.now(ZoneId.of("UTC+8"))
                val summary = buildScheduleSummary(today)
                normalChatSession.addUserMessage(text)
                normalChatSession.addAssistantMessage(summary)
                updateUiStateFromSessions()
                saveChatHistory()
            }
            "view_tomorrow_schedule" -> {
                loadAppDataSync()
                val tomorrow = LocalDate.now(ZoneId.of("UTC+8")).plusDays(1)
                val summary = buildScheduleSummary(tomorrow)
                normalChatSession.addUserMessage(text)
                normalChatSession.addAssistantMessage(summary)
                updateUiStateFromSessions()
                saveChatHistory()
            }
            "add_task" -> {
                loadAppDataSync()
                val timeRange = extractTimeRange(text)
                if (timeRange != null) {
                    val (hasConflict, conflictMsg) = checkTimeSlotConflict(timeRange)
                    if (hasConflict) {
                        val durationMinutes = timeRange.second - timeRange.first
                        val suggestion = findAlternativeSlots(durationMinutes)
                        _uiState.update { it.copy(
                            hasConflict = true,
                            conflictMessage = conflictMsg,
                            suggestedAlternative = suggestion,
                            pendingConflictText = text
                        )}
                        normalChatSession.addUserMessage(text)
                        normalChatSession.addAssistantMessage("$conflictMsg\n\n$suggestion 要调整一下时间吗？😊")
                        updateUiStateFromSessions()
                        saveChatHistory()
                        return
                    }
                }
                handleGeneralChat(text)
            }
            "open_schedule_view" -> {
                loadAppDataSync()
                val today = LocalDate.now(ZoneId.of("UTC+8"))
                val summary = buildScheduleSummary(today)
                normalChatSession.addUserMessage(text)
                normalChatSession.addAssistantMessage(summary)
                updateUiStateFromSessions()
                saveChatHistory()
            }
            else -> {
                handleGeneralChat(text)
            }
        }
    }

    private suspend fun handleGeneralChat(text: String) {
        loadAppDataSync()
        val apiKey = getCurrentApiKey()
        val provider = appData.settings.provider
        try {
            val response = normalChatSession.sendMessage(
                text, appData, apiKey, provider, appData.userProfile
            )
            updateUiStateFromSessions()
            _uiState.update { it.copy(activeProposal = response.proposal) }
            handleDataRefresh(response)
            saveChatHistory()
        } catch (e: Exception) {
            updateUiStateFromSessions()
        }
    }

    fun detectIntent(message: String): String {
        val msg = message.trim()

        if (Regex("今天有什么安排|今天有什么|今日日程|今天日程|今天安排|看看今天").containsMatchIn(msg)) {
            return "view_today_schedule"
        }
        if (Regex("明天有什么|明天安排|明日日程|明天日程|看看明天").containsMatchIn(msg)) {
            return "view_tomorrow_schedule"
        }
        if (Regex("添加|加个|安排|新增|创建").containsMatchIn(msg) &&
            Regex("\\d+点|\\d+:\\d+|上午|下午|早上|中午|晚上|凌晨|点|分").containsMatchIn(msg)) {
            return "add_task"
        }
        if (Regex("查看完整日程|打开日历|查看日历|完整日程|打开日程").containsMatchIn(msg)) {
            return "open_schedule_view"
        }
        if (Regex("切换深色|深色模式|暗黑模式|切换浅色|浅色模式").containsMatchIn(msg)) {
            return "toggle_theme"
        }
        if (Regex("切换到深色|夜间模式|深色主题|暗色模式").containsMatchIn(msg)) {
            return "dark_mode"
        }
        if (Regex("切换到浅色|日间模式|浅色主题|亮色模式").containsMatchIn(msg)) {
            return "light_mode"
        }

        return "general"
    }

    private fun extractTimeRange(message: String): Pair<Int, Int>? {
        val colonPattern = Regex("""(\d{1,2})[:：](\d{2})\s*[-到至]\s*(\d{1,2})[:：](\d{2})""")
        val colonMatch = colonPattern.find(message)
        if (colonMatch != null) {
            val startHour = colonMatch.groupValues[1].toInt()
            val startMin = colonMatch.groupValues[2].toInt()
            val endHour = colonMatch.groupValues[3].toInt()
            val endMin = colonMatch.groupValues[4].toInt()
            return Pair(startHour * 60 + startMin, endHour * 60 + endMin)
        }

        val hourPattern = Regex("""(\d{1,2})\s*点\s*[-到至]\s*(\d{1,2})\s*点""")
        val hourMatch = hourPattern.find(message)
        if (hourMatch != null) {
            val startHour = hourMatch.groupValues[1].toInt()
            val endHour = hourMatch.groupValues[2].toInt()
            return Pair(startHour * 60, endHour * 60)
        }

        val singleHourPattern = Regex("""(\d{1,2})\s*点""")
        val singleMatch = singleHourPattern.find(message)
        if (singleMatch != null) {
            val startHour = singleMatch.groupValues[1].toInt()
            return Pair(startHour * 60, (startHour + 1) * 60)
        }

        return null
    }

    private fun parseSlotTime(time: String): Pair<Int, Int>? {
        val pattern = Regex("""(\d{1,2})[:：](\d{2})\s*[-到至]\s*(\d{1,2})[:：](\d{2})""")
        val match = pattern.find(time)
        if (match != null) {
            val startHour = match.groupValues[1].toInt()
            val startMin = match.groupValues[2].toInt()
            val endHour = match.groupValues[3].toInt()
            val endMin = match.groupValues[4].toInt()
            return Pair(startHour * 60 + startMin, endHour * 60 + endMin)
        }
        return null
    }

    private fun checkTimeSlotConflict(timeRange: Pair<Int, Int>): Pair<Boolean, String> {
        val todayStr = LocalDate.now(ZoneId.of("UTC+8")).toString()
        val todaySchedule = appData.schedules[todayStr] ?: return Pair(false, "")

        for (slot in todaySchedule.timeSlots) {
            val existingTime = parseSlotTime(slot.time)
            if (existingTime != null) {
                if (timeRange.first < existingTime.second && timeRange.second > existingTime.first) {
                    val conflictMsg = "⚠️ ${formatMinutes(timeRange.first)}-${formatMinutes(timeRange.second)} 和已有的「${slot.activity}」(${slot.time}) 时间冲突了哦～"
                    return Pair(true, conflictMsg)
                }
            }
        }

        return Pair(false, "")
    }

    private fun findAlternativeSlots(durationMinutes: Int): String {
        val todayStr = LocalDate.now(ZoneId.of("UTC+8")).toString()
        val todaySchedule = appData.schedules[todayStr]

        val busySlots = todaySchedule?.timeSlots?.mapNotNull { parseSlotTime(it.time) } ?: emptyList()

        val candidateSlots = listOf(
            Pair(8 * 60, 10 * 60),
            Pair(10 * 60, 12 * 60),
            Pair(14 * 60, 16 * 60),
            Pair(16 * 60, 18 * 60),
            Pair(19 * 60, 21 * 60)
        )

        val freeSlots = candidateSlots.filter { candidate ->
            busySlots.none { busy ->
                candidate.first < busy.second && candidate.second > busy.first
            }
        }

        if (freeSlots.isNotEmpty()) {
            val suggestion = freeSlots.first()
            return "建议安排在 ${formatMinutes(suggestion.first)}-${formatMinutes(suggestion.second)}，目前这个时段还是空闲的～"
        }

        return "今天主要时段都已有安排，可以考虑放到明天哦～"
    }

    private fun buildAdjustedText(originalText: String, suggestion: String): String? {
        val timePattern = Regex("""(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})""")
        val match = timePattern.find(suggestion) ?: return null
        val suggestedTime = "${match.groupValues[1]}-${match.groupValues[2]}"

        val colonPattern = Regex("""\d{1,2}[:：]\d{2}\s*[-到至]\s*\d{1,2}[:：]\d{2}""")
        if (colonPattern.containsMatchIn(originalText)) {
            return colonPattern.replace(originalText, suggestedTime)
        }

        val hourPattern = Regex("""\d{1,2}\s*点\s*[-到至]\s*\d{1,2}\s*点""")
        if (hourPattern.containsMatchIn(originalText)) {
            return hourPattern.replace(originalText, suggestedTime)
        }

        val singleHourPattern = Regex("""\d{1,2}\s*点""")
        if (singleHourPattern.containsMatchIn(originalText)) {
            return singleHourPattern.replace(originalText, suggestedTime)
        }

        return "$originalText（时间调整为$suggestedTime）"
    }

    private fun buildScheduleSummary(date: LocalDate): String {
        val dateStr = date.toString()
        val schedule = appData.schedules[dateStr]
        val dateLabel = if (date == LocalDate.now(ZoneId.of("UTC+8"))) "今天" else "明天"

        if (schedule == null) {
            return "$dateLabel（$dateStr）暂无日程安排，好好享受这一天吧～✨"
        }

        return buildString {
            if (schedule.title.isNotBlank()) {
                append("📋 ${schedule.title}\n\n")
            }
            if (schedule.timeSlots.isNotEmpty()) {
                append("⏰ 时段安排：\n")
                schedule.timeSlots.forEach { slot ->
                    append("  • ${slot.time} ${slot.activity}")
                    if (slot.detail.isNotBlank()) append(" — ${slot.detail}")
                    append("\n")
                }
                append("\n")
            }
            if (schedule.tasks.isNotEmpty()) {
                append("📌 任务列表：\n")
                schedule.tasks.forEach { task ->
                    val status = if (task.completed) "✅" else "⬜"
                    append("  $status ${task.name}")
                    if (task.estimated.isNotBlank()) append("（预计${task.estimated}）")
                    append("\n")
                }
                append("\n")
            }
            if (schedule.highlights.isNotBlank()) {
                append("🌟 ${schedule.highlights}\n")
            }
        }.trimEnd()
    }

    private fun formatMinutes(totalMinutes: Int): String {
        val hours = totalMinutes / 60
        val minutes = totalMinutes % 60
        return "${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}"
    }

    private fun saveAppData() {
        viewModelScope.launch {
            val userId = container.authManager.userId
            if (userId != null) {
                scheduleRepository.saveLocalData(userId, appData)
                scheduleRepository.saveCloudData(userId, appData)
            }
        }
    }

    private suspend fun saveChatHistory() {
        val userId = container.authManager.userId
        if (userId != null) {
            normalChatSession.saveHistory(userId)
        }
    }

    fun performStartupScan() {
        viewModelScope.launch {
            _uiState.update { it.copy(isStartupScanning = true) }

            val hour = LocalTime.now(ZoneId.of("UTC+8")).hour
            val period = when (hour) {
                in 6..11 -> "早上"
                in 12..13 -> "中午"
                in 14..17 -> "下午"
                in 18..22 -> "晚上"
                else -> "夜深"
            }

            val greeting = when (period) {
                "早上" -> "早上好呀～☀️"
                "中午" -> "中午好～🌤️"
                "下午" -> "下午好～今天辛苦了 🌿"
                "晚上" -> "晚上好～🌙"
                "夜深" -> "夜深了，还在忙吗？✨"
                else -> "你好呀～👋"
            }

            val todayStr = LocalDate.now(ZoneId.of("UTC+8")).toString()
            val todaySchedule = appData.schedules[todayStr]

            val scheduleSummary = buildString {
                if (todaySchedule != null) {
                    if (todaySchedule.title.isNotBlank()) {
                        append("📋 ${todaySchedule.title}")
                        append("\n")
                    }
                    if (todaySchedule.highlights.isNotBlank()) {
                        append("🌟 ${todaySchedule.highlights}")
                        append("\n")
                    }
                    val pendingTasks = todaySchedule.tasks.filter { !it.completed }
                    if (pendingTasks.isNotEmpty()) {
                        append("📌 待完成：${pendingTasks.size} 项任务")
                        append("\n")
                    }
                    if (todaySchedule.timeSlots.isNotEmpty()) {
                        append("⏰ ${todaySchedule.timeSlots.size} 个时段安排")
                    }
                }
                if (isEmpty()) {
                    append("今天暂无日程安排，享受当下吧～")
                }
            }

            val yesterday = LocalDate.now(ZoneId.of("UTC+8")).minusDays(1)
            val yesterdayStr = yesterday.toString()
            val yesterdaySchedule = appData.schedules[yesterdayStr]
            val yesterdayUncompleted = yesterdaySchedule?.tasks?.filter { !it.completed } ?: emptyList()

            val finalStartupMessage = if (yesterdayUncompleted.isNotEmpty()) {
                "$greeting\n\n另外，昨天有 ${yesterdayUncompleted.size} 项任务还没完成哦～需要我帮你重新安排到今天吗？💪"
            } else {
                greeting
            }

            _uiState.update {
                it.copy(
                    startupMessage = finalStartupMessage,
                    isStartupScanning = false,
                    todayScheduleSummary = scheduleSummary.trim()
                )
            }
        }
    }

    fun getAppData(): AppData = appData

    fun updateAppData(newData: AppData) {
        appData = newData
    }
}