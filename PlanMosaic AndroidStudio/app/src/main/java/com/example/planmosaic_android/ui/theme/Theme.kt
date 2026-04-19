package com.example.planmosaic_android.ui.theme


import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Light color scheme - warm organic palette matching PC version
private val LightColorScheme = lightColorScheme(
    background = AppColors.Background,           // #F9F8F6 warm paper
    onBackground = AppColors.OnBackground,       // #1A1918 hero ink
    surface = AppColors.Surface,                 // #FFFFFF
    onSurface = AppColors.OnSurface,             // #3E3C38 primary ink
    surfaceVariant = AppColors.SurfaceVariant,   // #F3F1EC surface hover
    onSurfaceVariant = AppColors.OnSurfaceVariant, // #8A8780 secondary ink
    outline = AppColors.Outline,                 // #E8E6E0 subtle border
    outlineVariant = AppColors.OutlineDark,      // #D0CEC7 darker border
    primary = AppColors.PrimaryAction,           // #2A2927 warm dark button
    onPrimary = AppColors.OnPrimaryAction,       // #FFFFFF
    primaryContainer = AppColors.SurfaceVariant, // Light container
    onPrimaryContainer = AppColors.OnBackground, // Dark text on container
    secondary = AppColors.Accent,                // #8A7D72 organic accent
    onSecondary = Color.White,
    secondaryContainer = AppColors.AccentLight,  // #C4BDB5
    onSecondaryContainer = AppColors.OnSurface,
    tertiary = AppColors.TodayGreen,             // #5DAE4B today green
    onTertiary = Color.White,
    error = PrimitiveColors.Danger,              // #B06858
    onError = Color.White,
)

// Dark color scheme - warm dark mode matching PC aesthetic
private val DarkColorScheme = darkColorScheme(
    background = Color(0xFF1A1918),
    onBackground = Color(0xFFF3F1EC),
    surface = Color(0xFF2A2927),
    onSurface = Color(0xFFEAE8E2),
    surfaceVariant = Color(0xFF3A3937),
    onSurfaceVariant = Color(0xFFC4BDB5),
    outline = Color(0xFF4A4845),
    outlineVariant = Color(0xFF5A5855),
    primary = Color(0xFFC4BDB5),
    onPrimary = Color(0xFF1A1918),
    primaryContainer = Color(0xFF3A3937),
    onPrimaryContainer = Color(0xFFF3F1EC),
    secondary = Color(0xFF8A7D72),
    onSecondary = Color(0xFF1A1918),
    tertiary = Color(0xFF7BA06A),
    onTertiary = Color(0xFF1A1918),
    error = Color(0xFFD47868),
    onError = Color(0xFF1A1918),
)

@Immutable
data class ExtendedColors(
    val courseColors: List<Color> = AppColors.CourseIndicatorColors,
    val taskIndicator: Color = AppColors.TaskIndicator,
    val todayGreen: Color = AppColors.TodayGreen,
    val todayGreenLight: Color = AppColors.TodayGreenLight,
    val todayGreenMuted: Color = AppColors.TodayGreenMuted,
    val divider: Color = AppColors.Outline,
    val surfaceHover: Color = AppColors.SurfaceVariant,
    val surfaceActive: Color = AppColors.SurfaceActive,
    val accent: Color = AppColors.Accent,
    val accentLight: Color = AppColors.AccentLight,
    val success: Color = PrimitiveColors.Success,
    val warning: Color = PrimitiveColors.Warning,
    val danger: Color = PrimitiveColors.Danger,
)

val LocalExtendedColors = staticCompositionLocalOf { ExtendedColors() }

@Composable
fun PlanMosaicTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    CompositionLocalProvider(
        LocalExtendedColors provides ExtendedColors()
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}

object AppTheme {
    val extendedColors: ExtendedColors
        @Composable
        get() = LocalExtendedColors.current
}

/**
 * Theme state holder for app-wide dark mode control.
 * Managed in MainActivity, consumed by ProfileScreen for toggle.
 */
data class ThemeState(
    val preference: String = "system",   // "light", "dark", "system"
    val isDarkTheme: Boolean = false,
    val onToggleDarkMode: () -> Unit = {}
)

val LocalThemeState = compositionLocalOf { ThemeState() }
