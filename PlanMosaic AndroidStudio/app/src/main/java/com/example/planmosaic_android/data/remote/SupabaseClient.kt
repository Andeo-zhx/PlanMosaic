package com.example.planmosaic_android.data.remote

import android.util.Log
import com.example.planmosaic_android.util.Constants
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.*

object SupabaseClient {

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    val httpClient = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(json)
        }
    }

    /**
     * Generic Supabase RPC call. Uses buildJsonObject for type-safe params.
     * @param token Optional JWT token. If provided, uses "Bearer <token>" for Authorization header;
     *              otherwise uses the anonymous key.
     */
    suspend fun rpc(functionName: String, params: JsonObject, token: String? = null): JsonObject {
        val url = Constants.SUPABASE_RPC + functionName
        val effectiveToken = if (!token.isNullOrBlank()) token else Constants.SUPABASE_ANON_KEY
        Log.d("SupabaseClient", "RPC request: $functionName, url: $url, using custom token: ${!token.isNullOrBlank()}")

        val response = httpClient.post(url) {
            contentType(ContentType.Application.Json)
            header("apikey", Constants.SUPABASE_ANON_KEY)
            header("Authorization", "Bearer $effectiveToken")
            header("Prefer", "return=representation")
            setBody(params)
        }
        
        val statusCode = response.status.value
        val body = response.bodyAsText()
        Log.d("SupabaseClient", "RPC response: $functionName, status: $statusCode, body length: ${body.length}")
        
        return json.parseToJsonElement(body).jsonObject
    }

    // ============ Auth RPCs ============

    suspend fun login(username: String, password: String): JsonObject {
        return rpc("login_user", buildJsonObject {
            put("p_username", username)
            put("p_password", password)
        })
    }

    suspend fun register(username: String, password: String): JsonObject {
        return rpc("register_user", buildJsonObject {
            put("p_username", username)
            put("p_password", password)
        })
    }

    // ============ Data RPCs ============

    suspend fun getUserData(userId: String, token: String? = null): JsonObject {
        return rpc("get_user_data", buildJsonObject {
            put("p_user_id", userId)
        }, token)
    }

    suspend fun upsertUserData(userId: String, scheduleData: String, token: String? = null): JsonObject {
        val dataElement = json.parseToJsonElement(scheduleData)
        return rpc("upsert_user_data", buildJsonObject {
            put("p_user_id", userId)
            put("p_schedule_data", dataElement)
        }, token)
    }
}

fun JsonObject.bool(key: String): Boolean {
    return this[key]?.jsonPrimitive?.content?.toBoolean() ?: false
}

fun JsonObject.str(key: String): String {
    return this[key]?.jsonPrimitive?.content ?: ""
}

fun JsonObject.obj(key: String): JsonObject? {
    return this[key] as? JsonObject
}
