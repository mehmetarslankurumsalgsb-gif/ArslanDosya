package com.arslan.dosya

import android.Manifest
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.FileObserver
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import android.provider.OpenableColumns
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.IntentCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class MainActivity : ComponentActivity() {

    private val vm: MainViewModel by viewModels()
    private val granted = mutableStateOf(false)

    private val legacyPermission =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            checkPermission()
        }

    // Uygulama öne/arkaya geçince (dosya görüntüleyici açılınca değil)
    private val appLifecycle = object : DefaultLifecycleObserver {
        override fun onStart(owner: LifecycleOwner) = vm.onForeground()
        override fun onStop(owner: LifecycleOwner) = vm.onBackground()
    }

    // Uygulama açıkken klasörlere yeni dosya gelirse listeyi yeniler
    private val observers = mutableListOf<FileObserver>()

    @Suppress("DEPRECATION")
    private fun startWatching() {
        stopWatching()
        if (!Perm.has(this)) return
        val root = Environment.getExternalStorageDirectory()
        listOf(
            "Download",
            "Download/ArslanDosya",
            "Download/Telegram",
            "Documents",
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents",
            "Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Business Documents",
            "WhatsApp/Media/WhatsApp Documents",
            "Telegram/Telegram Documents",
        ).map { File(root, it) }.filter { it.isDirectory }.forEach { dir ->
            val mask = FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO or
                FileObserver.MOVED_FROM or FileObserver.DELETE
            val o = object : FileObserver(dir.absolutePath, mask) {
                override fun onEvent(event: Int, path: String?) {
                    if (path != null && FileKinds.of(path) != FileKind.OTHER) {
                        runOnUiThread { vm.scheduleRefresh() }
                    }
                }
            }
            o.startWatching()
            observers.add(o)
        }
    }

    private fun stopWatching() {
        observers.forEach { it.stopWatching() }
        observers.clear()
    }

    override fun onStart() {
        super.onStart()
        startWatching()
    }

    override fun onStop() {
        super.onStop()
        stopWatching()
    }

    override fun onDestroy() {
        ProcessLifecycleOwner.get().lifecycle.removeObserver(appLifecycle)
        super.onDestroy()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        granted.value = Perm.has(this)
        ProcessLifecycleOwner.get().lifecycle.addObserver(appLifecycle)

        setContent {
            ArslanTheme {
                if (granted.value) MainScreen(vm) else PermissionScreen(onGrant = { askPermission() })
            }
        }
        if (savedInstanceState == null) handleIncoming(intent)
    }

    override fun onResume() {
        super.onResume()
        ShareApps.reset()
        vm.loadRecent()
        checkPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncoming(intent)
    }

    private fun checkPermission() {
        val now = Perm.has(this)
        if (now && !granted.value) {
            granted.value = true
            vm.refresh()
            startWatching()
        } else {
            granted.value = now
        }
    }

    private fun askPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                )
            } catch (_: Exception) {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        } else {
            legacyPermission.launch(
                arrayOf(
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                )
            )
        }
    }

    // ---- Başka uygulamalardan gelen dosyalar ----

    private fun handleIncoming(intent: Intent?) {
        if (intent == null) return
        when (intent.action) {
            Intent.ACTION_SEND ->
                IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
                    ?.let { importUris(listOf(it)) }

            Intent.ACTION_SEND_MULTIPLE ->
                IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
                    ?.let { importUris(it) }

            Intent.ACTION_VIEW -> intent.data?.let { openIncoming(it) }
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    private fun safeName(uri: Uri): String {
        var name: String? = null
        if (uri.scheme == "content") {
            name = try {
                contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                    ?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
            } catch (_: Exception) {
                null
            }
        }
        if (name.isNullOrBlank()) name = uri.lastPathSegment ?: "dosya"
        name = name.substringAfterLast('/').replace(Regex("[\\\\:*?\"<>|]"), "_")
        if (FileKinds.of(name) == FileKind.OTHER) {
            val ext = FileKinds.extFromMime(contentResolver.getType(uri))
            if (ext != null) name = "$name.$ext"
        }
        return name
    }

    private fun uniqueFile(dir: File, name: String): File {
        var f = File(dir, name)
        val base = name.substringBeforeLast('.')
        val ext = name.substringAfterLast('.', "")
        var i = 1
        while (f.exists()) {
            f = File(dir, if (ext.isEmpty()) "$base ($i)" else "$base ($i).$ext")
            i++
        }
        return f
    }

    private fun importUris(uris: List<Uri>) {
        if (!Perm.has(this)) {
            toast("Önce ArslanDosya'ya dosya erişim izni verin, sonra tekrar paylaşın.")
            return
        }
        lifecycleScope.launch {
            val count = withContext(Dispatchers.IO) {
                val dir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    "ArslanDosya"
                )
                dir.mkdirs()
                var c = 0
                for (u in uris) {
                    try {
                        val name = safeName(u)
                        if (FileKinds.of(name) == FileKind.OTHER) continue
                        val dest = uniqueFile(dir, name)
                        contentResolver.openInputStream(u)?.use { input ->
                            dest.outputStream().use { input.copyTo(it) }
                        } ?: continue
                        MediaScannerConnection.scanFile(this@MainActivity, arrayOf(dest.absolutePath), null, null)
                        c++
                    } catch (_: Exception) {
                    }
                }
                c
            }
            if (count == 0) {
                toast("Desteklenen dosya bulunamadı (PDF, Excel, PowerPoint).")
            } else {
                toast("$count dosya kaydedildi: İndirilenler › ArslanDosya")
                vm.refresh()
            }
        }
    }

    private fun openIncoming(uri: Uri) {
        lifecycleScope.launch {
            val file = withContext(Dispatchers.IO) {
                try {
                    val dir = File(cacheDir, "acilan").apply { mkdirs() }
                    val dest = File(dir, safeName(uri))
                    contentResolver.openInputStream(uri)?.use { input ->
                        dest.outputStream().use { input.copyTo(it) }
                    } ?: return@withContext null
                    dest
                } catch (_: Exception) {
                    null
                }
            }
            if (file == null) toast("Dosya açılamadı.")
            else FileActions.openViewer(this@MainActivity, file.absolutePath, file.name)
        }
    }
}
