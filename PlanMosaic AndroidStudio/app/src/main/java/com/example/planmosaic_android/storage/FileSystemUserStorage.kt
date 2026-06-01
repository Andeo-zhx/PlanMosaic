package com.example.planmosaic_android.storage

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class FileSystemUserStorage(context: Context) : IUserFileStorage {

    companion object {
        private const val TAG = "FileSystemUserStorage"
        private const val USER_DATA_DIR = "user_data"
    }

    private val appContext = context.applicationContext

    private fun getUserDataBaseDir(): File {
        val dir = File(appContext.filesDir, USER_DATA_DIR)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun getUserDir(userId: String): File {
        val safeUserId = sanitizeUserId(userId)
        val dir = File(getUserDataBaseDir(), safeUserId)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun sanitizeUserId(userId: String): String {
        return userId.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
    }

    private suspend fun readFile(userId: String, fileName: String): String? {
        return withContext(Dispatchers.IO) {
            val file = File(getUserDir(userId), fileName)
            if (file.exists()) {
                try {
                    file.readText()
                } catch (e: Exception) {
                    Log.e(TAG, "Error reading $fileName for $userId", e)
                    null
                }
            } else null
        }
    }

    private suspend fun writeFile(userId: String, fileName: String, content: String) {
        withContext(Dispatchers.IO) {
            try {
                val file = File(getUserDir(userId), fileName)
                file.writeText(content)
            } catch (e: Exception) {
                Log.e(TAG, "Error writing $fileName for $userId", e)
            }
        }
    }

    override suspend fun loadUserData(userId: String): String? =
        readFile(userId, "app_data.json")

    override suspend fun saveUserData(userId: String, json: String) {
        writeFile(userId, "app_data.json", json)
    }

    override suspend fun loadAgentHistory(userId: String): String? =
        readFile(userId, "agent_history.json")

    override suspend fun saveAgentHistory(userId: String, json: String) {
        writeFile(userId, "agent_history.json", json)
    }

    override suspend fun loadDpAgentHistory(userId: String): String? =
        readFile(userId, "dp_agent_history.json")

    override suspend fun saveDpAgentHistory(userId: String, json: String) {
        writeFile(userId, "dp_agent_history.json", json)
    }

    override suspend fun loadVocabProgress(userId: String, bookId: String): String? =
        readFile(userId, "vocab_progress_$bookId.json")

    override suspend fun saveVocabProgress(userId: String, bookId: String, json: String) {
        writeFile(userId, "vocab_progress_$bookId.json", json)
    }

    override suspend fun loadVocabCustomBooks(userId: String): String? =
        readFile(userId, "vocab_custom_books.json")

    override suspend fun saveVocabCustomBooks(userId: String, json: String) {
        writeFile(userId, "vocab_custom_books.json", json)
    }

    override suspend fun loadVocabAiHistory(userId: String): String? =
        readFile(userId, "vocab_ai_history.json")

    override suspend fun saveVocabAiHistory(userId: String, json: String) {
        writeFile(userId, "vocab_ai_history.json", json)
    }
}