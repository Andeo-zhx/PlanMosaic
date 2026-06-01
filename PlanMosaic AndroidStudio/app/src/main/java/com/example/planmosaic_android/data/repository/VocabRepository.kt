package com.example.planmosaic_android.data.repository

import android.content.Context
import android.util.Log
import com.example.planmosaic_android.model.VocabBook
import com.example.planmosaic_android.model.VocabProgress
import com.example.planmosaic_android.storage.IPreferencesStorage
import com.example.planmosaic_android.storage.IUserFileStorage
import com.example.planmosaic_android.util.AuthManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

class VocabRepository(
    private val context: Context,
    private val userFileStorage: IUserFileStorage,
    private val preferencesStorage: IPreferencesStorage,
    private val authManager: AuthManager
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val builtInBookFiles = listOf(
        "college1.json" to "大学英语 Book1",
        "college2.json" to "大学英语 Book2",
        "college3.json" to "大学英语 Book3",
        "medical.json" to "新医科学术英语"
    )

    suspend fun loadBuiltInBooks(): List<VocabBook> = withContext(Dispatchers.IO) {
        builtInBookFiles.mapNotNull { (filename, _) ->
            try {
                val text = context.assets.open("vocab/$filename").bufferedReader().use { it.readText() }
                json.decodeFromString<VocabBook>(text)
            } catch (e: Exception) {
                Log.w("VocabRepository", "Failed to load built-in book $filename", e)
                null
            }
        }
    }

    suspend fun loadCustomBooks(): List<VocabBook> {
        val userId = authManager.userId ?: return emptyList()
        val raw = userFileStorage.loadVocabCustomBooks(userId) ?: return emptyList()
        return try {
            json.decodeFromString<List<VocabBook>>(raw)
        } catch (e: Exception) {
            Log.w("VocabRepository", "Failed to parse custom books", e)
            emptyList()
        }
    }

    suspend fun saveCustomBook(book: VocabBook) {
        val existing = loadCustomBooks().toMutableList()
        val idx = existing.indexOfFirst { it.id == book.id }
        if (idx >= 0) existing[idx] = book else existing.add(book)
        val userId = authManager.userId ?: return
        userFileStorage.saveVocabCustomBooks(userId, json.encodeToString(existing))
    }

    suspend fun deleteCustomBook(bookId: String) {
        val existing = loadCustomBooks().filter { it.id != bookId }
        val userId = authManager.userId ?: return
        userFileStorage.saveVocabCustomBooks(userId, json.encodeToString(existing))
    }

    suspend fun loadProgress(bookId: String): VocabProgress {
        val userId = authManager.userId ?: return VocabProgress()
        val raw = userFileStorage.loadVocabProgress(userId, bookId) ?: return VocabProgress()
        return try {
            json.decodeFromString<VocabProgress>(raw)
        } catch (e: Exception) {
            Log.w("VocabRepository", "Failed to parse progress for $bookId", e)
            VocabProgress()
        }
    }

    suspend fun saveProgress(bookId: String, progress: VocabProgress) {
        val userId = authManager.userId ?: return
        userFileStorage.saveVocabProgress(userId, bookId, json.encodeToString(VocabProgress.serializer(), progress))
    }

    suspend fun loadCurrentBookId(): String {
        return preferencesStorage.vocabCurrentBook.first()
    }

    suspend fun saveCurrentBookId(bookId: String) {
        preferencesStorage.saveVocabCurrentBook(bookId)
    }
}
