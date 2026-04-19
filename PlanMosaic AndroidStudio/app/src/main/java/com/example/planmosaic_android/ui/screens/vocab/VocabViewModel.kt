package com.example.planmosaic_android.ui.screens.vocab

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.planmosaic_android.data.remote.AiApiClient
import com.example.planmosaic_android.data.repository.ScheduleRepository
import com.example.planmosaic_android.data.repository.VocabRepository
import com.example.planmosaic_android.model.VocabBook
import com.example.planmosaic_android.model.VocabProgress
import com.example.planmosaic_android.model.VocabStats
import com.example.planmosaic_android.model.VocabWord
import com.example.planmosaic_android.util.AuthManager
import com.example.planmosaic_android.util.DataStoreManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ============ Enums ============

enum class VocabTab { LEARN, MISTAKES, STATS, AI }
enum class QuizState { QUESTION, CORRECT, WRONG, SKIPPED, COMPLETE }

// ============ MVI State ============

data class VocabUiState(
    val currentTab: VocabTab = VocabTab.LEARN,
    val books: List<VocabBook> = emptyList(),
    val currentBookId: String = "college1",
    val currentBook: VocabBook? = null,
    val availableGroups: List<String> = emptyList(),
    val selectedGroups: List<String> = emptyList(),
    val mode: String = "en2cn",
    val isReviewMode: Boolean = false,
    val quizWords: List<VocabWord> = emptyList(),
    val currentIndex: Int = 0,
    val quizState: QuizState = QuizState.QUESTION,
    val currentWord: VocabWord? = null,
    val choices: List<String> = emptyList(),
    val selectedChoice: Int = -1,
    val textInput: String = "",
    val isLocked: Boolean = false,
    val progress: VocabProgress = VocabProgress(),
    val aiMessages: List<Pair<String, String>> = emptyList(),
    val aiInputText: String = "",
    val aiIsStreaming: Boolean = false,
    val aiStreamingText: String = "",
    val aiExtractedWords: List<VocabWord> = emptyList(),
    val isLoading: Boolean = true
)

// ============ Events ============

sealed interface VocabEvent {
    data class SwitchTab(val tab: VocabTab) : VocabEvent
    data class SelectBook(val bookId: String) : VocabEvent
    data class ToggleGroup(val group: String) : VocabEvent
    data class SelectAllGroups(val selected: Boolean) : VocabEvent
    data class ToggleMode(val mode: String) : VocabEvent
    data class SelectChoice(val index: Int) : VocabEvent
    data class UpdateTextInput(val text: String) : VocabEvent
    data object SubmitTextInput : VocabEvent
    data object Skip : VocabEvent
    data object Next : VocabEvent
    data object ToggleLock : VocabEvent
    data object StartReview : VocabEvent
    data object ClearMistakes : VocabEvent
    data object ResetProgress : VocabEvent
    data object StopReview : VocabEvent
    data class UpdateAiInput(val text: String) : VocabEvent
    data object SendAiMessage : VocabEvent
    data class SaveAiBook(val name: String) : VocabEvent
    data class DeleteBook(val bookId: String) : VocabEvent
}

// ============ ViewModel ============

class VocabViewModel(application: Application) : AndroidViewModel(application) {
    private val _uiState = MutableStateFlow(VocabUiState())
    val uiState: StateFlow<VocabUiState> = _uiState.asStateFlow()

    private val dataStoreManager = DataStoreManager.getInstance(application)
    private val vocabRepository = VocabRepository(application, dataStoreManager)

    init {
        viewModelScope.launch {
            val builtIn = vocabRepository.loadBuiltInBooks()
            val custom = vocabRepository.loadCustomBooks()
            val allBooks = builtIn + custom
            val savedBookId = vocabRepository.loadCurrentBookId()

            val currentBook = allBooks.find { it.id == savedBookId } ?: allBooks.firstOrNull()
            if (currentBook != null) {
                val groups = extractGroups(currentBook)
                val progress = vocabRepository.loadProgress(currentBook.id)
                _uiState.update { it.copy(
                    books = allBooks,
                    currentBookId = currentBook.id,
                    currentBook = currentBook,
                    availableGroups = groups,
                    selectedGroups = if (progress.selectedGroups.isNotEmpty()) progress.selectedGroups else groups,
                    progress = progress,
                    isLoading = false
                )}
            } else {
                _uiState.update { it.copy(books = allBooks, isLoading = false) }
            }
        }
    }

    init {
        // Watch for user switches to clear AI chat history and reload API keys
        viewModelScope.launch {
            var lastUserId: String? = null
            AuthManager.currentUser.collect { user ->
                val currentUserId = user?.userId
                if (currentUserId != lastUserId) {
                    lastUserId = currentUserId
                    // Clear AI chat history and extracted words to prevent cross-user contamination
                    _uiState.update { state ->
                        state.copy(
                            aiMessages = emptyList(),
                            aiExtractedWords = emptyList(),
                            aiInputText = "",
                            aiStreamingText = "",
                            aiIsStreaming = false
                        )
                    }
                }
            }
        }
    }

    fun onEvent(event: VocabEvent) {
        when (event) {
            is VocabEvent.SwitchTab -> _uiState.update { it.copy(currentTab = event.tab) }

            is VocabEvent.SelectBook -> selectBook(event.bookId)

            is VocabEvent.ToggleGroup -> toggleGroup(event.group)

            is VocabEvent.SelectAllGroups -> selectAllGroups(event.selected)

            is VocabEvent.ToggleMode -> _uiState.update { it.copy(mode = event.mode) }

            is VocabEvent.SelectChoice -> handleChoice(event.index)

            is VocabEvent.UpdateTextInput -> _uiState.update { it.copy(textInput = event.text) }

            is VocabEvent.SubmitTextInput -> handleTextInput()

            is VocabEvent.Skip -> handleSkip()

            is VocabEvent.Next -> nextQuestion()

            is VocabEvent.ToggleLock -> _uiState.update { it.copy(isLocked = !it.isLocked) }

            is VocabEvent.StartReview -> startReview()

            is VocabEvent.StopReview -> stopReview()

            is VocabEvent.ClearMistakes -> clearMistakes()

            is VocabEvent.ResetProgress -> resetProgress()

            is VocabEvent.UpdateAiInput -> _uiState.update { it.copy(aiInputText = event.text) }

            is VocabEvent.SendAiMessage -> sendAiMessage()

            is VocabEvent.SaveAiBook -> saveAiBook(event.name)

            is VocabEvent.DeleteBook -> deleteBook(event.bookId)
        }
    }

    // ============ Book Management ============

    private fun selectBook(bookId: String) {
        val state = _uiState.value
        if (state.isLocked) return
        val book = state.books.find { it.id == bookId } ?: return
        viewModelScope.launch {
            vocabRepository.saveCurrentBookId(bookId)
            val groups = extractGroups(book)
            val progress = vocabRepository.loadProgress(bookId)
            _uiState.update { it.copy(
                currentBookId = bookId,
                currentBook = book,
                availableGroups = groups,
                selectedGroups = if (progress.selectedGroups.isNotEmpty()) progress.selectedGroups else groups,
                progress = progress,
                quizWords = emptyList(),
                currentIndex = 0,
                quizState = QuizState.QUESTION,
                isReviewMode = false,
                isLocked = false
            )}
        }
    }

    private fun extractGroups(book: VocabBook): List<String> {
        return book.vocabulary.map { it.group }.distinct().sorted()
    }

    // ============ Group Management ============

    private fun toggleGroup(group: String) {
        val state = _uiState.value
        if (state.isLocked) return
        val current = state.selectedGroups.toMutableList()
        if (current.contains(group)) {
            if (current.size > 1) current.remove(group)
        } else {
            current.add(group)
        }
        val sorted = current.sorted()
        _uiState.update { it.copy(selectedGroups = sorted) }
        saveGroupSelection(sorted)
    }

    private fun selectAllGroups(selected: Boolean) {
        val state = _uiState.value
        if (state.isLocked) return
        val groups = if (selected) state.availableGroups else listOf(state.availableGroups.firstOrNull() ?: "")
        _uiState.update { it.copy(selectedGroups = groups) }
        saveGroupSelection(groups)
    }

    private fun saveGroupSelection(groups: List<String>) {
        val state = _uiState.value
        viewModelScope.launch {
            val updated = state.progress.copy(selectedGroups = groups)
            vocabRepository.saveProgress(state.currentBookId, updated)
            _uiState.update { it.copy(progress = updated) }
        }
    }

    // ============ Learning Logic ============

    fun startQuiz() {
        val state = _uiState.value
        val book = state.currentBook ?: return
        val filtered = if (state.isReviewMode) {
            state.progress.mistakes.filter { it.group in state.selectedGroups }
        } else {
            book.vocabulary.filter { it.group in state.selectedGroups }
        }
        if (filtered.isEmpty()) return

        val shuffled = fisherYatesShuffle(filtered)
        _uiState.update { it.copy(
            quizWords = shuffled,
            currentIndex = 0,
            quizState = QuizState.QUESTION,
            isLocked = true
        )}
        prepareCurrentQuestion()
    }

    private fun prepareCurrentQuestion() {
        val state = _uiState.value
        val word = state.quizWords.getOrElse(state.currentIndex) { return }
        val choices = if (state.mode == "en2cn") {
            generateChoices(word, state.currentBook?.vocabulary ?: state.quizWords)
        } else {
            emptyList()
        }
        _uiState.update { it.copy(
            currentWord = word,
            choices = choices,
            selectedChoice = -1,
            textInput = "",
            quizState = QuizState.QUESTION
        )}
    }

    private fun generateChoices(correctWord: VocabWord, allWords: List<VocabWord>): List<String> {
        val correctCn = correctWord.cn
        val wrongOptions = allWords
            .filter { it.cn != correctCn }
            .shuffled()
            .take(3)
            .map { it.cn }
        val options = (wrongOptions + correctCn).shuffled()
        return options
    }

    private fun handleChoice(index: Int) {
        val state = _uiState.value
        if (state.quizState != QuizState.QUESTION) return
        val word = state.currentWord ?: return
        val isCorrect = state.choices.getOrNull(index) == word.cn
        val newState = if (isCorrect) QuizState.CORRECT else QuizState.WRONG
        _uiState.update { it.copy(selectedChoice = index, quizState = newState) }
        processResult(word, isCorrect)
    }

    private fun handleTextInput() {
        val state = _uiState.value
        if (state.quizState != QuizState.QUESTION) return
        val word = state.currentWord ?: return
        val answer = state.textInput.trim()
        if (answer.isEmpty()) {
            handleSkip()
            return
        }
        val isCorrect = answer.equals(word.word, ignoreCase = true)
        val newState = if (isCorrect) QuizState.CORRECT else QuizState.WRONG
        _uiState.update { it.copy(quizState = newState) }
        processResult(word, isCorrect)
    }

    private fun handleSkip() {
        val state = _uiState.value
        if (state.quizState != QuizState.QUESTION) return
        val word = state.currentWord ?: return
        _uiState.update { it.copy(quizState = QuizState.SKIPPED) }
        processResult(word, false, skipped = true)
    }

    private fun processResult(word: VocabWord, isCorrect: Boolean, skipped: Boolean = false) {
        val state = _uiState.value
        val stats = state.progress.stats
        val mistakes = state.progress.mistakes.toMutableList()

        val newStats = when {
            skipped -> stats.copy(skipped = stats.skipped + 1)
            isCorrect -> stats.copy(
                correct = stats.correct + 1,
                learned = minOf(stats.learned + 1, stats.total)
            )
            else -> stats.copy(wrong = stats.wrong + 1)
        }

        if (skipped || !isCorrect) {
            if (mistakes.none { it.word == word.word }) {
                mistakes.add(word)
            }
        } else if (isCorrect && state.isReviewMode) {
            mistakes.removeAll { it.word == word.word }
        }

        val total = state.currentBook?.vocabulary?.size ?: 0
        val finalStats = newStats.copy(total = total)

        val updatedProgress = state.progress.copy(stats = finalStats, mistakes = mistakes)
        _uiState.update { it.copy(progress = updatedProgress) }

        viewModelScope.launch {
            vocabRepository.saveProgress(state.currentBookId, updatedProgress)
        }
    }

    private fun nextQuestion() {
        val state = _uiState.value
        val nextIndex = state.currentIndex + 1
        if (nextIndex >= state.quizWords.size) {
            _uiState.update { it.copy(quizState = QuizState.COMPLETE) }
            return
        }
        _uiState.update { it.copy(currentIndex = nextIndex) }
        prepareCurrentQuestion()
    }

    // ============ Review Mode ============

    private fun startReview() {
        _uiState.update { it.copy(isReviewMode = true, currentTab = VocabTab.LEARN) }
        startQuiz()
    }

    private fun stopReview() {
        _uiState.update { it.copy(isReviewMode = false, quizWords = emptyList(), isLocked = false, quizState = QuizState.QUESTION) }
    }

    // ============ Mistakes ============

    private fun clearMistakes() {
        val state = _uiState.value
        val updated = state.progress.copy(mistakes = emptyList())
        _uiState.update { it.copy(progress = updated) }
        viewModelScope.launch {
            vocabRepository.saveProgress(state.currentBookId, updated)
        }
    }

    // ============ Reset ============

    private fun resetProgress() {
        val state = _uiState.value
        val total = state.currentBook?.vocabulary?.size ?: 0
        val updated = VocabProgress(stats = VocabStats(total = total), selectedGroups = state.selectedGroups)
        _uiState.update { it.copy(progress = updated, quizWords = emptyList(), isLocked = false, quizState = QuizState.QUESTION) }
        viewModelScope.launch {
            vocabRepository.saveProgress(state.currentBookId, updated)
        }
    }

    // ============ AI Chat ============

    private fun sendAiMessage() {
        val state = _uiState.value
        val prompt = state.aiInputText.trim()
        if (prompt.isEmpty() || state.aiIsStreaming) return

        val messages = state.aiMessages + ("user" to prompt)
        _uiState.update { it.copy(
            aiMessages = messages,
            aiInputText = "",
            aiIsStreaming = true,
            aiStreamingText = "",
            aiExtractedWords = emptyList()
        )}

        viewModelScope.launch {
            try {
                val apiKey = getApiKey()
                val provider = getProvider()
                if (apiKey.isBlank()) {
                    _uiState.update { it.copy(
                        aiMessages = it.aiMessages + ("assistant" to "请先在「我的 → AI 设置」中配置 API Key。"),
                        aiIsStreaming = false
                    )}
                    return@launch
                }

                val systemPrompt = """You are Mosa, a professional vocabulary extraction assistant.
Rules:
1. Extract vocabulary in JSON line format: {"word":"english","phonetic":"/phonetic/","cn":"中文","definition":"English definition","group":"A"}
2. First briefly analyze the request (1-2 sentences), then output JSON lines.
3. End with: {"__summary__":"已提取 N 个词条"}"""

                val apiMessages = listOf(
                    AiApiClient.textMessage("system", systemPrompt)
                ) + messages.map { (role, content) ->
                    AiApiClient.textMessage(role, content)
                }

                val fullText = StringBuilder()
                AiApiClient.chatStream(apiKey, provider, apiMessages).collect { chunk ->
                    fullText.append(chunk)
                    _uiState.update { it.copy(aiStreamingText = fullText.toString()) }
                }

                // Extract words from response
                val lines = fullText.toString().lines()
                val extractedWords = mutableListOf<VocabWord>()
                for (line in lines) {
                    val trimmed = line.trim()
                    if (trimmed.startsWith("{") && trimmed.endsWith("}") && !trimmed.contains("__summary__")) {
                        try {
                            val word = kotlinx.serialization.json.Json.decodeFromString<VocabWord>(trimmed)
                            if (word.word.isNotBlank() && word.cn.isNotBlank()) {
                                extractedWords.add(word)
                            }
                        } catch (_: Exception) { }
                    }
                }

                val finalText = fullText.toString()
                _uiState.update { it.copy(
                    aiMessages = it.aiMessages + ("assistant" to finalText),
                    aiIsStreaming = false,
                    aiStreamingText = "",
                    aiExtractedWords = extractedWords
                )}
            } catch (e: Exception) {
                _uiState.update { it.copy(
                    aiMessages = it.aiMessages + ("assistant" to "错误: ${e.message}"),
                    aiIsStreaming = false,
                    aiStreamingText = ""
                )}
            }
        }
    }

    private fun saveAiBook(name: String) {
        val state = _uiState.value
        val words = state.aiExtractedWords
        if (words.isEmpty()) return

        val bookId = "custom_${System.currentTimeMillis()}"
        val book = VocabBook(
            id = bookId,
            name = name,
            groupType = "letter",
            vocabulary = words,
            color = "#8B5CF6"
        )
        viewModelScope.launch {
            vocabRepository.saveCustomBook(book)
            val updatedBooks = state.books + book
            _uiState.update { it.copy(books = updatedBooks, aiExtractedWords = emptyList()) }
        }
    }

    private fun deleteBook(bookId: String) {
        val state = _uiState.value
        viewModelScope.launch {
            vocabRepository.deleteCustomBook(bookId)
            val updatedBooks = state.books.filter { it.id != bookId }
            _uiState.update { it.copy(books = updatedBooks) }
            if (state.currentBookId == bookId) {
                val first = updatedBooks.firstOrNull()
                if (first != null) selectBook(first.id)
            }
        }
    }

    // ============ Helpers ============

    private suspend fun getApiKey(): String {
        val userId = AuthManager.userId ?: return ""
        val repo = ScheduleRepository(dataStoreManager)
        val data = repo.loadLocalData(userId) ?: return ""
        return when (data.settings.aiProvider) {
            "qwen" -> data.apiKeys.qwen
            else -> data.apiKeys.deepseek
        }
    }

    private suspend fun getProvider(): String {
        val userId = AuthManager.userId ?: return "deepseek"
        val repo = ScheduleRepository(dataStoreManager)
        val data = repo.loadLocalData(userId) ?: return "deepseek"
        return data.settings.aiProvider
    }

    private fun <T> fisherYatesShuffle(list: List<T>): List<T> {
        val arr = list.toMutableList()
        for (i in arr.size - 1 downTo 1) {
            val j = (0..i).random()
            val temp = arr[i]
            arr[i] = arr[j]
            arr[j] = temp
        }
        return arr.toList()
    }
}
