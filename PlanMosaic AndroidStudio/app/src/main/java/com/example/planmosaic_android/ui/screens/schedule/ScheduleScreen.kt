package com.example.planmosaic_android.ui.screens.schedule

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.planmosaic_android.model.TimeSlot
import com.example.planmosaic_android.model.Task
import com.example.planmosaic_android.ui.components.MinimalistCheckbox
import com.example.planmosaic_android.ui.theme.AppColors
import com.example.planmosaic_android.util.DateUtils
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleScreen(
    viewModel: ScheduleViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    // Show snackbar when message changes
    LaunchedEffect(uiState.snackbarMessage) {
        uiState.snackbarMessage?.let {
            snackbarHostState.showSnackbar(it, duration = SnackbarDuration.Short)
            viewModel.onEvent(ScheduleEvent.DismissSnackbar)
        }
    }

    // Add sheet
    if (uiState.showAddSheet) {
        AddTaskBottomSheet(
            onDismiss = { viewModel.onEvent(ScheduleEvent.HideAddSheet) },
            onAddTask = { task -> viewModel.onEvent(ScheduleEvent.AddTask(task)) },
            onAddTimeSlot = { slot -> viewModel.onEvent(ScheduleEvent.AddTimeSlot(slot)) }
        )
    }

    // Edit task sheet
    if (uiState.showEditTaskSheet && uiState.editingTask != null) {
        val editingTask = uiState.editingTask
        EditTaskBottomSheet(
            task = editingTask!!,
            index = uiState.editingTaskIndex,
            onDismiss = { viewModel.onEvent(ScheduleEvent.HideEditTaskSheet) },
            onUpdateTask = { task, index -> viewModel.onEvent(ScheduleEvent.UpdateTask(task, index)) }
        )
    }

    // Edit time slot sheet
    if (uiState.showEditTimeSlotSheet && uiState.editingTimeSlot != null) {
        val editingTimeSlot = uiState.editingTimeSlot
        EditTimeSlotBottomSheet(
            slot = editingTimeSlot!!,
            index = uiState.editingTimeSlotIndex,
            onDismiss = { viewModel.onEvent(ScheduleEvent.HideEditTimeSlotSheet) },
            onUpdateSlot = { slot, index -> viewModel.onEvent(ScheduleEvent.UpdateTimeSlot(slot, index)) }
        )
    }

    Scaffold(
        snackbarHost = {
            SnackbarHost(hostState = snackbarHostState) { data ->
                Snackbar(
                    snackbarData = data,
                    shape = RoundedCornerShape(12.dp),
                    containerColor = AppColors.OnSurface,
                    contentColor = AppColors.Surface,
                    modifier = Modifier.padding(16.dp)
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            ) {
                // Month/Year header
                Text(
                    text = "${uiState.selectedDate.monthValue}月 ${uiState.selectedDate.year}",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)
                )

                WeeklyDateStrip(
                    selectedDate = uiState.selectedDate,
                    weekDates = uiState.weekDates,
                    taskDates = uiState.taskDates,
                    onDateSelected = { viewModel.onEvent(ScheduleEvent.SelectDate(it)) }
                )

                Spacer(modifier = Modifier.height(8.dp))

                val daySchedule = uiState.daySchedule
                if (daySchedule == null || (daySchedule.timeSlots.isEmpty() && daySchedule.tasks.isEmpty())) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(top = 80.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "暂无安排",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize()
                    ) {
                        // Course time slots section
                        if (daySchedule.timeSlots.isNotEmpty()) {
                            item {
                                Spacer(modifier = Modifier.height(8.dp))
                                SectionHeader(title = "课程")
                            }
                        }

                        val courseColors = AppColors.CourseIndicatorColors
                        itemsIndexed(
                            items = daySchedule.timeSlots.sortedBy { it.time },
                            key = { index, slot -> "${slot.time}-${slot.activity}-$index" }
                        ) { index, slot ->
                            CourseTimeSlotCard(
                                slot = slot,
                                color = courseColors[index % courseColors.size],
                                onEdit = {
                                    val originalIndex = daySchedule.timeSlots.indexOf(slot)
                                    if (originalIndex >= 0) {
                                        viewModel.onEvent(ScheduleEvent.EditTimeSlot(slot, originalIndex))
                                    }
                                },
                                onDelete = {
                                    viewModel.onEvent(ScheduleEvent.DeleteTimeSlot(slot))
                                }
                            )
                        }

                        // Tasks section
                        if (daySchedule.tasks.isNotEmpty()) {
                            item {
                                Spacer(modifier = Modifier.height(16.dp))
                                SectionHeader(title = "任务")
                            }

                            itemsIndexed(
                                items = daySchedule.tasks,
                                key = { index, task -> "${task.name}-$index" }
                            ) { index, task ->
                                TaskItem(
                                    task = task,
                                    onToggleComplete = {
                                        viewModel.onEvent(ScheduleEvent.ToggleTask(task))
                                    },
                                    onEdit = {
                                        viewModel.onEvent(ScheduleEvent.EditTask(task, index))
                                    },
                                    onDelete = {
                                        viewModel.onEvent(ScheduleEvent.DeleteTask(task))
                                    }
                                )
                            }
                        }

                        item { Spacer(modifier = Modifier.height(80.dp)) }
                    }
                }
            }

            // FAB - warm dark style matching PC button aesthetic
            FloatingActionButton(
                onClick = { viewModel.onEvent(ScheduleEvent.ShowAddSheet) },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 24.dp, bottom = 24.dp)
                    .size(56.dp)
                    .shadow(
                        elevation = 6.dp,
                        shape = RoundedCornerShape(16.dp),
                        spotColor = Color(0x0F1A1918) // subtle warm shadow
                    )
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = "添加",
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.5.sp,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
    )
}

@Composable
fun WeeklyDateStrip(
    selectedDate: LocalDate,
    weekDates: List<LocalDate>,
    taskDates: Set<LocalDate>,
    onDateSelected: (LocalDate) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        weekDates.forEach { date ->
            val isSelected = date == selectedDate
            val isToday = DateUtils.isToday(date)
            val hasTasks = taskDates.contains(date)

            // Use warm dark for selected, green for today, transparent otherwise
            val backgroundColor by animateColorAsState(
                targetValue = when {
                    isSelected -> MaterialTheme.colorScheme.primary  // warm dark
                    isToday -> AppColors.TodayGreenLight             // light green tint
                    else -> Color.Transparent
                },
                animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                label = "backgroundColor"
            )

            val contentColor by animateColorAsState(
                targetValue = when {
                    isSelected -> MaterialTheme.colorScheme.onPrimary   // white on dark
                    isToday -> AppColors.TodayGreen                     // vivid green
                    else -> MaterialTheme.colorScheme.onSurface         // warm dark
                },
                animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                label = "contentColor"
            )

            val labelColor = when {
                isSelected -> MaterialTheme.colorScheme.onPrimary
                isToday -> AppColors.TodayGreen
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            }

            Column(
                modifier = Modifier
                    .sizeIn(minWidth = 48.dp, minHeight = 72.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(backgroundColor)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = { onDateSelected(date) },
                        role = Role.Tab
                    )
                    .padding(horizontal = 10.dp, vertical = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    text = DateUtils.getWeekDayShortLabel(date),
                    style = MaterialTheme.typography.labelSmall,
                    color = labelColor
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = date.dayOfMonth.toString(),
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = if (isSelected || isToday) FontWeight.Bold else FontWeight.Medium
                    ),
                    color = contentColor
                )
                Spacer(modifier = Modifier.height(4.dp))
                if (hasTasks) {
                    val dotColor = when {
                        isSelected -> MaterialTheme.colorScheme.onPrimary
                        isToday -> AppColors.TodayGreen
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                    Canvas(modifier = Modifier.size(5.dp)) {
                        drawCircle(
                            color = dotColor,
                            radius = 2.5.dp.toPx()
                        )
                    }
                } else {
                    Spacer(modifier = Modifier.size(5.dp))
                }
            }
        }
    }
}

@Composable
fun CourseTimeSlotCard(
    slot: TimeSlot,
    color: Color,
    onEdit: () -> Unit = {},
    onDelete: () -> Unit = {}
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 6.dp)
            .shadow(
                elevation = 2.dp,
                shape = RoundedCornerShape(12.dp),
                spotColor = Color(0x081A1918),
                ambientColor = Color(0x041A1918)
            )
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable { onEdit() }
            .padding(vertical = 14.dp, horizontal = 16.dp)
    ) {
        // Color indicator strip
        Box(
            modifier = Modifier
                .width(4.dp)
                .height(44.dp)
                .background(color = color, shape = RoundedCornerShape(percent = 50))
                .align(Alignment.CenterVertically)
        )
        Spacer(modifier = Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
            Text(
                text = slot.activity,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(3.dp))
            Text(
                text = slot.time,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (slot.detail.isNotBlank()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = slot.detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        // Edit & Delete buttons
        IconButton(
            onClick = onEdit,
            modifier = Modifier.size(32.dp).align(Alignment.CenterVertically)
        ) {
            Icon(
                imageVector = Icons.Default.Edit,
                contentDescription = "编辑",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp)
            )
        }
        IconButton(
            onClick = onDelete,
            modifier = Modifier.size(32.dp).align(Alignment.CenterVertically)
        ) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = "删除",
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
fun TaskItem(
    task: Task,
    onToggleComplete: () -> Unit,
    onEdit: () -> Unit = {},
    onDelete: () -> Unit = {}
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 6.dp)
            .shadow(
                elevation = 2.dp,
                shape = RoundedCornerShape(12.dp),
                spotColor = Color(0x081A1918),
                ambientColor = Color(0x041A1918)
            )
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable { onEdit() }
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Task indicator bar - green for today's tasks, accent otherwise
        val today = DateUtils.isToday(java.time.LocalDate.now())
        Box(
            modifier = Modifier
                .width(4.dp)
                .height(22.dp)
                .background(
                    color = when {
                        task.completed -> MaterialTheme.colorScheme.outlineVariant
                        else -> AppColors.TodayGreen  // Vivid green for task bars
                    },
                    shape = RoundedCornerShape(percent = 50)
                )
        )
        Spacer(modifier = Modifier.width(10.dp))
        MinimalistCheckbox(
            checked = task.completed,
            onCheckedChange = { onToggleComplete() }
        )
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = task.name,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontWeight = if (task.completed) FontWeight.Normal else FontWeight.SemiBold
                ),
                color = if (task.completed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                textDecoration = if (task.completed) TextDecoration.LineThrough else null
            )
            if (task.estimated.isNotBlank()) {
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = "${task.estimated}分钟",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        // Edit & Delete buttons
        IconButton(
            onClick = onEdit,
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Edit,
                contentDescription = "编辑",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp)
            )
        }
        IconButton(
            onClick = onDelete,
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = "删除",
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

// ============ Add Task/TimeSlot Bottom Sheet ============

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTaskBottomSheet(
    onDismiss: () -> Unit,
    onAddTask: (Task) -> Unit,
    onAddTimeSlot: (TimeSlot) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var taskName by rememberSaveable { mutableStateOf("") }
    var taskEstimated by rememberSaveable { mutableStateOf("") }
    var slotActivity by rememberSaveable { mutableStateOf("") }
    var slotTime by rememberSaveable { mutableStateOf("") }
    var activeTab by rememberSaveable { mutableStateOf(0) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp, bottom = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(4.dp)
                        .background(
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f),
                            shape = RoundedCornerShape(percent = 50)
                        )
                )
            }
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp)
        ) {
            // Tab selector
            Row(modifier = Modifier.fillMaxWidth()) {
                listOf("任务", "日程").forEachIndexed { index, title ->
                    TextButton(
                        onClick = { activeTab = index },
                        modifier = Modifier.padding(end = 8.dp)
                    ) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.labelLarge,
                            color = if (activeTab == index) {
                                MaterialTheme.colorScheme.onBackground
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            fontWeight = if (activeTab == index) FontWeight.SemiBold else FontWeight.Normal
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (activeTab == 0) {
                // Task form
                MinimalistTextField(
                    value = taskName,
                    onValueChange = { taskName = it },
                    placeholder = "任务名称",
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                MinimalistTextField(
                    value = taskEstimated,
                    onValueChange = { taskEstimated = it },
                    placeholder = "预计用时（分钟）",
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(20.dp))
                WarmActionButton(
                    text = "添加任务",
                    onClick = {
                        if (taskName.isNotBlank()) {
                            onAddTask(
                                Task(
                                    name = taskName,
                                    estimated = taskEstimated,
                                    actual = "",
                                    note = "",
                                    completed = false
                                )
                            )
                            taskName = ""
                            taskEstimated = ""
                            onDismiss()
                        }
                    }
                )
            } else {
                // Time slot form
                MinimalistTextField(
                    value = slotActivity,
                    onValueChange = { slotActivity = it },
                    placeholder = "活动名称",
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                MinimalistTextField(
                    value = slotTime,
                    onValueChange = { slotTime = it },
                    placeholder = "时间（如 14:00-15:30）",
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(20.dp))
                WarmActionButton(
                    text = "添加日程",
                    onClick = {
                        if (slotActivity.isNotBlank() && slotTime.isNotBlank()) {
                            onAddTimeSlot(
                                TimeSlot(
                                    time = slotTime,
                                    activity = slotActivity,
                                    detail = "",
                                    icon = ""
                                )
                            )
                            slotActivity = ""
                            slotTime = ""
                            onDismiss()
                        }
                    }
                )
            }
        }
    }
}

// ============ Edit Task Bottom Sheet ============

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditTaskBottomSheet(
    task: Task,
    index: Int,
    onDismiss: () -> Unit,
    onUpdateTask: (Task, Int) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var taskName by rememberSaveable { mutableStateOf(task.name) }
    var taskEstimated by rememberSaveable { mutableStateOf(task.estimated) }
    var taskNote by rememberSaveable { mutableStateOf(task.note) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp, bottom = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(4.dp)
                        .background(
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f),
                            shape = RoundedCornerShape(percent = 50)
                        )
                )
            }
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp)
        ) {
            Text(
                text = "编辑任务",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            MinimalistTextField(
                value = taskName,
                onValueChange = { taskName = it },
                placeholder = "任务名称",
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            MinimalistTextField(
                value = taskEstimated,
                onValueChange = { taskEstimated = it },
                placeholder = "预计用时（分钟）",
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            MinimalistTextField(
                value = taskNote,
                onValueChange = { taskNote = it },
                placeholder = "备注",
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(20.dp))
            WarmActionButton(
                text = "保存",
                onClick = {
                    if (taskName.isNotBlank()) {
                        onUpdateTask(
                            Task(
                                name = taskName,
                                estimated = taskEstimated,
                                actual = task.actual,
                                note = taskNote,
                                completed = task.completed
                            ),
                            index
                        )
                        onDismiss()
                    }
                }
            )
        }
    }
}

// ============ Edit TimeSlot Bottom Sheet ============

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditTimeSlotBottomSheet(
    slot: TimeSlot,
    index: Int,
    onDismiss: () -> Unit,
    onUpdateSlot: (TimeSlot, Int) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var slotActivity by rememberSaveable { mutableStateOf(slot.activity) }
    var slotTime by rememberSaveable { mutableStateOf(slot.time) }
    var slotDetail by rememberSaveable { mutableStateOf(slot.detail) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp, bottom = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(4.dp)
                        .background(
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f),
                            shape = RoundedCornerShape(percent = 50)
                        )
                )
            }
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp)
        ) {
            Text(
                text = "编辑日程",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            MinimalistTextField(
                value = slotActivity,
                onValueChange = { slotActivity = it },
                placeholder = "活动名称",
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            MinimalistTextField(
                value = slotTime,
                onValueChange = { slotTime = it },
                placeholder = "时间（如 14:00-15:30）",
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            MinimalistTextField(
                value = slotDetail,
                onValueChange = { slotDetail = it },
                placeholder = "详情",
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(20.dp))
            WarmActionButton(
                text = "保存",
                onClick = {
                    if (slotActivity.isNotBlank() && slotTime.isNotBlank()) {
                        onUpdateSlot(
                            TimeSlot(
                                time = slotTime,
                                activity = slotActivity,
                                detail = slotDetail,
                                icon = slot.icon
                            ),
                            index
                        )
                        onDismiss()
                    }
                }
            )
        }
    }
}

// ============ Shared UI Components ============

@Composable
private fun WarmActionButton(
    text: String,
    onClick: () -> Unit
) {
    TextButton(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .background(
                color = MaterialTheme.colorScheme.primary,
                shape = RoundedCornerShape(12.dp)
            )
    ) {
        Text(
            text = text,
            color = MaterialTheme.colorScheme.onPrimary,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
fun MinimalistTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = {
            Text(
                text = placeholder,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        modifier = modifier.height(52.dp),
        singleLine = true,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Color.Transparent,
            unfocusedBorderColor = Color.Transparent,
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            cursorColor = MaterialTheme.colorScheme.onBackground,
            focusedTextColor = MaterialTheme.colorScheme.onBackground,
            unfocusedTextColor = MaterialTheme.colorScheme.onBackground
        ),
        shape = RoundedCornerShape(12.dp)
    )
}
