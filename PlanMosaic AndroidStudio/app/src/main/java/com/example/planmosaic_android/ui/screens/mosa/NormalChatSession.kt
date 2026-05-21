package com.example.planmosaic_android.ui.screens.mosa

import android.util.Log
import com.example.planmosaic_android.data.repository.AgentRepository
import com.example.planmosaic_android.model.AppData
import com.example.planmosaic_android.model.ChatMessage
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import java.time.Instant

class NormalChatSession(
    private val agentRepository: AgentRepository,
    private val dataStoreManager: DataStoreManager
) : ChatSession {

    companion object {
        private const val TAG = "NormalChatSession"
        private const val INITIAL_MESSAGE = "在。"
    }

    private val json = Json { ignoreUnknownKeys = true }

    private val _messages = MutableStateFlow(
        listOf(ChatMessage(role = "assistant", content = INITIAL_MESSAGE, timestamp = Instant.now().toString()))
    )
    private val _inputText = MutableStateFlow("")
    private val _isTyping = MutableStateFlow(false)
    private val _error = MutableStateFlow("")

    override val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()
    override val inputText: StateFlow<String> = _inputText.asStateFlow()
    override val isTyping: StateFlow<Boolean> = _isTyping.asStateFlow()
    override val error: StateFlow<String> = _error.asStateFlow()

    private val chatHistory = mutableListOf<Map<String, String>>()

    override suspend fun loadHistory(userId: String) {
        try {
            val raw = dataStoreManager.loadAgentHistoryForUser(userId)
            if (raw != null) {
                val saved = json.decodeFromString<List<ChatMessage>>(raw)
                _messages.value = saved
                chatHistory.clear()
                saved.forEach { msg ->
                    if (msg.content.isNotEmpty()) {
                        chatHistory.add(mapOf("role" to msg.role, "content" to msg.content))
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load chat history", e)
        }
    }

    override suspend fun saveHistory(userId: String) {
        try {
            val jsonStr = kotlinx.serialization.json.Json.encodeToString(
                kotlinx.serialization.serializer<List<ChatMessage>>(),
                _messages.value
            )
            dataStoreManager.saveAgentHistoryForUser(userId, jsonStr)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to save chat history", e)
        }
    }

    override fun clearHistory() {
        chatHistory.clear()
        _messages.value = listOf(
            ChatMessage(role = "assistant", content = INITIAL_MESSAGE, timestamp = Instant.now().toString())
        )
        _inputText.value = ""
        _isTyping.value = false
        _error.value = ""
    }

    override fun updateInput(text: String) {
        _inputText.value = text
    }

    override fun addAssistantMessage(text: String) {
        chatHistory.add(mapOf("role" to "assistant", "content" to text))
        _messages.value = _messages.value + ChatMessage(
            role = "assistant",
            content = text,
            timestamp = Instant.now().toString()
        )
    }

    override fun addUserMessage(text: String) {
        chatHistory.add(mapOf("role" to "user", "content" to text))
        _messages.value = _messages.value + ChatMessage(
            role = "user",
            content = text,
            timestamp = Instant.now().toString()
        )
        _inputText.value = ""
    }

    override suspend fun sendMessage(
        text: String,
        appData: AppData,
        apiKey: String,
        provider: String,
        userProfile: String
    ): AgentRepository.ChatResponse {
        val userMessage = ChatMessage(
            role = "user",
            content = text,
            timestamp = Instant.now().toString()
        )

        chatHistory.add(mapOf("role" to "user", "content" to text))
        _messages.value = _messages.value + userMessage
        _inputText.value = ""
        _isTyping.value = true
        _error.value = ""

        return try {
            val response = agentRepository.chat(
                message = text,
                history = chatHistory.toList(),
                appData = appData,
                apiKey = apiKey,
                provider = provider,
                userProfile = userProfile
            )

            val aiMessage = ChatMessage(
                role = "assistant",
                content = response.content,
                timestamp = Instant.now().toString(),
                proposal = response.proposal
            )

            chatHistory.add(mapOf("role" to "assistant", "content" to response.content))
            _messages.value = _messages.value + aiMessage
            _isTyping.value = false

            response
        } catch (e: Exception) {
            _isTyping.value = false
            _error.value = e.message ?: "请求失败"
            throw e
        }
    }
}