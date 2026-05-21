package com.example.planmosaic_android.ui.screens.mosa

import com.example.planmosaic_android.data.repository.AgentRepository
import com.example.planmosaic_android.model.AppData
import com.example.planmosaic_android.model.ChatMessage
import kotlinx.coroutines.flow.StateFlow

interface ChatSession {
    val messages: StateFlow<List<ChatMessage>>
    val inputText: StateFlow<String>
    val isTyping: StateFlow<Boolean>
    val error: StateFlow<String>

    suspend fun loadHistory(userId: String)
    suspend fun saveHistory(userId: String)
    fun clearHistory()

    fun updateInput(text: String)
    fun addAssistantMessage(text: String)
    fun addUserMessage(text: String)

    suspend fun sendMessage(
        text: String,
        appData: AppData,
        apiKey: String,
        provider: String,
        userProfile: String
    ): AgentRepository.ChatResponse
}