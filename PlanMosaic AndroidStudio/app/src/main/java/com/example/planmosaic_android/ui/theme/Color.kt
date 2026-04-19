package com.example.planmosaic_android.ui.theme


import androidx.compose.foundation.background
import androidx.compose.ui.graphics.Color

// =============================================
// PlanMosaic Design Token System
// Aligned with PC version's organic warm palette
// =============================================

// Primitive tokens - Raw palette (matching PC index.html)
object PrimitiveColors {
    val White = Color(0xFFFFFFFF)
    val Black = Color(0xFF1A1918)
    val Paper = Color(0xFFF9F8F6)
    val SurfaceHover = Color(0xFFF3F1EC)
    val Active = Color(0xFFEAE8E2)
    val Hero = Color(0xFF1A1918)
    val Primary = Color(0xFF3E3C38)
    val Secondary = Color(0xFF8A8780)
    val Disabled = Color(0xFFD0CEC7)
    val Accent = Color(0xFF8A7D72)
    val AccentLight = Color(0xFFC4BDB5)
    val Border = Color(0xFFE8E6E0)
    val BorderDark = Color(0xFFD0CEC7)

    // Status colors (from PC)
    val Success = Color(0xFF7BA06A)
    val Warning = Color(0xFFB8943D)
    val Danger = Color(0xFFB06858)
    val Info = Color(0xFF6B82A5)
}

// Semantic tokens - Usage-focused (aligned with PC's Layer 2)
object AppColors {
    // Backgrounds - tranquil, warm off-white
    val Background = PrimitiveColors.Paper
    val Surface = PrimitiveColors.White
    val SurfaceVariant = PrimitiveColors.SurfaceHover
    val SurfaceActive = PrimitiveColors.Active

    // Text / Ink - organic dark tones
    val OnBackground = PrimitiveColors.Hero
    val OnSurface = PrimitiveColors.Primary
    val OnSurfaceVariant = PrimitiveColors.Secondary
    val TextDisabled = PrimitiveColors.Disabled

    // Borders
    val Outline = PrimitiveColors.Border
    val OutlineDark = PrimitiveColors.BorderDark

    // Primary action - warm dark (matching PC's --btn-bg-primary)
    val PrimaryAction = Color(0xFF2A2927)
    val OnPrimaryAction = PrimitiveColors.White
    val PrimaryActionHover = Color(0xFF3A3937)

    // Organic accent
    val Accent = PrimitiveColors.Accent
    val AccentLight = PrimitiveColors.AccentLight

    // Disabled
    val Disabled = PrimitiveColors.Disabled

    // Today highlight - vivid green for date number and task bars
    val TodayGreen = Color(0xFF5DAE4B)         // A brighter, more vivid green
    val TodayGreenLight = Color(0xFFE8F5E0)     // Light green background tint
    val TodayGreenMuted = Color(0xFF7BA06A)     // Matching PC's --success color for subtler use

    // Task indicator
    val TaskIndicator = PrimitiveColors.Accent

    // Course indicator colors - softened to match PC's organic feel
    val CourseIndicatorColors = listOf(
        Color(0xFFB06858), // Warm Terracotta (matches PC danger)
        Color(0xFF6B82A5), // Muted Blue (matches PC info)
        Color(0xFF7BA06A), // Sage Green (matches PC success)
        Color(0xFFB8943D), // Warm Gold (matches PC warning)
        Color(0xFF8A7D72), // Warm Taupe (matches PC accent)
        Color(0xFF9B7E6B), // Warm Brown
        Color(0xFF6B8A85), // Muted Teal
    )
}
