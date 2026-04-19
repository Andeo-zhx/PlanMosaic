package com.example.planmosaic_android.model

import kotlinx.serialization.Serializable

@Serializable
data class VocabWord(
    val word: String = "",
    val phonetic: String = "",
    val definition: String = "",
    val cn: String = "",
    val group: String = ""
)

@Serializable
data class VocabBook(
    val id: String = "",
    val name: String = "",
    val groupType: String = "letter",
    val vocabulary: List<VocabWord> = emptyList(),
    val color: String = "#0F766E"
)

@Serializable
data class VocabStats(
    val total: Int = 0,
    val learned: Int = 0,
    val correct: Int = 0,
    val wrong: Int = 0,
    val skipped: Int = 0
)

@Serializable
data class VocabProgress(
    val stats: VocabStats = VocabStats(),
    val mistakes: List<VocabWord> = emptyList(),
    val selectedGroups: List<String> = emptyList()
)
