package com.arslan.dosya

import android.app.Application
import android.content.Context
import android.media.MediaScannerConnection
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.Collator
import java.util.Locale

enum class Section(val label: String, val kind: FileKind?) {
    ALL("Tümü", null),
    PDF("PDF", FileKind.PDF),
    EXCEL("Excel", FileKind.EXCEL),
    SLIDES("Sunum", FileKind.SLIDES),
}

enum class SortBy(val label: String) {
    DATE("En yeni önce"),
    NAME("Ada göre (A-Z)"),
    SIZE("Boyuta göre (büyük önce)"),
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    var all by mutableStateOf<List<DocFile>>(emptyList())
        private set
    var loading by mutableStateOf(false)
        private set
    var userRefreshing by mutableStateOf(false)
        private set
    var query by mutableStateOf("")
    var section by mutableStateOf(Section.ALL)
    var sort by mutableStateOf(SortBy.DATE)
    var selected by mutableStateOf<Set<String>>(emptySet())
        private set

    /** Bu zamandan sonra değişen dosyalar "YENİ" etiketi alır. 0 = etiket yok. */
    var newSince by mutableLongStateOf(0L)
        private set

    /** Her artışta liste en başa kayar. */
    var scrollTop by mutableIntStateOf(0)
        private set

    private var pending: List<DocFile> = emptyList()
    private var again = false
    private var debounce: Job? = null
    private val prefs = app.getSharedPreferences("arslan", Context.MODE_PRIVATE)
    private val tr: Locale = Locale.forLanguageTag("tr")

    // ---- Uygulama öne / arkaya geçince ----

    fun onForeground() {
        val last = prefs.getLong("sonGorulme", 0L)
        if (last == 0L) prefs.edit().putLong("sonGorulme", System.currentTimeMillis()).apply()
        newSince = last
        refresh()
    }

    fun onBackground() {
        commitPending()
        prefs.edit().putLong("sonGorulme", System.currentTimeMillis()).apply()
    }

    fun isNew(d: DocFile): Boolean = newSince > 0 && d.modified > newSince

    // ---- Yenileme ----

    fun refresh(user: Boolean = false) {
        if (user) {
            userRefreshing = true
            scrollTop++
        }
        if (loading) return
        if (!Perm.has(getApplication<Application>())) {
            userRefreshing = false
            return
        }
        loading = true
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                try {
                    FileScanner.scan()
                } catch (_: Exception) {
                    null
                }
            }
            if (result != null) {
                val hidden = pending.map { it.path }.toSet()
                all = result.filterNot { it.path in hidden }
                val paths = all.map { it.path }.toSet()
                selected = selected.filter { it in paths }.toSet()
            }
            loading = false
            if (userRefreshing) {
                userRefreshing = false
                scrollTop++
            }
            if (again) {
                again = false
                refresh()
            }
        }
    }

    /** Klasörlerde değişiklik olunca, kısa bir beklemeden sonra yeniler. */
    fun scheduleRefresh() {
        debounce?.cancel()
        debounce = viewModelScope.launch {
            delay(1500)
            if (loading) again = true else refresh()
        }
    }

    fun filterAndSort(list: List<DocFile>, q: String, s: SortBy): List<DocFile> {
        val needle = q.trim().lowercase(tr)
        val f = if (needle.isEmpty()) list else list.filter { it.name.lowercase(tr).contains(needle) }
        return when (s) {
            SortBy.DATE -> f.sortedByDescending { it.modified }
            SortBy.SIZE -> f.sortedByDescending { it.size }
            SortBy.NAME -> {
                val c = Collator.getInstance(tr)
                f.sortedWith { a, b -> c.compare(a.name, b.name) }
            }
        }
    }

    // ---- Seçim ----

    fun toggle(path: String) {
        selected = if (path in selected) selected - path else selected + path
    }

    fun selectAll(list: List<DocFile>) {
        selected = list.map { it.path }.toSet()
    }

    fun clearSelection() {
        selected = emptySet()
    }

    // ---- Geri alınabilir silme ----

    /** Dosyaları listeden hemen kaldırır; gerçek silme commitPending() ile olur. */
    fun deleteWithUndo(list: List<DocFile>) {
        commitPending()
        val paths = list.map { it.path }.toSet()
        pending = list
        all = all.filterNot { it.path in paths }
        selected = selected - paths
    }

    fun undo() {
        val back = pending
        pending = emptyList()
        val have = all.map { it.path }.toSet()
        all = all + back.filterNot { it.path in have }
    }

    fun commitPending() {
        val list = pending
        if (list.isEmpty()) return
        pending = emptyList()
        val ctx = getApplication<Application>()
        Thread { FileActions.delete(ctx, list.map { it.path }) }.start()
    }

    override fun onCleared() {
        commitPending()
    }

    // ---- Yeniden adlandırma ----

    /** Hata varsa mesajını, başarılıysa null döndürür. */
    suspend fun rename(d: DocFile, newBase: String): String? {
        val base = newBase.trim()
        if (base.isEmpty()) return "Dosya adı boş olamaz."
        if (base.any { it in "/\\:*?\"<>|" }) return "Ad şu işaretleri içeremez: / \\ : * ? \" < > |"
        val ext = FileKinds.ext(d.name)
        val newName = if (ext.isEmpty()) base else "$base.$ext"
        if (newName == d.name) return null
        val src = File(d.path)
        val dst = File(src.parentFile, newName)
        if (dst.exists()) return "Bu klasörde aynı adla bir dosya zaten var."
        val ok = withContext(Dispatchers.IO) {
            try {
                src.renameTo(dst)
            } catch (_: Exception) {
                false
            }
        }
        if (!ok) return "Ad değiştirilemedi."
        MediaScannerConnection.scanFile(getApplication<Application>(), arrayOf(src.absolutePath, dst.absolutePath), null, null)
        all = all.map { if (it.path == d.path) it.copy(path = dst.absolutePath, name = newName) else it }
        if (d.path in selected) selected = selected - d.path + dst.absolutePath
        return null
    }
}
