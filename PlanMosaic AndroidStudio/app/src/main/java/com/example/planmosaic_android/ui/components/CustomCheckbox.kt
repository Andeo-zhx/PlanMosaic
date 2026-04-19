package com.example.planmosaic_android.ui.components


import androidx.compose.foundation.background
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.example.planmosaic_android.ui.theme.AppColors

@Composable
fun MinimalistCheckbox(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val fillColor by animateColorAsState(
        targetValue = if (checked) AppColors.TodayGreen else Color.Transparent,
        label = "checkFill"
    )
    val checkProgress by animateFloatAsState(
        targetValue = if (checked) 1f else 0f,
        label = "checkProgress"
    )

    Canvas(
        modifier = modifier
            .size(22.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = { onCheckedChange(!checked) },
                role = Role.Checkbox
            )
    ) {
        val strokeWidth = 1.5.dp.toPx()

        // Circle
        drawCircle(
            color = fillColor,
            radius = size.minDimension / 2 - strokeWidth / 2,
            style = if (checked) androidx.compose.ui.graphics.drawscope.Fill else Stroke(width = strokeWidth)
        )

        // Check mark
        if (checkProgress > 0f) {
            val path = androidx.compose.ui.graphics.Path().apply {
                moveTo(size.width * 0.28f, size.height * 0.5f)
                lineTo(size.width * 0.44f, size.height * 0.66f)
                lineTo(size.width * 0.72f, size.height * 0.34f)
            }
            drawPath(
                path = path,
                color = Color.White,
                style = Stroke(
                    width = 1.5.dp.toPx(),
                    cap = StrokeCap.Round,
                    join = androidx.compose.ui.graphics.StrokeJoin.Round
                ),
                alpha = checkProgress
            )
        }
    }
}
