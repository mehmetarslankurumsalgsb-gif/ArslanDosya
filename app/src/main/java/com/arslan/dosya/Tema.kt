package com.arslan.dosya

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
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
    primaryContainer = Color(0xFFEEF2FF),
    onPrimaryContainer = Color(0xFF0A1A4A),
    secondary = Color(0xFFF59E0B),
    onSecondary = Color.Black,
    tertiary = Lacivert,
    background = Color.White,
    onBackground = Color(0xFF111827),
    surface = Color.White,
    onSurface = Color(0xFF111827),
    surfaceVariant = Color(0xFFF3F4F6),
    onSurfaceVariant = Color(0xFF6B7280),
    outline = Color(0xFFD1D5DB),
    outlineVariant = Color(0xFFE5E7EB),
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
    outline = Color(0xFF4B5563),
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
    // Seçilen "Sade Beyaz" tasarım: telefon karanlık modda olsa da hep açık renk.
    // Çok büyük yazı ayarlarında düzen bozulmasın diye yazı büyütme 1,15 ile sınırlı.
    val d = androidx.compose.ui.platform.LocalDensity.current
    androidx.compose.runtime.CompositionLocalProvider(
        androidx.compose.ui.platform.LocalDensity provides androidx.compose.ui.unit.Density(d.density, minOf(d.fontScale, 1.15f))
    ) {
        MaterialTheme(colorScheme = Acik, content = content)
    }
}

@Suppress("unused")
private val koyuYedek = Koyu

fun kindColor(kind: FileKind): Color = when (kind) {
    FileKind.PDF -> Color(0xFFDC2626)
    FileKind.EXCEL -> Color(0xFF16A34A)
    FileKind.SLIDES -> Color(0xFFEA580C)
    FileKind.WORD -> Color(0xFF2B579A)
    FileKind.OTHER -> Color(0xFF607D8B)
}

fun kindIcon(kind: FileKind): ImageVector = when (kind) {
    FileKind.PDF -> Icons.Filled.PictureAsPdf
    FileKind.EXCEL -> Icons.Filled.TableChart
    FileKind.SLIDES -> Icons.Filled.Slideshow
    FileKind.WORD -> Icons.Filled.Description
    FileKind.OTHER -> Icons.Filled.PictureAsPdf
}

fun kindLabel(kind: FileKind): String = when (kind) {
    FileKind.PDF -> "PDF"
    FileKind.EXCEL -> "XLS"
    FileKind.WORD -> "DOC"
    FileKind.SLIDES -> "PPT"
    FileKind.OTHER -> "?"
}
