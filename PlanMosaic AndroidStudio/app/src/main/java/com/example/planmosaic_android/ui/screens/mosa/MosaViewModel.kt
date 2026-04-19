package com.example.planmosaic_android.ui.screens.mosa

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.planmosaic_android.data.repository.AgentRepository
import com.example.planmosaic_android.data.repository.ScheduleRepository
import com.example.planmosaic_android.model.AppData
import com.example.planmosaic_android.model.ChatMessage
import com.example.planmosaic_android.model.Proposal
import com.example.planmosaic_android.util.AgentTools
import com.example.planmosaic_android.util.AuthManager
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant

/** Tab selection for Mosa modes */
enum class MosaTab { CHAT, DEEP_PLANNING }

data class MosaUiState(
    val currentTab: MosaTab = MosaTab.CHAT,
    // Normal chat state
    val messages: List<ChatMessage> = listOf(
        ChatMessage(role = "assistant", content = "在。", timestamp = Instant.now().toString())
    ),
    val inputText: String = "",
    val isTyping: Boolean = false,
    val activeProposal: Proposal? = null,
    val pendingProposalMessageIndex: Int = -1,
    val error: String = "",
    // Deep planning state
    val dpMessages: List<ChatMessage> = listOf(
        ChatMessage(
            role = "assistant",
            content = "你好。我是Mosa的战略规划模式。\n\n在这个模式下，我们可以一起探讨你的长期目标、人生方向和战略决策。不需要寒暄，直接告诉我你在思考什么。",
            timestamp = Instant.now().toString()
        )
    ),
    val dpInputText: String = "",
    val dpIsTyping: Boolean = false,
    val dpError: String = ""
)

sealed interface MosaEvent {
    data class SwitchTab(val tab: MosaTab) : MosaEvent
    data class UpdateInput(val text: String) : MosaEvent
    data object SendMessage : MosaEvent
    data class ApproveProposal(val appData: AppData) : MosaEvent
    data object RejectProposal : MosaEvent
    // Deep planning events
    data class UpdateDpInput(val text: String) : MosaEvent
    data object SendDpMessage : MosaEvent
    data class SendQuickPrompt(val prompt: String) : MosaEvent
}

class MosaViewModel(application: Application) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(MosaUiState())
    val uiState: StateFlow<MosaUiState> = _uiState.asStateFlow()

    private val dataStoreManager = DataStoreManager.getInstance(application)
    private val scheduleRepository = ScheduleRepository(dataStoreManager)
    private val agentRepository = AgentRepository()

    /** Current app data - loaded lazily */
    private var appData: AppData = AppData()

    /** Chat history for context (separate from UI messages) */
    private val chatHistory = mutableListOf<Map<String, String>>()

    /** Deep planning history */
    private val dpChatHistory = mutableListOf<Map<String, String>>()

    init {
        loadAppData()
        loadChatHistory()
        loadDpChatHistory()

        // Watch for user switches to clear chat history and reload data
        viewModelScope.launch {
            var lastUserId: String? = null
            AuthManager.currentUser.collect { user ->
                val currentUserId = user?.userId
                if (currentUserId != lastUserId) {
                    lastUserId = currentUserId
                    // Clear in-memory chat history to prevent cross-user contamination
                    chatHistory.clear()
                    dpChatHistory.clear()
                    // Reset UI state to empty messages
                    _uiState.update { state ->
                        state.copy(
                            messages = listOf(
                                ChatMessage(role = "assistant", content = "在。", timestamp = Instant.now().toString())
                            ),
                            dpMessages = listOf(
                                ChatMessage(
                                    role = "assistant",
                                    content = "你好。我是Mosa的战略规划模式。\n\n在这个模式下，我们可以一起探讨你的长期目标、人生方向和战略决策。不需要寒暄，直接告诉我你在思考什么。",
                                    timestamp = Instant.now().toString()
                                )
                            )
                        )
                    }
                    // Reload data for new user if any
                    if (user != null) {
                        loadAppData()
                        // Note: chat history remains global, so we don't load history for new user
                    }
                }
            }
        }
    }

    private fun loadAppData() {
        viewModelScope.launch {
            val userId = AuthManager.userId
            appData = if (userId != null) {
                try { scheduleRepository.fullSync(userId) } catch (_: Exception) { scheduleRepository.loadLocalData(userId) ?: AppData() }
            } else {
                AppData()
            }
        }
    }

    private fun loadChatHistory() {
        viewModelScope.launch {
            try {
                val userId = AuthManager.userId ?: return@launch
                val raw = dataStoreManager.loadAgentHistoryForUser(userId)
                if (raw != null) {
                    val saved = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                        .decodeFromString<List<ChatMessage>>(raw)
                    _uiState.update { it.copy(messages = saved) }
                    saved.forEach { msg ->
                        if (msg.content.isNotEmpty()) {
                            chatHistory.add(mapOf("role" to msg.role, "content" to msg.content))
                        }
                    }
                }
            } catch (_: Exception) {}
        }
    }

    private fun loadDpChatHistory() {
        viewModelScope.launch {
            try {
                val userId = AuthManager.userId ?: return@launch
                val raw = dataStoreManager.loadDpAgentHistoryForUser(userId)
                if (raw != null) {
                    val saved = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                        .decodeFromString<List<ChatMessage>>(raw)
                    if (saved.isNotEmpty()) {
                        _uiState.update { it.copy(dpMessages = saved) }
                        saved.forEach { msg ->
                            if (msg.content.isNotEmpty()) {
                                dpChatHistory.add(mapOf("role" to msg.role, "content" to msg.content))
                            }
                        }
                    }
                }
            } catch (_: Exception) {}
        }
    }

    private fun saveChatHistory() {
        viewModelScope.launch {
            try {
                val json = kotlinx.serialization.json.Json.encodeToString(
                    kotlinx.serialization.serializer<List<ChatMessage>>(),
                    _uiState.value.messages
                )
                val userId = AuthManager.userId ?: return@launch
                dataStoreManager.saveAgentHistoryForUser(userId, json)
            } catch (_: Exception) {}
        }
    }

    private fun saveDpChatHistory() {
        viewModelScope.launch {
            try {
                val json = kotlinx.serialization.json.Json.encodeToString(
                    kotlinx.serialization.serializer<List<ChatMessage>>(),
                    _uiState.value.dpMessages
                )
                val userId = AuthManager.userId ?: return@launch
                dataStoreManager.saveDpAgentHistoryForUser(userId, json)
            } catch (_: Exception) {}
        }
    }

    fun onEvent(event: MosaEvent) {
        when (event) {
            is MosaEvent.SwitchTab -> {
                _uiState.update { it.copy(currentTab = event.tab) }
            }
            is MosaEvent.UpdateInput -> {
                _uiState.update { it.copy(inputText = event.text) }
            }
            is MosaEvent.SendMessage -> {
                val text = _uiState.value.inputText.trim()
                if (text.isBlank()) return

                val userMessage = ChatMessage(
                    role = "user",
                    content = text,
                    timestamp = Instant.now().toString()
                )

                chatHistory.add(mapOf("role" to "user", "content" to text))

                _uiState.update { state ->
                    state.copy(
                        messages = state.messages + userMessage,
                        inputText = "",
                        isTyping = true,
                        error = ""
                    )
                }

                sendMessageToAI(text)
            }
            is MosaEvent.ApproveProposal -> {
                val proposal = _uiState.value.activeProposal ?: return
                val (success, msg) = AgentTools.executeProposal(proposal, event.appData)

                if (success) {
                    appData = event.appData
                    viewModelScope.launch {
                        val userId = AuthManager.userId
                        if (userId != null) {
                            scheduleRepository.saveLocalData(userId, appData)
                            scheduleRepository.saveCloudData(userId, appData)
                        }
                    }
                }

                val responseMsg = if (success) "已完成。$msg" else "操作失败：$msg"
                val aiMessage = ChatMessage(
                    role = "assistant",
                    content = responseMsg,
                    timestamp = Instant.now().toString()
                )
                chatHistory.add(mapOf("role" to "assistant", "content" to responseMsg))

                _uiState.update { state ->
                    state.copy(
                        messages = state.messages + aiMessage,
                        activeProposal = null,
                        isTyping = false
                    )
                }
                saveChatHistory()
            }
            is MosaEvent.RejectProposal -> {
                val responseMsg = "已取消。"
                val aiMessage = ChatMessage(
                    role = "assistant",
                    content = responseMsg,
                    timestamp = Instant.now().toString()
                )
                chatHistory.add(mapOf("role" to "assistant", "content" to responseMsg))

                _uiState.update { state ->
                    state.copy(
                        messages = state.messages + aiMessage,
                        activeProposal = null,
                        isTyping = false
                    )
                }
                saveChatHistory()
            }
            is MosaEvent.UpdateDpInput -> {
                _uiState.update { it.copy(dpInputText = event.text) }
            }
            is MosaEvent.SendDpMessage -> {
                val text = _uiState.value.dpInputText.trim()
                if (text.isBlank()) return
                sendDeepPlanningMessage(text)
            }
            is MosaEvent.SendQuickPrompt -> {
                if (_uiState.value.dpIsTyping) return
                sendDeepPlanningMessage(event.prompt)
            }
        }
    }

    private fun sendMessageToAI(text: String) {
        viewModelScope.launch {
            loadAppDataSync()

            val apiKey = getCurrentApiKey()
            val provider = appData.settings.provider

            try {
                val response = agentRepository.chat(
                    message = text,
                    history = chatHistory.toList(),
                    appData = appData,
                    apiKey = apiKey,
                    provider = provider,
                    userProfile = appData.userProfile
                )

                val aiMessage = ChatMessage(
                    role = "assistant",
                    content = response.content,
                    timestamp = Instant.now().toString(),
                    proposal = response.proposal
                )
                chatHistory.add(mapOf("role" to "assistant", "content" to response.content))

                _uiState.update { state ->
                    state.copy(
                        messages = state.messages + aiMessage,
                        isTyping = false,
                        activeProposal = response.proposal
                    )
                }

                if (response.shouldRefresh) {
                    if (response.updatedAppData != null) {
                        appData = response.updatedAppData
                    }
                    val userId = AuthManager.userId
                    if (userId != null) {
                        scheduleRepository.saveLocalData(userId, appData)
                        scheduleRepository.saveCloudData(userId, appData)
                    }
                }

                saveChatHistory()
            } catch (e: Exception) {
                _uiState.update { state ->
                    state.copy(
                        isTyping = false,
                        error = e.message ?: "请求失败"
                    )
                }
            }
        }
    }

    private fun sendDeepPlanningMessage(text: String) {
        val userMessage = ChatMessage(
            role = "user",
            content = text,
            timestamp = Instant.now().toString()
        )

        dpChatHistory.add(mapOf("role" to "user", "content" to text))

        _uiState.update { state ->
            state.copy(
                dpMessages = state.dpMessages + userMessage,
                dpInputText = "",
                dpIsTyping = true,
                dpError = ""
            )
        }

        viewModelScope.launch {
            loadAppDataSync()

            val apiKey = getCurrentApiKey()
            val provider = appData.settings.provider

            try {
                val response = agentRepository.deepPlanningChat(
                    message = text,
                    history = dpChatHistory.toList(),
                    appData = appData,
                    apiKey = apiKey,
                    provider = provider,
                    userProfile = appData.userProfile
                )

                val aiMessage = ChatMessage(
                    role = "assistant",
                    content = response.content,
                    timestamp = Instant.now().toString()
                )
                dpChatHistory.add(mapOf("role" to "assistant", "content" to response.content))

                _uiState.update { state ->
                    state.copy(
                        dpMessages = state.dpMessages + aiMessage,
                        dpIsTyping = false
                    )
                }

                saveDpChatHistory()
            } catch (e: Exception) {
                _uiState.update { state ->
                    state.copy(
                        dpIsTyping = false,
                        dpError = e.message ?: "请求失败"
                    )
                }
            }
        }
    }

    private suspend fun loadAppDataSync() {
        val userId = AuthManager.userId
        appData = if (userId != null) {
            try { scheduleRepository.fullSync(userId) } catch (_: Exception) { scheduleRepository.loadLocalData(userId) ?: AppData() }
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

    fun getAppData(): AppData = appData

    fun updateAppData(newData: AppData) {
        appData = newData
    }
}
