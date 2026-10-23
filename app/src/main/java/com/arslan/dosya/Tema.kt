package com.arslan.dosya

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Slideshow
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

val Lacivert = Color(0xFF1E3A8A)

private val Acik = lightColorScheme(
    primary = Lacivert,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDE5FF),
    onPrimaryContainer = Color(0xFF0A1A4A),
    secondary = Color(0xFFF59E0B),
    onSecondary = Color.Black,
    tertiary = Lacivert,
    background = Color(0xFFF4F6FB),
    onBackground = Color(0xFF151A26),
    surface = Color.White,
    onSurface = Color(0xFF151A26),
    surfaceVariant = Color(0xFFE6E9F2),
    onSurfaceVariant = Color(0xFF5B6275),
    outlineVariant = Color(0xFFD5D9E3),
    error = Color(0xFFD32F2F),
    onError = Color.White,
)

private val Koyu = darkColorScheme(
    primary = Lacivert,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF233A73),
    onPrimaryContainer = Color(0xFFDDE5FF),
    secondary = Color(0xFFF59E0B),
    onSecondary = Color.Black,
    tertiary = Color(0xFF9DB2FF),
    background = Color(0xFF0F1320),
    onBackground = Color(0xFFE6E8EF),
    surface = Color(0xFF181D2B),
    onSurface = Color(0xFFE6E8EF),
    surfaceVariant = Color(0xFF242A3B),
    onSurfaceVariant = Color(0xFFAEB4C5),
    outlineVariant = Color(0xFF343B4F),
    error = Color(0xFFEF5350),
    onError = Color.White,
)

@Composable
fun ArslanTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Koyu else Acik, content = content)
}

fun kindColor(kind: FileKind): Color = when (kind) {
    FileKind.PDF -> Color(0xFFE53935)
    FileKind.EXCEL -> Color(0xFF1E8E3E)
    FileKind.SLIDES -> Color(0xFFF4511E)
    FileKind.OTHER -> Color(0xFF607D8B)
}

fun kindIcon(kind: FileKind): ImageVector = when (kind) {
    FileKind.PDF -> Icons.Filled.PictureAsPdf
    FileKind.EXCEL -> Icons.Filled.TableChart
    FileKind.SLIDES -> Icons.Filled.Slideshow
    FileKind.OTHER -> Icons.Filled.PictureAsPdf
}
