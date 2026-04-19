package com.example.planmosaic_android.ui.screens.profile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.planmosaic_android.util.AuthManager
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ============ UI State ============

data class ProfileUiState(
    val currentUser: AuthManager.User? = null,
    val showLogin: Boolean = false,
    val loginError: String = "",
    val isLoggingIn: Boolean = false,
    val showApiSettings: Boolean = false,
    val isSyncing: Boolean = false,
    val showLogoutConfirm: Boolean = false
)

// ============ ViewModel ============

class ProfileViewModel(application: Application) : AndroidViewModel(application) {
    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    private val dataStoreManager = DataStoreManager.getInstance(application)

    init {
        // Observe current user changes
        viewModelScope.launch {
            AuthManager.currentUser.collect { user ->
                _uiState.update { it.copy(currentUser = user) }
            }
        }
    }

    // ============ Actions ============

    fun showLogin() {
        _uiState.update { it.copy(showLogin = true) }
    }

    fun hideLogin() {
        _uiState.update { it.copy(showLogin = false) }
    }

    fun login(username: String, password: String) {
        _uiState.update { it.copy(isLoggingIn = true, loginError = "") }
        viewModelScope.launch {
            try {
                AuthManager.login(username, password)
                _uiState.update {
                    it.copy(
                        isLoggingIn = false,
                        showLogin = false,
                        loginError = ""
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoggingIn = false,
                        loginError = e.message ?: "登录失败"
                    )
                }
            }
        }
    }

    fun register(username: String, password: String) {
        _uiState.update { it.copy(isLoggingIn = true, loginError = "") }
        viewModelScope.launch {
            try {
                AuthManager.register(username, password)
                _uiState.update {
                    it.copy(
                        isLoggingIn = false,
                        showLogin = false,
                        loginError = ""
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoggingIn = false,
                        loginError = e.message ?: "注册失败"
                    )
                }
            }
        }
    }

    fun toggleApiSettings() {
        _uiState.update { it.copy(showApiSettings = !it.showApiSettings) }
    }

    fun syncData() {
        _uiState.update { it.copy(isSyncing = true) }
        viewModelScope.launch {
            // TODO: Implement actual data sync logic
            kotlinx.coroutines.delay(2000) // Simulate sync
            _uiState.update { it.copy(isSyncing = false) }
        }
    }

    fun showLogoutConfirm() {
        _uiState.update { it.copy(showLogoutConfirm = true) }
    }

    fun hideLogoutConfirm() {
        _uiState.update { it.copy(showLogoutConfirm = false) }
    }

    fun logout() {
        viewModelScope.launch {
            AuthManager.logout()
            _uiState.update {
                it.copy(
                    currentUser = null,
                    showLogoutConfirm = false,
                    showLogin = true
                )
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(loginError = "") }
    }
}