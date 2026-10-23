package com.arslan.dosya

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File

enum class ShareApp(val label: String, val packages: List<String>, val color: Color, val icon: ImageVector) {
    WHATSAPP("WhatsApp", listOf("com.whatsapp", "com.whatsapp.w4b"), Color(0xFF1FAF55), Icons.AutoMirrored.Filled.Chat),
    TELEGRAM(
        "Telegram",
        listOf("org.telegram.messenger", "org.telegram.messenger.web", "org.thunderdog.challegram"),
        Color(0xFF229ED9),
        Icons.AutoMirrored.Filled.Send
    ),
    GMAIL("Gmail", listOf("com.google.android.gm"), Color(0xFFE53935), Icons.Filled.Email),
}

object ShareApps {
    @Volatile
    private var cache: List<Pair<ShareApp, String>>? = null

    fun reset() {
        cache = null
    }

    fun installed(ctx: Context): List<Pair<ShareApp, String>> {
        cache?.let { return it }
        val pm = ctx.packageManager
        val found = ShareApp.entries.mapNotNull { app ->
            app.packages.firstOrNull { pm.getLaunchIntentForPackage(it) != null }?.let { app to it }
        }
        cache = found
        return found
    }

    fun send(ctx: Context, pkg: String, files: List<DocFile>) {
        if (files.isEmpty()) return
        try {
            val uris = ArrayList(files.map { FileActions.uri(ctx, File(it.path)) })
            val intent = if (uris.size == 1) {
                Intent(Intent.ACTION_SEND).apply {
                    type = FileKinds.mime(files[0].name)
                    putExtra(Intent.EXTRA_STREAM, uris[0])
                }
            } else {
                Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                    type = "*/*"
                    putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                }
            }
            intent.setPackage(pkg)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            ctx.startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(ctx, "Uygulama açılamadı.", Toast.LENGTH_LONG).show()
        }
    }
}

@Composable
fun rememberShareApps(): List<Pair<ShareApp, String>> {
    val ctx = LocalContext.current
    return remember { ShareApps.installed(ctx) }
}

/** Dosya satırının altındaki küçük renkli butonlar */
@Composable
fun ShareChips(apps: List<Pair<ShareApp, String>>, onClick: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        apps.forEach { (app, pkg) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(app.color.copy(alpha = 0.12f))
                    .clickable { onClick(pkg) }
                    .padding(horizontal = 9.dp, vertical = 5.dp)
            ) {
                Icon(app.icon, contentDescription = null, tint = app.color, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text(app.label, fontSize = 11.sp, color = app.color, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** Üst çubuk için yuvarlak renkli buton */
@Composable
fun ShareBarButton(app: ShareApp, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Box(
            Modifier
                .size(30.dp)
                .clip(CircleShape)
                .background(app.color),
            contentAlignment = Alignment.Center
        ) {
            Icon(app.icon, contentDescription = app.label, tint = Color.White, modifier = Modifier.size(17.dp))
        }
    }
}
