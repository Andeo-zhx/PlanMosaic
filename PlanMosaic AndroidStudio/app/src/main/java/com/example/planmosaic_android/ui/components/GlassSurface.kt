package com.example.planmosaic_android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import com.example.planmosaic_android.ui.theme.LocalExtendedColors

@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(16.dp),
    borderAlpha: Float = 0.15f,
    content: @Composable () -> Unit
) {
    val extendedColors = LocalExtendedColors.current

    Box(
        modifier = modifier
            .clip(shape)
            .background(extendedColors.glassBackground)
            .border(
                width = 1.dp,
                color = extendedColors.glassBorder.copy(alpha = borderAlpha),
                shape = shape
            )
    ) {
        content()
    }
}