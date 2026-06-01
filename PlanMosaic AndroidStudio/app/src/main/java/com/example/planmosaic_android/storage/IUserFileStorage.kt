package com.example.planmosaic_android.storage

interface IUserFileStorage {
    suspend fun loadUserData(userId: String): String?
    suspend fun saveUserData(userId: String, json: String)

    suspend fun loadAgentHistory(userId: String): String?
    suspend fun saveAgentHistory(userId: String, json: String)

    suspend fun loadDpAgentHistory(userId: String): String?
    suspend fun saveDpAgentHistory(userId: String, json: String)

    suspend fun loadVocabProgress(userId: String, bookId: String): String?
    suspend fun saveVocabProgress(userId: String, bookId: String, json: String)

    suspend fun loadVocabCustomBooks(userId: String): String?
    suspend fun saveVocabCustomBooks(userId: String, json: String)

    suspend fun loadVocabAiHistory(userId: String): String?
    suspend fun saveVocabAiHistory(userId: String, json: String)
}