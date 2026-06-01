package com.example.planmosaic_android.storage

import kotlinx.coroutines.flow.Flow

interface IPreferencesStorage {
    suspend fun saveString(key: String, value: String)
    suspend fun getString(key: String, defaultValue: String): String
    suspend fun remove(key: String)

    val themePreference: Flow<String>
    suspend fun saveThemePreference(theme: String)

    val vocabCurrentBook: Flow<String>
    suspend fun saveVocabCurrentBook(bookId: String)

    val token: Flow<String?>
    suspend fun saveToken(token: String)
    suspend fun clearToken()

    data class Credentials(val username: String, val password: String)

    val credentials: Flow<Credentials?>
    suspend fun saveCredentials(username: String, password: String)
    suspend fun clearCredentials()

    val subappNavVisible: Flow<String>
    suspend fun saveSubappNavVisible(json: String)
}