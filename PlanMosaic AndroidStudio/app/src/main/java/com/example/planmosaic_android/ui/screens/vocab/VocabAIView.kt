package com.example.planmosaic_android.ui.screens.vocab

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.example.planmosaic_android.ui.theme.AppColors

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun VocabAIView(viewModel: VocabViewModel, uiState: VocabUiState) {
    Column(modifier = Modifier.fillMaxSize()) {
        // Quick prompts
        FlowRow(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            listOf("医学英语词汇", "考研核心词汇", "雅思高频词汇", "日常口语词汇").forEach { prompt ->
                QuickPromptChip(
                    text = prompt,
                    onClick = {
                        viewModel.onEvent(VocabEvent.UpdateAiInput(prompt))
                        viewModel.onEvent(VocabEvent.SendAiMessage)
                    },
                    enabled = !uiState.aiIsStreaming
                )
            }
        }

        // Chat messages
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 16.dp),
            reverseLayout = true
        ) {
            // Streaming text (shown at top in reverse layout)
            if (uiState.aiIsStreaming && uiState.aiStreamingText.isNotEmpty()) {
                item {
                    ChatBubble(
                        text = uiState.aiStreamingText,
                        isUser = false,
                        isStreaming = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }

            // Extracted words + save button
            if (uiState.aiExtractedWords.isNotEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E0)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = "已提取 ${uiState.aiExtractedWords.size} 个词条",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = AppColors.TodayGreen
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = {
                                    val name = uiState.aiMessages.lastOrNull { it.first == "user" }?.second?.take(12) ?: "自定义词书"
                                    viewModel.onEvent(VocabEvent.SaveAiBook(name))
                                },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = AppColors.TodayGreen)
                            ) {
                                Text("保存为词书", color = Color.White)
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }

            // Messages in reverse
            items(uiState.aiMessages.reversed()) { (role, content) ->
                ChatBubble(text = content, isUser = role == "user")
                Spacer(modifier = Modifier.height(8.dp))
            }
        }

        // Input area
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = uiState.aiInputText,
                onValueChange = { viewModel.onEvent(VocabEvent.UpdateAiInput(it)) },
                placeholder = { Text("描述你想学习的词汇…") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { viewModel.onEvent(VocabEvent.SendAiMessage) }),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = AppColors.TodayGreen,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                    cursorColor = MaterialTheme.colorScheme.onBackground
                ),
                enabled = !uiState.aiIsStreaming
            )
            Spacer(modifier = Modifier.width(8.dp))
            IconButton(
                onClick = { viewModel.onEvent(VocabEvent.SendAiMessage) },
                enabled = !uiState.aiIsStreaming && uiState.aiInputText.isNotBlank()
            ) {
                if (uiState.aiIsStreaming) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = AppColors.TodayGreen)
                } else {
                    Icon(
                        imageVector = Icons.Default.Send,
                        contentDescription = "发送",
                        tint = if (uiState.aiInputText.isNotBlank()) AppColors.TodayGreen
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun ChatBubble(text: String, isUser: Boolean, isStreaming: Boolean = false) {
    val bgColor = when {
        isUser -> MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
        isStreaming -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
        else -> MaterialTheme.colorScheme.surface
    }

    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = if (isUser) Alignment.TopEnd else Alignment.TopStart) {
        Card(
            shape = RoundedCornerShape(
                topStart = 12.dp, topEnd = 12.dp,
                bottomStart = if (isUser) 12.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 12.dp
            ),
            colors = CardDefaults.cardColors(containerColor = bgColor),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            modifier = Modifier.fillMaxWidth(if (isUser) 0.85f else 1f)
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    text = text,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (isStreaming) {
                    Spacer(modifier = Modifier.height(4.dp))
                    CircularProgressIndicator(
                        modifier = Modifier.size(12.dp),
                        strokeWidth = 1.5.dp,
                        color = AppColors.TodayGreen
                    )
                }
            }
        }
    }
}

@Composable
fun QuickPromptChip(text: String, onClick: () -> Unit, enabled: Boolean) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(
                if (enabled) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
            )
            .then(if (enabled) Modifier.clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ) else Modifier)
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
