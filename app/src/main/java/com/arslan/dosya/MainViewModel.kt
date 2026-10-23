package com.arslan.dosya

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
    var query by mutableStateOf("")
    var section by mutableStateOf(Section.ALL)
    var sort by mutableStateOf(SortBy.DATE)
    var selected by mutableStateOf<Set<String>>(emptySet())
        private set

    private val tr: Locale = Locale.forLanguageTag("tr")

    fun refresh() {
        if (loading) return
        loading = true
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                try {
                    FileScanner.scan()
                } catch (_: Exception) {
                    emptyList()
                }
            }
            all = result
            val paths = result.map { it.path }.toSet()
            selected = selected.filter { it in paths }.toSet()
            loading = false
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

    fun toggle(path: String) {
        selected = if (path in selected) selected - path else selected + path
    }

    fun selectAll(list: List<DocFile>) {
        selected = list.map { it.path }.toSet()
    }

    fun clearSelection() {
        selected = emptySet()
    }

    suspend fun delete(list: List<DocFile>): Int {
        val gone = withContext(Dispatchers.IO) {
            FileActions.delete(getApplication<Application>(),list.map { it.path })
        }.toSet()
        all = all.filterNot { it.path in gone }
        selected = selected - gone
        return gone.size
    }
}
