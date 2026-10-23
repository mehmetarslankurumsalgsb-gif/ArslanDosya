package com.arslan.dosya

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

enum class FileKind { PDF, EXCEL, WORD, SLIDES, OTHER }

data class DocFile(
    val path: String,
    val name: String,
    val size: Long,
    val modified: Long,
    val kind: FileKind,
    val source: String,
)

object FileKinds {
    fun ext(name: String): String = name.substringAfterLast('.', "").lowercase()

    fun of(name: String): FileKind = when (ext(name)) {
        "pdf" -> FileKind.PDF
        "xls", "xlsx", "xlsm", "csv" -> FileKind.EXCEL
        "ppt", "pptx" -> FileKind.SLIDES
        "doc", "docx" -> FileKind.WORD
        else -> FileKind.OTHER
    }

    fun mime(name: String): String = when (ext(name)) {
        "pdf" -> "application/pdf"
        "xls" -> "application/vnd.ms-excel"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        "xlsm" -> "application/vnd.ms-excel.sheet.macroEnabled.12"
        "csv" -> "text/csv"
        "ppt" -> "application/vnd.ms-powerpoint"
        "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        "doc" -> "application/msword"
        "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        else -> "*/*"
    }

    fun extFromMime(mime: String?): String? = when (mime) {
        "application/pdf" -> "pdf"
        "application/vnd.ms-excel" -> "xls"
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -> "xlsx"
        "text/csv", "text/comma-separated-values" -> "csv"
        "application/vnd.ms-powerpoint" -> "ppt"
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" -> "pptx"
        "application/msword" -> "doc"
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> "docx"
        else -> null
    }
}

object Perm {
    fun has(ctx: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_EXTERNAL_STORAGE) ==
                PackageManager.PERMISSION_GRANTED
        }
}

object FileScanner {
    fun scan(): List<DocFile> {
        val root = Environment.getExternalStorageDirectory()
        val skip = setOf(
            File(root, "Android/data").absolutePath,
            File(root, "Android/obb").absolutePath,
        )
        val out = ArrayList<DocFile>()
        val stack = ArrayDeque<File>()
        stack.add(root)
        while (stack.isNotEmpty()) {
            val dir = stack.removeLast()
            val children = dir.listFiles() ?: continue
            for (f in children) {
                if (f.isDirectory) {
                    if (f.name.startsWith(".")) continue
                    if (f.absolutePath in skip) continue
                    stack.add(f)
                } else {
                    val kind = FileKinds.of(f.name)
                    if (kind != FileKind.OTHER && f.length() > 0) {
                        out.add(
                            DocFile(
                                path = f.absolutePath,
                                name = f.name,
                                size = f.length(),
                                modified = f.lastModified(),
                                kind = kind,
                                source = sourceLabel(f, root),
                            )
                        )
                    }
                }
            }
        }
        return out
    }

    private fun sourceLabel(f: File, root: File): String {
        val p = f.parentFile?.absolutePath ?: return ""
        return when {
            p.contains("com.whatsapp", true) || p.contains("/WhatsApp", true) -> "WhatsApp"
            p.contains("telegram", true) -> "Telegram"
            p.contains("/ArslanDosya", true) -> "Paylaşılanlar"
            p.endsWith("/Download", true) || p.contains("/Download/", true) -> "İndirilenler"
            p.endsWith("/Documents", true) || p.contains("/Documents/", true) -> "Belgeler"
            p == root.absolutePath -> "Ana klasör"
            else -> f.parentFile?.name ?: ""
        }
    }
}

object FileActions {
    fun uri(ctx: Context, f: File): Uri =
        FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)

    fun share(ctx: Context, files: List<DocFile>) {
        if (files.isEmpty()) return
        try {
            val uris = ArrayList(files.map { uri(ctx, File(it.path)) })
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
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            ctx.startActivity(Intent.createChooser(intent, "Paylaş"))
        } catch (_: Exception) {
        }
    }

    fun openExternal(ctx: Context, path: String, name: String): Boolean = try {
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri(ctx, File(path)), FileKinds.mime(name))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        ctx.startActivity(Intent.createChooser(intent, "Birlikte aç"))
        true
    } catch (_: Exception) {
        false
    }

    fun openViewer(ctx: Context, path: String, name: String) {
        ctx.startActivity(
            Intent(ctx, ViewerActivity::class.java)
                .putExtra(ViewerActivity.EXTRA_PATH, path)
                .putExtra(ViewerActivity.EXTRA_NAME, name)
        )
    }

    /** Silinen dosyaların yollarını döndürür. */
    fun delete(ctx: Context, paths: List<String>): List<String> {
        val gone = ArrayList<String>()
        for (p in paths) {
            val f = File(p)
            val ok = try {
                !f.exists() || f.delete()
            } catch (_: Exception) {
                false
            }
            if (ok) gone.add(p)
        }
        if (gone.isNotEmpty()) {
            MediaScannerConnection.scanFile(ctx, gone.toTypedArray(), null, null)
        }
        return gone
    }
}


/** Son açılan dosyalar (en yeni başta, en fazla 30) */
object Recent {
    private const val KEY = "son_acilanlar"
    private const val MAX = 30

    fun list(ctx: Context): List<String> {
        val raw = ctx.getSharedPreferences("arslan", Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]"
        return try {
            val arr = org.json.JSONArray(raw)
            List(arr.length()) { arr.optString(it) }.filter { it.isNotEmpty() }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun add(ctx: Context, path: String) {
        // Başka uygulamadan açılan geçici kopyalar listeye girmesin
        if (path.startsWith(ctx.cacheDir.absolutePath)) return
        val now = (listOf(path) + list(ctx).filter { it != path }).take(MAX)
        save(ctx, now)
    }

    fun replace(ctx: Context, old: String, new: String) {
        save(ctx, list(ctx).map { if (it == old) new else it })
    }

    fun remove(ctx: Context, paths: Set<String>) {
        save(ctx, list(ctx).filterNot { it in paths })
    }

    private fun save(ctx: Context, items: List<String>) {
        val arr = org.json.JSONArray()
        items.forEach { arr.put(it) }
        ctx.getSharedPreferences("arslan", Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply()
    }
}

/** Aynı içeriğe sahip (kopya) dosyaları bulur */
object Duplicates {
    data class Group(val files: List<DocFile>) {
        val size: Long get() = files.firstOrNull()?.size ?: 0
        val wasted: Long get() = size * (files.size - 1)
    }

    /** Dosyanın başından ve sonundan 64 KB + boyut: hızlı ve güvenilir parmak izi */
    private fun fingerprint(f: File): String? = try {
        val md = java.security.MessageDigest.getInstance("MD5")
        val len = f.length()
        java.io.RandomAccessFile(f, "r").use { raf ->
            val buf = ByteArray(65536)
            var n = raf.read(buf)
            if (n > 0) md.update(buf, 0, n)
            if (len > 131072) {
                raf.seek(len - 65536)
                n = raf.read(buf)
                if (n > 0) md.update(buf, 0, n)
            } else if (len > 65536) {
                n = raf.read(buf)
                if (n > 0) md.update(buf, 0, n)
            }
        }
        md.update(len.toString().toByteArray())
        md.digest().joinToString("") { "%02x".format(it) }
    } catch (_: Exception) {
        null
    }

    fun find(files: List<DocFile>): List<Group> {
        val out = ArrayList<Group>()
        files.filter { it.size > 0 }.groupBy { it.size }.values.filter { it.size > 1 }.forEach { sameSize ->
            sameSize.groupBy { fingerprint(File(it.path)) }.forEach { (key, g) ->
                if (key != null && g.size > 1) out.add(Group(g.sortedBy { it.modified }))
            }
        }
        return out.sortedByDescending { it.wasted }
    }
}
