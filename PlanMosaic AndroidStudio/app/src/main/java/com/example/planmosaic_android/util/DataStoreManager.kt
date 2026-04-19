package com.example.planmosaic_android.util

import android.content.Context
import android.util.Base64
import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.io.File
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec

/**
 * DataStore-based local cache, mirroring the desktop's localStorage.
 */
class DataStoreManager private constructor(private val context: Context) {

    companion object {
        private const val TAG = "DataStoreManager"
        private const val USER_DATA_DIR = "user_data"

        @Volatile
        private var INSTANCE: DataStoreManager? = null

        fun getInstance(context: Context): DataStoreManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: DataStoreManager(context.applicationContext).also { INSTANCE = it }
            }
        }

        private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(
            name = Constants.DATA_STORE_NAME
        )
        private val KEY_USER_DATA = stringPreferencesKey(Constants.KEY_USER_DATA)
        private val KEY_CREDENTIALS = stringPreferencesKey(Constants.KEY_CREDENTIALS)
        private val KEY_TOKEN = stringPreferencesKey("token")
    }

    // ============ Per-Account File-Based Storage ============

    /** Base directory for all per-user data */
    private fun getUserDataBaseDir(): File {
        val dir = File(context.filesDir, USER_DATA_DIR)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /** Per-user directory: user_data/{userId}/ */
    private fun getUserDir(userId: String): File {
        val safeUserId = sanitizeUserId(userId)
        val dir = File(getUserDataBaseDir(), safeUserId)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /** Sanitize userId to prevent path traversal */
    private fun sanitizeUserId(userId: String): String {
        return userId.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
    }

    /** Generic: read a per-user file */
    private suspend fun readPerUserFile(userId: String, fileName: String): String? {
        return withContext(Dispatchers.IO) {
            val file = File(getUserDir(userId), fileName)
            if (file.exists()) {
                try { file.readText() } catch (e: Exception) {
                    Log.e(TAG, "Error reading $fileName for $userId", e)
                    null
                }
            } else null
        }
    }

    /** Generic: write a per-user file */
    private suspend fun writePerUserFile(userId: String, fileName: String, content: String) {
        withContext(Dispatchers.IO) {
            try {
                val file = File(getUserDir(userId), fileName)
                file.writeText(content)
            } catch (e: Exception) {
                Log.e(TAG, "Error writing $fileName for $userId", e)
            }
        }
    }

    // --- AppData (schedule/task/settings) ---
    // Local files are just a cache of Supabase data. No migration from legacy DataStore.
    // Data always comes from Supabase on login, then gets cached locally.

    suspend fun loadUserDataForUser(userId: String): String? {
        return readPerUserFile(userId, "app_data.json")
    }

    suspend fun saveUserDataForUser(userId: String, json: String) {
        writePerUserFile(userId, "app_data.json", json)
    }

    // --- Agent Chat History ---

    suspend fun loadAgentHistoryForUser(userId: String): String? =
        readPerUserFile(userId, "agent_history.json")

    suspend fun saveAgentHistoryForUser(userId: String, json: String) {
        writePerUserFile(userId, "agent_history.json", json)
    }

    // --- Deep Planning Agent History ---

    suspend fun loadDpAgentHistoryForUser(userId: String): String? =
        readPerUserFile(userId, "dp_agent_history.json")

    suspend fun saveDpAgentHistoryForUser(userId: String, json: String) {
        writePerUserFile(userId, "dp_agent_history.json", json)
    }

    // --- Vocab Progress ---

    suspend fun loadVocabProgressForUser(userId: String, bookId: String): String? =
        readPerUserFile(userId, "vocab_progress_$bookId.json")

    suspend fun saveVocabProgressForUser(userId: String, bookId: String, json: String) {
        writePerUserFile(userId, "vocab_progress_$bookId.json", json)
    }

    // --- Vocab Custom Books ---

    suspend fun loadVocabCustomBooksForUser(userId: String): String? =
        readPerUserFile(userId, "vocab_custom_books.json")

    suspend fun saveVocabCustomBooksForUser(userId: String, json: String) {
        writePerUserFile(userId, "vocab_custom_books.json", json)
    }

    // --- Vocab AI Chat History ---

    suspend fun loadVocabAiHistoryForUser(userId: String): String? =
        readPerUserFile(userId, "vocab_ai_history.json")

    suspend fun saveVocabAiHistoryForUser(userId: String, json: String) {
        writePerUserFile(userId, "vocab_ai_history.json", json)
    }

    // ============ Legacy User Data (kept for migration) ============

    val userData: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_USER_DATA]
    }

    suspend fun saveUserData(json: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_USER_DATA] = json
        }
    }

    // ============ Credentials ============

    data class Credentials(val username: String, val password: String)

    private val KEY_CREDENTIALS_IV = stringPreferencesKey("credentials_iv")

    private fun deriveKey(): SecretKey {
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val spec = PBEKeySpec(
            "planmosaic-local".toCharArray(),
            ByteArray(16) { 0x42 },
            10000,
            256
        )
        return factory.generateSecret(spec)
    }

    private fun encrypt(plainText: String): Pair<String, String> {
        val key = deriveKey()
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv))
        val encrypted = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(encrypted, Base64.NO_WRAP) to
                Base64.encodeToString(iv, Base64.NO_WRAP)
    }

    private fun decrypt(cipherText: String, ivText: String): String {
        val key = deriveKey()
        val encrypted = Base64.decode(cipherText, Base64.NO_WRAP)
        val iv = Base64.decode(ivText, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        return String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }

    val credentials: Flow<Credentials?> = context.dataStore.data.map { prefs ->
        val raw = prefs[KEY_CREDENTIALS]
        val iv = prefs[KEY_CREDENTIALS_IV]
        if (raw.isNullOrBlank() || iv.isNullOrBlank()) null
        else {
            try {
                val decrypted = decrypt(raw, iv)
                val parts = decrypted.split(":", limit = 2)
                if (parts.size == 2) Credentials(parts[0], parts[1]) else null
            } catch (_: Exception) {
                val parts = raw.split(":", limit = 2)
                if (parts.size == 2) Credentials(parts[0], parts[1]) else null
            }
        }
    }

    suspend fun saveCredentials(username: String, password: String) {
        val (encrypted, iv) = encrypt("$username:$password")
        context.dataStore.edit { prefs ->
            prefs[KEY_CREDENTIALS] = encrypted
            prefs[KEY_CREDENTIALS_IV] = iv
        }
    }

    suspend fun clearCredentials() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_CREDENTIALS)
        }
    }

    // ============ Token ============

    val token: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_TOKEN]
    }

    suspend fun saveToken(token: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_TOKEN] = token
        }
    }

    suspend fun clearToken() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_TOKEN)
        }
    }

    // ============ Theme Preference ============

    private val KEY_THEME = stringPreferencesKey("theme_preference")

    val themePreference: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_THEME] ?: "system"
    }

    suspend fun saveThemePreference(theme: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_THEME] = theme
        }
    }

    // ============ Agent History ============

    private val KEY_AGENT_HISTORY = stringPreferencesKey("agent_history")

    val agentHistory: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_AGENT_HISTORY]
    }

    suspend fun saveAgentHistory(json: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_AGENT_HISTORY] = json
        }
    }

    // ============ Deep Planning Agent History ============

    private val KEY_DP_AGENT_HISTORY = stringPreferencesKey("dp_agent_history")

    val dpAgentHistory: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_DP_AGENT_HISTORY]
    }

    suspend fun saveDpAgentHistory(json: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_DP_AGENT_HISTORY] = json
        }
    }

    // ============ Vocab: Current Book ============

    private val KEY_VOCAB_CURRENT_BOOK = stringPreferencesKey("vocab_current_book")

    val vocabCurrentBook: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_VOCAB_CURRENT_BOOK] ?: "college1"
    }

    suspend fun saveVocabCurrentBook(bookId: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_VOCAB_CURRENT_BOOK] = bookId
        }
    }

    // ============ Vocab: Per-book Progress ============

    suspend fun saveVocabProgress(bookId: String, json: String) {
        context.dataStore.edit { prefs ->
            prefs[stringPreferencesKey("vocab_progress_$bookId")] = json
        }
    }

    suspend fun loadVocabProgress(bookId: String): String? {
        return context.dataStore.data.first()[stringPreferencesKey("vocab_progress_$bookId")]
    }

    // ============ Vocab: Custom Books (AI-generated) ============

    private val KEY_VOCAB_CUSTOM_BOOKS = stringPreferencesKey("vocab_custom_books")

    val vocabCustomBooks: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_VOCAB_CUSTOM_BOOKS]
    }

    suspend fun saveVocabCustomBooks(json: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_VOCAB_CUSTOM_BOOKS] = json
        }
    }

    // ============ Sub-App Nav Visibility ============

    private val KEY_SUBAPP_NAV_VISIBLE = stringPreferencesKey("subapp_nav_visible")

    val subappNavVisible: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_SUBAPP_NAV_VISIBLE] ?: "{}"
    }

    suspend fun saveSubappNavVisible(json: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_SUBAPP_NAV_VISIBLE] = json
        }
    }

    // ============ Vocab: AI Chat History ============

    private val KEY_VOCAB_AI_HISTORY = stringPreferencesKey("vocab_ai_history")

    val vocabAiHistory: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_VOCAB_AI_HISTORY]
    }

    suspend fun saveVocabAiHistory(json: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_VOCAB_AI_HISTORY] = json
        }
    }
}
