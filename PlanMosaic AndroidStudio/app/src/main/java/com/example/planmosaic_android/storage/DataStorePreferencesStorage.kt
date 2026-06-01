package com.example.planmosaic_android.storage

import android.content.Context
import android.util.Base64
import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.planmosaic_android.util.CryptoManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec

class DataStorePreferencesStorage(context: Context) : IPreferencesStorage {

    companion object {
        private const val TAG = "DataStorePrefsStorage"
        private const val DATA_STORE_NAME = "planmosaic_prefs"

        private val KEY_THEME = stringPreferencesKey("theme_preference")
        private val KEY_VOCAB_CURRENT_BOOK = stringPreferencesKey("vocab_current_book")
        private val KEY_TOKEN = stringPreferencesKey("token")
        private val KEY_CREDENTIALS = stringPreferencesKey("credentials")
        private val KEY_CREDENTIALS_IV = stringPreferencesKey("credentials_iv")
        private val KEY_SUBAPP_NAV_VISIBLE = stringPreferencesKey("subapp_nav_visible")
    }

    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(
        name = DATA_STORE_NAME
    )

    private val dataStore = context.applicationContext.dataStore

    override suspend fun saveString(key: String, value: String) {
        dataStore.edit { prefs ->
            prefs[stringPreferencesKey(key)] = value
        }
    }

    override suspend fun getString(key: String, defaultValue: String): String {
        return dataStore.data.first()[stringPreferencesKey(key)] ?: defaultValue
    }

    override suspend fun remove(key: String) {
        dataStore.edit { prefs ->
            prefs.remove(stringPreferencesKey(key))
        }
    }

    override val themePreference: Flow<String> = dataStore.data.map { prefs ->
        prefs[KEY_THEME] ?: "system"
    }

    override suspend fun saveThemePreference(theme: String) {
        dataStore.edit { prefs ->
            prefs[KEY_THEME] = theme
        }
    }

    override val vocabCurrentBook: Flow<String> = dataStore.data.map { prefs ->
        prefs[KEY_VOCAB_CURRENT_BOOK] ?: "college1"
    }

    override suspend fun saveVocabCurrentBook(bookId: String) {
        dataStore.edit { prefs ->
            prefs[KEY_VOCAB_CURRENT_BOOK] = bookId
        }
    }

    override val token: Flow<String?> = dataStore.data.map { prefs ->
        prefs[KEY_TOKEN]
    }

    override suspend fun saveToken(token: String) {
        dataStore.edit { prefs ->
            prefs[KEY_TOKEN] = token
        }
    }

    override suspend fun clearToken() {
        dataStore.edit { prefs ->
            prefs.remove(KEY_TOKEN)
        }
    }

    override val credentials: Flow<IPreferencesStorage.Credentials?> = dataStore.data.map { prefs ->
        val raw = prefs[KEY_CREDENTIALS]
        val iv = prefs[KEY_CREDENTIALS_IV]
        if (raw.isNullOrBlank()) {
            null
        } else {
            if (!iv.isNullOrBlank()) {
                val decrypted = CryptoManager.decrypt(raw, iv)
                if (decrypted != null) {
                    val parts = decrypted.split(":", limit = 2)
                    if (parts.size == 2) IPreferencesStorage.Credentials(parts[0], parts[1]) else null
                } else {
                    try {
                        val legacyDecrypted = decryptLegacy(raw, iv)
                        val parts = legacyDecrypted.split(":", limit = 2)
                        if (parts.size == 2) IPreferencesStorage.Credentials(parts[0], parts[1]) else null
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to decrypt legacy credentials", e)
                        null
                    }
                }
            } else {
                val parts = raw.split(":", limit = 2)
                if (parts.size == 2) IPreferencesStorage.Credentials(parts[0], parts[1]) else null
            }
        }
    }

    override suspend fun saveCredentials(username: String, password: String) {
        val pair = CryptoManager.encrypt("$username:$password")
        if (pair != null) {
            val (encrypted, iv) = pair
            dataStore.edit { prefs ->
                prefs[KEY_CREDENTIALS] = encrypted
                prefs[KEY_CREDENTIALS_IV] = iv
            }
        } else {
            Log.w(TAG, "Failed to encrypt credentials, saving as plain fallback")
            dataStore.edit { prefs ->
                prefs[KEY_CREDENTIALS] = "$username:$password"
            }
        }
    }

    override suspend fun clearCredentials() {
        dataStore.edit { prefs ->
            prefs.remove(KEY_CREDENTIALS)
        }
    }

    private fun decryptLegacy(cipherText: String, ivText: String): String {
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val spec = PBEKeySpec(
            "planmosaic-local".toCharArray(),
            ByteArray(16) { 0x42 },
            10000,
            256
        )
        val key = factory.generateSecret(spec)
        val encrypted = Base64.decode(cipherText, Base64.NO_WRAP)
        val iv = Base64.decode(ivText, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        return String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }

    override val subappNavVisible: Flow<String> = dataStore.data.map { prefs ->
        prefs[KEY_SUBAPP_NAV_VISIBLE] ?: "{}"
    }

    override suspend fun saveSubappNavVisible(json: String) {
        dataStore.edit { prefs ->
            prefs[KEY_SUBAPP_NAV_VISIBLE] = json
        }
    }
}