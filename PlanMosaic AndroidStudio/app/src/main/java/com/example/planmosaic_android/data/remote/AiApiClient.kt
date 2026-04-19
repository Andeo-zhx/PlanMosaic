package com.example.planmosaic_android.data.remote

import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.utils.io.jvm.javaio.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * Generic OpenAI-compatible API client for DeepSeek and Qwen.
 * Supports function/tool calling with multi-turn recursive execution.
 */
object AiApiClient {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val httpClient = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(json)
        }
    }

    // API endpoints
    private const val DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
    private const val QWEN_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

    // Models
    private const val DEEPSEEK_MODEL = "deepseek-chat"
    private const val DEEPSEEK_REASONER_MODEL = "deepseek-reasoner"
    private const val QWEN_MODEL = "qwen3.5-plus"

    // ============ Request/Response Models ============

    @Serializable
    data class ChatMessage(
        val role: String,
        val content: String = "",
        val tool_calls: List<ToolCall>? = null,
        val reasoning_content: String? = null
    )

    @Serializable
    data class ToolCall(
        val id: String = "",
        val type: String = "function",
        val function: ToolFunction
    )

    @Serializable
    data class ToolFunction(
        val name: String,
        val arguments: String = "{}"
    )

    @Serializable
    data class ToolMessage(
        val role: String = "tool",
        val tool_call_id: String,
        val content: String
    )

    data class ChatResult(
        val content: String = "",
        val toolCalls: List<ToolCall> = emptyList(),
        val shouldRefresh: Boolean = false,
        val finishReason: String = ""
    )

    // ============ Rate Limiting ============

    @Volatile
    private var lastCallTime = 0L
    private const val MIN_INTERVAL = 1000L // 1 second

    private suspend fun rateLimit() {
        val now = System.currentTimeMillis()
        val elapsed = now - lastCallTime
        if (elapsed < MIN_INTERVAL) {
            delay(MIN_INTERVAL - elapsed)
        }
        lastCallTime = System.currentTimeMillis()
    }

    // ============ Public API ============

    /**
     * Send a chat completion request with tools support.
     * Returns the raw result with content and/or tool_calls.
     */
    suspend fun chat(
        apiKey: String,
        provider: String,
        messages: List<JsonObject>,
        tools: List<JsonObject>,
        useReasoner: Boolean = false
    ): ChatResult {
        rateLimit()

        val url = if (provider == "qwen") QWEN_URL else DEEPSEEK_URL
        val model = when {
            provider == "qwen" -> QWEN_MODEL
            useReasoner -> DEEPSEEK_REASONER_MODEL
            else -> DEEPSEEK_MODEL
        }
        val isReasoner = model.contains("reasoner")

        val requestBody = buildJsonObject {
            put("model", model)
            put("messages", JsonArray(messages))
            put("tools", JsonArray(tools))
            put("tool_choice", "auto")
            put("max_tokens", if (isReasoner) 16000 else 2000)
            if (!isReasoner) {
                put("temperature", 0.8)
            }
        }

        val response = try {
            httpClient.post(url) {
                contentType(ContentType.Application.Json)
                header("Authorization", "Bearer $apiKey")
                header("Content-Type", "application/json")
                setBody(requestBody.toString())
            }
        } catch (e: Exception) {
            throw Exception("AI API请求失败: ${e.message}")
        }

        if (response.status != HttpStatusCode.OK) {
            val body = response.bodyAsText()
            if (body.contains("429") || body.contains("rate")) {
                throw Exception("请求频率超限，请稍后重试")
            }
            throw Exception("AI API错误: ${response.status.value} - $body")
        }

        val responseText = response.bodyAsText()
        val responseJson = json.parseToJsonElement(responseText).jsonObject
        val choice = responseJson["choices"]?.jsonArray?.firstOrNull()?.jsonObject
        val message = choice?.get("message")?.jsonObject
        val finishReason = choice?.get("finish_reason")?.jsonPrimitive?.content ?: ""

        val content = message?.get("content")?.jsonPrimitive?.contentOrNull ?: ""

        val toolCalls = mutableListOf<ToolCall>()
        message?.get("tool_calls")?.jsonArray?.forEach { tc ->
            val obj = tc.jsonObject
            val func = obj["function"]?.jsonObject
            toolCalls.add(ToolCall(
                id = obj["id"]?.jsonPrimitive?.content ?: "call_${System.currentTimeMillis()}",
                type = "function",
                function = ToolFunction(
                    name = func?.get("name")?.jsonPrimitive?.content ?: "",
                    arguments = func?.get("arguments")?.jsonPrimitive?.content ?: "{}"
                )
            ))
        }

        return ChatResult(
            content = content,
            toolCalls = toolCalls,
            finishReason = finishReason
        )
    }

    /**
     * Build a system/user/assistant/tool message as JsonObject.
     */
    fun textMessage(role: String, content: String): JsonObject = buildJsonObject {
        put("role", role)
        put("content", content)
    }

    fun assistantMessage(content: String, toolCalls: List<ToolCall>, reasoningContent: String?): JsonObject = buildJsonObject {
        put("role", "assistant")
        put("content", content)
        if (toolCalls.isNotEmpty()) {
            put("tool_calls", JsonArray(toolCalls.map { tc ->
                buildJsonObject {
                    put("id", tc.id)
                    put("type", "function")
                    put("function", buildJsonObject {
                        put("name", tc.function.name)
                        put("arguments", tc.function.arguments)
                    })
                }
            }))
        }
        if (reasoningContent != null) {
            put("reasoning_content", reasoningContent)
        }
    }

    fun toolResultMessage(toolCallId: String, result: String): JsonObject = buildJsonObject {
        put("role", "tool")
        put("tool_call_id", toolCallId)
        put("content", result)
    }

    // ============ Streaming Chat ============

    /**
     * Streaming chat completion. Returns a Flow of content delta chunks.
     * Used by WordMosaic AI for real-time vocabulary generation.
     */
    fun chatStream(
        apiKey: String,
        provider: String,
        messages: List<JsonObject>,
        temperature: Double = 0.3
    ): Flow<String> = flow {
        val url = if (provider == "qwen") QWEN_URL else DEEPSEEK_URL
        val model = if (provider == "qwen") QWEN_MODEL else DEEPSEEK_MODEL

        val requestBody = buildJsonObject {
            put("model", model)
            put("messages", JsonArray(messages))
            put("stream", true)
            put("max_tokens", 4000)
            put("temperature", temperature)
        }

        val response = httpClient.post(url) {
            contentType(ContentType.Application.Json)
            header("Authorization", "Bearer $apiKey")
            setBody(requestBody.toString())
        }

        val reader = BufferedReader(InputStreamReader(response.bodyAsChannel().toInputStream()))
        var line: String?
        while (reader.readLine().also { line = it } != null) {
            val currentLine = line ?: continue
            if (currentLine.startsWith("data: ")) {
                val data = currentLine.removePrefix("data: ").trim()
                if (data == "[DONE]") break
                try {
                    val chunk = json.parseToJsonElement(data).jsonObject
                    val delta = chunk["choices"]?.jsonArray?.firstOrNull()
                        ?.jsonObject?.get("delta")?.jsonObject
                    val content = delta?.get("content")?.jsonPrimitive?.contentOrNull ?: ""
                    if (content.isNotEmpty()) emit(content)
                } catch (_: Exception) { /* skip malformed chunks */ }
            }
        }
        reader.close()
    }.flowOn(Dispatchers.IO)
}
