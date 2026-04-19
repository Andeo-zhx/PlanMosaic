package com.example.planmosaic_android.ui.screens.schedule

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.planmosaic_android.data.repository.ScheduleRepository
import com.example.planmosaic_android.model.AppData
import com.example.planmosaic_android.model.DaySchedule
import com.example.planmosaic_android.model.Task
import com.example.planmosaic_android.model.TimeSlot
import com.example.planmosaic_android.util.AuthManager
import com.example.planmosaic_android.util.DataStoreManager
import com.example.planmosaic_android.util.DateUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.time.LocalDate

data class ScheduleUiState(
    val selectedDate: LocalDate = DateUtils.today(),
    val weekDates: List<LocalDate> = DateUtils.getWeekDates(),
    val daySchedule: DaySchedule? = null,
    val taskDates: Set<LocalDate> = emptySet(),
    val showAddSheet: Boolean = false,
    val showEditTaskSheet: Boolean = false,
    val showEditTimeSlotSheet: Boolean = false,
    val editingTask: Task? = null,
    val editingTimeSlot: TimeSlot? = null,
    val editingTaskIndex: Int = -1,
    val editingTimeSlotIndex: Int = -1,
    val allSchedules: Map<String, DaySchedule> = emptyMap(),
    val isLoading: Boolean = true,
    val snackbarMessage: String? = null
)

sealed interface ScheduleEvent {
    data class SelectDate(val date: LocalDate) : ScheduleEvent
    data class AddTask(val task: Task) : ScheduleEvent
    data class AddTimeSlot(val slot: TimeSlot) : ScheduleEvent
    data class ToggleTask(val task: Task) : ScheduleEvent
    data class DeleteTask(val task: Task) : ScheduleEvent
    data class DeleteTimeSlot(val slot: TimeSlot) : ScheduleEvent
    data class EditTask(val task: Task, val index: Int) : ScheduleEvent
    data class EditTimeSlot(val slot: TimeSlot, val index: Int) : ScheduleEvent
    data class UpdateTask(val task: Task, val index: Int) : ScheduleEvent
    data class UpdateTimeSlot(val slot: TimeSlot, val index: Int) : ScheduleEvent
    data object ShowAddSheet : ScheduleEvent
    data object HideAddSheet : ScheduleEvent
    data object ShowEditTaskSheet : ScheduleEvent
    data object HideEditTaskSheet : ScheduleEvent
    data object ShowEditTimeSlotSheet : ScheduleEvent
    data object HideEditTimeSlotSheet : ScheduleEvent
    data object Refresh : ScheduleEvent
    data object DismissSnackbar : ScheduleEvent
}

class ScheduleViewModel(application: Application) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(ScheduleUiState())
    val uiState: StateFlow<ScheduleUiState> = _uiState.asStateFlow()

    private val dataStoreManager = DataStoreManager.getInstance(application)
    private val repository = ScheduleRepository(dataStoreManager)

    /** The full app data loaded from local/cloud */
    private var appData: AppData = AppData()
    /** Track the current loading job to cancel previous one on user switch */
    private var loadJob: Job? = null

    init {
        loadScheduleForWeek()

        // Watch for login state changes — re-sync when user switches
        viewModelScope.launch {
            var lastUserId: String? = null
            AuthManager.currentUser.collect { user ->
                val currentUserId = user?.userId
                if (currentUserId != lastUserId) {
                    lastUserId = currentUserId
                    // Clear stale data from previous account
                    appData = AppData()
                    applyWeekToState()
                    // Cancel previous loading job if any
                    loadJob?.cancel()
                    if (user != null) {
                        loadScheduleForWeek()
                    }
                }
            }
        }
    }

    private fun loadScheduleForWeek() {
        // Cancel previous loading job if any
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            // Try full sync if logged in, else show empty
            val userId = AuthManager.userId
            appData = if (userId != null) {
                try {
                    repository.fullSync(userId)
                } catch (_: Exception) {
                    repository.loadLocalData(userId) ?: AppData()
                }
            } else {
                // Not logged in: show empty schedule, don't load stale data
                AppData()
            }

            applyWeekToState()
            _uiState.update { it.copy(isLoading = false) }
            // Clear job reference after completion
            loadJob = null
        }
    }

    private fun applyWeekToState() {
        val state = _uiState.value
        val weekDates = DateUtils.getWeekDates(state.selectedDate)
        val taskDates = mutableSetOf<LocalDate>()
        val weekSchedules = mutableMapOf<String, DaySchedule>()

        weekDates.forEach { date ->
            val dateStr = DateUtils.formatDate(date)
            val schedule = appData.schedules[dateStr]
            if (schedule != null) {
                weekSchedules[dateStr] = schedule
                if (schedule.timeSlots.isNotEmpty() || schedule.tasks.isNotEmpty()) {
                    taskDates.add(date)
                }
            }
        }

        val selectedDateStr = DateUtils.formatDate(state.selectedDate)
        _uiState.update {
            it.copy(
                weekDates = weekDates,
                allSchedules = weekSchedules,
                taskDates = taskDates,
                daySchedule = weekSchedules[selectedDateStr]
            )
        }
    }

    /** Persist current appData to local + cloud */
    private fun persistData() {
        viewModelScope.launch {
            val userId = AuthManager.userId
            if (userId != null) {
                repository.saveLocalData(userId, appData)
                repository.saveCloudData(userId, appData)
            }
        }
    }

    fun onEvent(event: ScheduleEvent) {
        when (event) {
            is ScheduleEvent.SelectDate -> {
                _uiState.update {
                    val newWeekDates = DateUtils.getWeekDates(event.date)
                    val dateStr = DateUtils.formatDate(event.date)
                    it.copy(
                        selectedDate = event.date,
                        weekDates = if (DateUtils.isSameWeek(event.date, it.selectedDate)) it.weekDates else newWeekDates,
                        daySchedule = it.allSchedules[dateStr]
                    )
                }
                if (!DateUtils.isSameWeek(event.date, _uiState.value.selectedDate)) {
                    applyWeekToState()
                }
            }
            is ScheduleEvent.AddTask -> {
                viewModelScope.launch {
                    val dateStr = DateUtils.formatDate(_uiState.value.selectedDate)
                    val existing = appData.schedules[dateStr] ?: DaySchedule(date = dateStr)
                    val updated = existing.copy(tasks = existing.tasks + event.task)
                    appData = appData.copy(schedules = appData.schedules + (dateStr to updated))
                    applyWeekToState()
                    persistData()
                    _uiState.update { it.copy(snackbarMessage = "任务已添加") }
                }
            }
            is ScheduleEvent.AddTimeSlot -> {
                viewModelScope.launch {
                    val dateStr = DateUtils.formatDate(_uiState.value.selectedDate)
                    val existing = appData.schedules[dateStr] ?: DaySchedule(date = dateStr)
                    val updated = existing.copy(timeSlots = existing.timeSlots + event.slot)
                    appData = appData.copy(schedules = appData.schedules + (dateStr to updated))
                    applyWeekToState()
                    persistData()
                    _uiState.update { it.copy(snackbarMessage = "日程已添加") }
                }
            }
            is ScheduleEvent.ToggleTask -> {
                viewModelScope.launch {
                    val dateStr = DateUtils.formatDate(_uiState.value.selectedDate)
                    val existing = appData.schedules[dateStr] ?: return@launch
                    val updatedTasks = existing.tasks.map {
                        if (it.name == event.task.name) it.copy(completed = !it.completed) else it
                    }
                    val updated = existing.copy(tasks = updatedTasks)
                    appData = appData.copy(schedules = appData.schedules + (dateStr to updated))
                    applyWeekToState()
                    persistData()
                }
            }
            is ScheduleEvent.DeleteTask -> {
                viewModelScope.launch {
                    val dateStr = DateUtils.formatDate(_uiState.value.selectedDate)
                    val existing = appData.schedules[dateStr] ?: return@launch
                    val updatedTasks = existing.tasks.filter { it.name != event.task.name }
                    val updated = existing.copy(tasks = updatedTasks)
                    appData = appData.copy(schedules = appData.schedules + (dateStr to updated))
                    applyWeekToState()
                    persistData()
                    _uiState.update { it.copy(snackbarMessage = "任务已删除") }
                }
            }
            is ScheduleEvent.DeleteTimeSlot -> {
                viewModelScope.launch {
                    val dateStr = DateUtils.formatDate(_uiState.value.selectedDate)
                    val existing = appData.schedules[dateStr] ?: return@launch
                    val updatedSlots = existing.timeSlots.filter { it != event.slot }
                    val updated = existing.copy(timeSlots = updatedSlots)
                    appData = appData.copy(schedules = appData.schedules + (dateStr to updated))
                    applyWeekToState()
                    persistData()
                    _uiState.update { it.copy(snackbarMessage = "日程已删除") }
                }
            }
            is ScheduleEvent.EditTask -> {
                _uiState.update {
                    it.copy(
                        editingTask = event.task,
                        editingTaskIndex = event.index,
                        showEditTaskSheet = true
                    )
                }
            }
            is ScheduleEvent.EditTimeSlot -> {
                _uiState.update {
                    it.copy(
                        editingTimeSlot = event.slot,
                        editingTimeSlotIndex = event.index,
                        showEditTimeSlotSheet = true
                    )
                }
            }
            is ScheduleEvent.UpdateTask -> {
                viewModelScope.launch {
                    val dateStr = DateUtils.formatDate(_uiState.value.selectedDate)
                    val existing = appData.schedules[dateStr] ?: return@launch
                    val updatedTasks = existing.tasks.toMutableList()
                    if (event.index in updatedTasks.indices) {
                        updatedTasks[event.index] = event.task
                    }
                    val updated = existing.copy(tasks = updatedTasks)
                    appData = appData.copy(schedules = appData.schedules + (dateStr to updated))
                    applyWeekToState()
                    persistData()
                    _uiState.update { it.copy(snackbarMessage = "任务已更新") }
                }
            }
            is ScheduleEvent.UpdateTimeSlot -> {
                viewModelScope.launch {
                    val dateStr = DateUtils.formatDate(_uiState.value.selectedDate)
                    val existing = appData.schedules[dateStr] ?: return@launch
                    val updatedSlots = existing.timeSlots.toMutableList()
                    if (event.index in updatedSlots.indices) {
                        updatedSlots[event.index] = event.slot
                    }
                    val updated = existing.copy(timeSlots = updatedSlots)
                    appData = appData.copy(schedules = appData.schedules + (dateStr to updated))
                    applyWeekToState()
                    persistData()
                    _uiState.update { it.copy(snackbarMessage = "日程已更新") }
                }
            }
            is ScheduleEvent.ShowAddSheet -> {
                _uiState.update { it.copy(showAddSheet = true) }
            }
            is ScheduleEvent.HideAddSheet -> {
                _uiState.update { it.copy(showAddSheet = false) }
            }
            is ScheduleEvent.ShowEditTaskSheet -> {
                _uiState.update { it.copy(showEditTaskSheet = true) }
            }
            is ScheduleEvent.HideEditTaskSheet -> {
                _uiState.update { it.copy(showEditTaskSheet = false, editingTask = null, editingTaskIndex = -1) }
            }
            is ScheduleEvent.ShowEditTimeSlotSheet -> {
                _uiState.update { it.copy(showEditTimeSlotSheet = true) }
            }
            is ScheduleEvent.HideEditTimeSlotSheet -> {
                _uiState.update { it.copy(showEditTimeSlotSheet = false, editingTimeSlot = null, editingTimeSlotIndex = -1) }
            }
            is ScheduleEvent.Refresh -> {
                loadScheduleForWeek()
            }
            is ScheduleEvent.DismissSnackbar -> {
                _uiState.update { it.copy(snackbarMessage = null) }
            }
        }
    }
}
