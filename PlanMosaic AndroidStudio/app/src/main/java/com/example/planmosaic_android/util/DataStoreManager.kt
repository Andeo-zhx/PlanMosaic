package com.example.planmosaic_android.util

import android.content.Context
import com.example.planmosaic_android.storage.DataStorePreferencesStorage
import com.example.planmosaic_android.storage.FileSystemUserStorage
import com.example.planmosaic_android.storage.IPreferencesStorage
import com.example.planmosaic_android.storage.IUserFileStorage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

@Deprecated(
    "Use IPreferencesStorage and IUserFileStorage instead",
    ReplaceWith("preferencesStorage", "com.example.planmosaic_android.storage.IPreferencesStorage")
)
class DataStoreManager private constructor(context: Context) {

    companion object {
        @Volatile
        private var INSTANCE: DataStoreManager? = null

        fun getInstance(context: Context): DataStoreManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: DataStoreManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    private val preferences: IPreferencesStorage = DataStorePreferencesStorage(context)
    private val userFiles: IUserFileStorage = FileSystemUserStorage(context)

    suspend fun loadUserDataForUser(userId: String): String? =
        userFiles.loadUserData(userId)

    suspend fun saveUserDataForUser(userId: String, json: String) {
        userFiles.saveUserData(userId, json)
    }

    suspend fun loadAgentHistoryForUser(userId: String): String? =
        userFiles.loadAgentHistory(userId)

    suspend fun saveAgentHistoryForUser(userId: String, json: String) {
        userFiles.saveAgentHistory(userId, json)
    }

    suspend fun loadDpAgentHistoryForUser(userId: String): String? =
        userFiles.loadDpAgentHistory(userId)

    suspend fun saveDpAgentHistoryForUser(userId: String, json: String) {
        userFiles.saveDpAgentHistory(userId, json)
    }

    suspend fun loadVocabProgressForUser(userId: String, bookId: String): String? =
        userFiles.loadVocabProgress(userId, bookId)

    suspend fun saveVocabProgressForUser(userId: String, bookId: String, json: String) {
        userFiles.saveVocabProgress(userId, bookId, json)
    }

    suspend fun loadVocabCustomBooksForUser(userId: String): String? =
        userFiles.loadVocabCustomBooks(userId)

    suspend fun saveVocabCustomBooksForUser(userId: String, json: String) {
        userFiles.saveVocabCustomBooks(userId, json)
    }

    suspend fun loadVocabAiHistoryForUser(userId: String): String? =
        userFiles.loadVocabAiHistory(userId)

    suspend fun saveVocabAiHistoryForUser(userId: String, json: String) {
        userFiles.saveVocabAiHistory(userId, json)
    }

    val userData: Flow<String?> = preferences.getString("user_data", "").let {
        kotlinx.coroutines.flow.flowOf(null)
    }

    suspend fun saveUserData(json: String) {
        preferences.saveString("user_data", json)
    }

    val credentials: Flow<DataStoreManager.Credentials?> =
        @Suppress("DEPRECATION")
        kotlinx.coroutines.flow.flowOf(null)

    @Suppress("DEPRECATION")
    data class Credentials(val username: String, val password: String)

    suspend fun saveCredentials(username: String, password: String) {
        preferences.saveCredentials(username, password)
    }

    suspend fun clearCredentials() {
        preferences.clearCredentials()
    }

    val token: Flow<String?> = preferences.token

    suspend fun saveToken(token: String) {
        preferences.saveToken(token)
    }

    suspend fun clearToken() {
        preferences.clearToken()
    }

    val themePreference: Flow<String> = preferences.themePreference

    suspend fun saveThemePreference(theme: String) {
        preferences.saveThemePreference(theme)
    }

    val agentHistory: Flow<String?> = preferences.getString("agent_history", "").let {
        kotlinx.coroutines.flow.flowOf(null)
    }

    suspend fun saveAgentHistory(json: String) {
        preferences.saveString("agent_history", json)
    }

    val dpAgentHistory: Flow<String?> = preferences.getString("dp_agent_history", "").let {
        kotlinx.coroutines.flow.flowOf(null)
    }

    suspend fun saveDpAgentHistory(json: String) {
        preferences.saveString("dp_agent_history", json)
    }

    val vocabCurrentBook: Flow<String> = preferences.vocabCurrentBook

    suspend fun saveVocabCurrentBook(bookId: String) {
        preferences.saveVocabCurrentBook(bookId)
    }

    suspend fun saveVocabProgress(bookId: String, json: String) {
        preferences.saveString("vocab_progress_$bookId", json)
    }

    suspend fun loadVocabProgress(bookId: String): String? {
        return preferences.getString("vocab_progress_$bookId", "")
            .takeIf { it.isNotEmpty() }
    }

    val vocabCustomBooks: Flow<String?> = preferences.getString("vocab_custom_books", "").let {
        kotlinx.coroutines.flow.flowOf(null)
    }

    suspend fun saveVocabCustomBooks(json: String) {
        preferences.saveString("vocab_custom_books", json)
    }

    val vocabAiHistory: Flow<String?> = preferences.getString("vocab_ai_history", "").let {
        kotlinx.coroutines.flow.flowOf(null)
    }

    suspend fun saveVocabAiHistory(json: String) {
        preferences.saveString("vocab_ai_history", json)
    }

    val subappNavVisible: Flow<String> = preferences.subappNavVisible

    suspend fun saveSubappNavVisible(json: String) {
        preferences.saveSubappNavVisible(json)
    }
}