package com.arslan.dosya

import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * WhatsApp, Telegram, e-posta gibi başka bir uygulamadan "aç" denildiğinde çalışır.
 * Sadece görüntüler; geri tuşuna basınca doğrudan o uygulamaya dönülür.
 */
class DisaridanAcActivity : ComponentActivity() {

    private val opened = mutableStateOf<Pair<String, String>?>(null)   // yol, ad
    private val failed = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            ArslanTheme {
                val o = opened.value
                when {
                    o != null -> ViewerScreen(o.first, o.second, onBack = { finish() })
                    failed.value -> MessageView(
                        title = "Dosya açılamadı",
                        text = "Bu dosya okunamadı. Bozuk olabilir ya da uygulamanın izni yok.",
                        onExternal = { finish() }
                    )
                    else -> Column(
                        Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.background),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(12.dp))
                        Text("Açılıyor…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        val uri = intent?.data
        if (uri == null) {
            finish()
            return
        }
        lifecycleScope.launch {
            val file = withContext(Dispatchers.IO) { copyToCache(uri) }
            if (file == null) failed.value = true
            else opened.value = file.absolutePath to file.name
        }
    }

    /** Dosyayı uygulamanın geçici klasörüne kopyalar (eski geçici dosyaları da temizler). */
    private fun copyToCache(uri: Uri): File? = try {
        val dir = File(cacheDir, "acilan").apply { mkdirs() }
        val dayAgo = System.currentTimeMillis() - 24 * 3600 * 1000L
        dir.listFiles()?.forEach { if (it.lastModified() < dayAgo) it.delete() }

        if (uri.scheme == "file") {
            val f = File(uri.path ?: "")
            if (f.canRead()) f else null
        } else {
            val dest = File(dir, safeName(uri))
            contentResolver.openInputStream(uri)?.use { input ->
                dest.outputStream().use { input.copyTo(it) }
            } ?: throw IllegalStateException("okunamadı")
            dest
        }
    } catch (_: Exception) {
        null
    }

    private fun safeName(uri: Uri): String {
        var name: String? = try {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
        } catch (_: Exception) {
            null
        }
        if (name.isNullOrBlank()) name = uri.lastPathSegment ?: "dosya"
        name = name.substringAfterLast('/').replace(Regex("[\\\\:*?\"<>|]"), "_")
        if (FileKinds.of(name) == FileKind.OTHER) {
            val ext = FileKinds.extFromMime(contentResolver.getType(uri) ?: intent?.type)
            if (ext != null) name = "$name.$ext"
        }
        return name
    }
}
