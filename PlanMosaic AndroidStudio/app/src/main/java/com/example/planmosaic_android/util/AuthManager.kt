package com.example.planmosaic_android.util

import android.util.Log
import com.example.planmosaic_android.data.remote.SupabaseClient
import com.example.planmosaic_android.data.remote.bool
import com.example.planmosaic_android.data.remote.str
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class AuthManager(
    private val supabaseClient: SupabaseClient,
    private val dataStoreManager: DataStoreManager
) {

    data class User(val userId: String, val username: String, val token: String?)

    private val _currentUser = MutableStateFlow<User?>(null)
    private val _currentToken = MutableStateFlow<String?>(null)
    
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()
    val currentToken: StateFlow<String?> = _currentToken.asStateFlow()

    val userId: String? get() = _currentUser.value?.userId
    val token: String? get() = _currentToken.value
    val isLoggedIn: Boolean get() = _currentUser.value != null

    suspend fun login(username: String, password: String): Result<User> {
        Log.d("AuthManager", "Login attempt for user: $username")
        return try {
            val result = supabaseClient.login(username, password)
            if (result.bool("success")) {
                val uid = result.str("user_id")
                if (uid.isBlank()) {
                    Log.w("AuthManager", "Login succeeded but user_id is blank")
                    return Result.failure(Exception("Missing user_id"))
                }
                val token = result.str("token")
                Log.d("AuthManager", "Login successful: userId=$uid, token present=${token.isNotBlank()}")
                val user = User(userId = uid, username = username, token = token)
                _currentUser.value = user
                _currentToken.value = token
                dataStoreManager.saveToken(token)
                Result.success(user)
            } else {
                val error = result.str("error").ifBlank { "登录失败" }
                Log.w("AuthManager", "Login failed: $error")
                Result.failure(Exception(error))
            }
        } catch (e: Exception) {
            Log.e("AuthManager", "Login network error", e)
            Result.failure(Exception("网络连接失败: ${e.message}"))
        }
    }

    suspend fun register(username: String, password: String): Result<User> {
        return try {
            val result = supabaseClient.register(username, password)
            if (result.bool("success")) {
                val uid = result.str("user_id")
                if (uid.isBlank()) return Result.failure(Exception("Missing user_id"))
                val token = result.str("token")
                val user = User(userId = uid, username = username, token = token)
                _currentUser.value = user
                _currentToken.value = token
                dataStoreManager.saveToken(token)
                Result.success(user)
            } else {
                val error = result.str("error").ifBlank { "注册失败" }
                Result.failure(Exception(error))
            }
        } catch (e: Exception) {
            Result.failure(Exception("网络连接失败: ${e.message}"))
        }
    }

    suspend fun logout() {
        _currentUser.value = null
        _currentToken.value = null
        dataStoreManager.clearToken()
    }
}