package com.example.planmosaic_android.ui.screens.vocab

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.planmosaic_android.ui.theme.AppColors

@Composable
fun VocabScreen(viewModel: VocabViewModel = androidx.lifecycle.viewmodel.compose.viewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .imePadding()
    ) {
        // Header
        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "WordMosaic",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "词汇学习",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            VocabTabBar(
                currentTab = uiState.currentTab,
                onTabSelected = { viewModel.onEvent(VocabEvent.SwitchTab(it)) }
            )
        }

        HorizontalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outline)

        Box(modifier = Modifier.weight(1f)) {
            when (uiState.currentTab) {
                VocabTab.LEARN -> LearnPanel(viewModel, uiState)
                VocabTab.MISTAKES -> VocabMistakesView(viewModel, uiState)
                VocabTab.STATS -> VocabStatsView(viewModel, uiState)
                VocabTab.AI -> VocabAIView(viewModel, uiState)
            }
        }
    }
}

// ============ Tab Bar ============

@Composable
fun VocabTabBar(currentTab: VocabTab, onTabSelected: (VocabTab) -> Unit) {
    val tabs = listOf("学习" to VocabTab.LEARN, "错题本" to VocabTab.MISTAKES, "统计" to VocabTab.STATS, "AI" to VocabTab.AI)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(3.dp)
    ) {
        tabs.forEach { (label, tab) ->
            val selected = currentTab == tab
            val bgColor by animateColorAsState(
                if (selected) MaterialTheme.colorScheme.primary else Color.Transparent,
                label = "tabBg"
            )
            val textColor by animateColorAsState(
                if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                label = "tabText"
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(bgColor)
                    .clickable(onClick = { onTabSelected(tab) }, role = Role.Tab)
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    color = textColor
                )
            }
        }
    }
}

// ============ Learn Panel ============

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LearnPanel(viewModel: VocabViewModel, uiState: VocabUiState) {
    val book = uiState.currentBook

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Book selector
        item {
            if (uiState.books.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(uiState.books) { b ->
                        val isSelected = b.id == uiState.currentBookId
                        Card(
                            modifier = Modifier
                                .clickable { viewModel.onEvent(VocabEvent.SelectBook(b.id)) }
                                .then(if (isSelected) Modifier else Modifier),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = if (isSelected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                            )
                        ) {
                            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                                Text(
                                    text = b.name,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                    color = if (isSelected) MaterialTheme.colorScheme.onPrimary
                                    else MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1
                                )
                                Text(
                                    text = "${b.vocabulary.size} 词",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isSelected) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.7f)
                                    else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }

        // Group chips
        item {
            if (uiState.availableGroups.isNotEmpty() && !uiState.isLocked) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "选择分组",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row {
                            TextButton(onClick = { viewModel.onEvent(VocabEvent.SelectAllGroups(true)) }) {
                                Text("全选", style = MaterialTheme.typography.labelSmall)
                            }
                            TextButton(onClick = { viewModel.onEvent(VocabEvent.SelectAllGroups(false)) }) {
                                Text("清空", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        uiState.availableGroups.forEach { group ->
                            val isSelected = group in uiState.selectedGroups
                            val bg by animateColorAsState(
                                if (isSelected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                label = "group$group"
                            )
                            val fg by animateColorAsState(
                                if (isSelected) MaterialTheme.colorScheme.onPrimary
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                                label = "groupFg$group"
                            )
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(bg)
                                    .clickable { viewModel.onEvent(VocabEvent.ToggleGroup(group)) }
                                    .padding(horizontal = 10.dp, vertical = 4.dp)
                            ) {
                                Text(text = group, style = MaterialTheme.typography.labelMedium, color = fg)
                            }
                        }
                    }
                }
            }
        }

        // Mode toggle + lock + start
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Mode toggle
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                        .padding(2.dp)
                ) {
                    listOf("英译中" to "en2cn", "中译英" to "cn2en").forEach { (label, mode) ->
                        val sel = uiState.mode == mode
                        val bg by animateColorAsState(
                            if (sel) MaterialTheme.colorScheme.primary else Color.Transparent,
                            label = "mode$mode"
                        )
                        val fg by animateColorAsState(
                            if (sel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            label = "modeFg$mode"
                        )
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(bg)
                                .clickable { viewModel.onEvent(VocabEvent.ToggleMode(mode)) }
                                .padding(vertical = 6.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(text = label, style = MaterialTheme.typography.labelMedium, color = fg, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal)
                        }
                    }
                }
                // Lock button
                IconButton(
                    onClick = { viewModel.onEvent(VocabEvent.ToggleLock) }
                ) {
                    Icon(
                        imageVector = if (uiState.isLocked) Icons.Default.Lock else Icons.Default.LockOpen,
                        contentDescription = "锁定",
                        tint = if (uiState.isLocked) AppColors.TodayGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }

        // Start / Quiz area
        if (uiState.quizWords.isEmpty() && uiState.quizState != QuizState.COMPLETE) {
            item {
                Button(
                    onClick = { viewModel.startQuiz() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    Text(
                        text = if (uiState.isReviewMode) "复习错题" else "开始学习",
                        color = MaterialTheme.colorScheme.onPrimary,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                Spacer(modifier = Modifier.height(40.dp))
            }
        }

        // Quiz in progress
        if (uiState.quizWords.isNotEmpty() && uiState.currentWord != null && uiState.quizState != QuizState.COMPLETE) {
            // Progress bar
            item {
                val progress = (uiState.currentIndex.toFloat() / uiState.quizWords.size.toFloat())
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "${uiState.currentIndex + 1} / ${uiState.quizWords.size}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (uiState.isReviewMode) {
                            Text("复习模式", style = MaterialTheme.typography.labelSmall, color = AppColors.TodayGreen)
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp)),
                        color = AppColors.TodayGreen,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                }
            }

            // Question card
            item {
                val word = uiState.currentWord!!
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = when (uiState.quizState) {
                            QuizState.CORRECT -> Color(0xFFE8F5E0)
                            QuizState.WRONG -> Color(0xFFFDE8E8)
                            QuizState.SKIPPED -> Color(0xFFFFF8E1)
                            else -> MaterialTheme.colorScheme.surface
                        }
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        if (uiState.mode == "en2cn") {
                            // EN → CN: show English word
                            Text(
                                text = word.word,
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                            if (word.phonetic.isNotBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(text = word.phonetic, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (word.definition.isNotBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(text = word.definition, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            // 4 choices
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                uiState.choices.chunked(2).forEach { row ->
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                        row.forEachIndexed { idxInRow, choice ->
                                            val globalIdx = (uiState.choices.chunked(2).indexOfFirst { choice in it }) * 2 + idxInRow
                                            val bgChoice = when {
                                                uiState.quizState == QuizState.CORRECT && choice == word.cn -> Color(0xFF4CAF50).copy(alpha = 0.2f)
                                                uiState.quizState == QuizState.WRONG && uiState.selectedChoice == globalIdx -> Color(0xFFE57373).copy(alpha = 0.2f)
                                                uiState.quizState != QuizState.QUESTION && choice == word.cn -> Color(0xFF4CAF50).copy(alpha = 0.15f)
                                                else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                                            }
                                            Box(
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .background(bgChoice)
                                                    .then(
                                                        if (uiState.quizState == QuizState.QUESTION) Modifier.clickable(
                                                            interactionSource = remember { MutableInteractionSource() },
                                                            indication = null,
                                                            onClick = { viewModel.onEvent(VocabEvent.SelectChoice(globalIdx)) }
                                                        ) else Modifier
                                                    )
                                                    .padding(horizontal = 12.dp, vertical = 10.dp)
                                            ) {
                                                Text(
                                                    text = choice,
                                                    style = MaterialTheme.typography.bodyMedium,
                                                    color = MaterialTheme.colorScheme.onSurface,
                                                    maxLines = 2
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            // CN → EN: show Chinese meaning
                            Text(
                                text = word.cn,
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                            if (word.definition.isNotBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(text = word.definition, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                            }
                            Spacer(modifier = Modifier.height(16.dp))

                            if (uiState.quizState == QuizState.QUESTION) {
                                OutlinedTextField(
                                    value = uiState.textInput,
                                    onValueChange = { viewModel.onEvent(VocabEvent.UpdateTextInput(it)) },
                                    placeholder = { Text("输入英文单词") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp),
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                    keyboardActions = KeyboardActions(onDone = { viewModel.onEvent(VocabEvent.SubmitTextInput) }),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = AppColors.TodayGreen,
                                        unfocusedBorderColor = MaterialTheme.colorScheme.outline
                                    )
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "按 Enter 提交 | 留空跳过",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            } else {
                                Text(
                                    text = "正确答案: ${word.word}",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = when (uiState.quizState) {
                                        QuizState.CORRECT -> Color(0xFF4CAF50)
                                        QuizState.SKIPPED -> Color(0xFFF59E0B)
                                        else -> Color(0xFFE57373)
                                    }
                                )
                                if (word.phonetic.isNotBlank()) {
                                    Text(text = word.phonetic, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }

                        // Result indicator
                        if (uiState.quizState != QuizState.QUESTION) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = when (uiState.quizState) {
                                        QuizState.CORRECT -> Icons.Default.Check
                                        QuizState.SKIPPED -> Icons.Default.SkipNext
                                        else -> Icons.Default.Close
                                    },
                                    contentDescription = null,
                                    tint = when (uiState.quizState) {
                                        QuizState.CORRECT -> Color(0xFF4CAF50)
                                        QuizState.SKIPPED -> Color(0xFFF59E0B)
                                        else -> Color(0xFFE57373)
                                    },
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = when (uiState.quizState) {
                                        QuizState.CORRECT -> "正确!"
                                        QuizState.SKIPPED -> "已跳过"
                                        else -> "错误"
                                    },
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = when (uiState.quizState) {
                                        QuizState.CORRECT -> Color(0xFF4CAF50)
                                        QuizState.SKIPPED -> Color(0xFFF59E0B)
                                        else -> Color(0xFFE57373)
                                    }
                                )
                            }
                        }
                    }
                }
            }

            // Skip / Next buttons
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (uiState.quizState == QuizState.QUESTION && uiState.mode == "en2cn") {
                        TextButton(
                            onClick = { viewModel.onEvent(VocabEvent.Skip) },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("跳过", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (uiState.quizState != QuizState.QUESTION) {
                        Button(
                            onClick = { viewModel.onEvent(VocabEvent.Next) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                        ) {
                            Text("下一题", color = MaterialTheme.colorScheme.onPrimary)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(40.dp))
            }
        }

        // Session complete
        if (uiState.quizState == QuizState.COMPLETE) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = null,
                            tint = AppColors.TodayGreen,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = if (uiState.isReviewMode) "复习完成!" else "学习完成!",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Spacer(modifier = Modifier.height(20.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            if (uiState.isReviewMode) {
                                Button(
                                    onClick = { viewModel.onEvent(VocabEvent.StopReview) },
                                    shape = RoundedCornerShape(12.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                                ) {
                                    Text("返回", color = MaterialTheme.colorScheme.onPrimary)
                                }
                            }
                            Button(
                                onClick = {
                                    viewModel.onEvent(VocabEvent.StopReview)
                                    viewModel.startQuiz()
                                },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = AppColors.TodayGreen)
                            ) {
                                Text("再来一轮", color = Color.White)
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(40.dp))
            }
        }
    }
}
