package com.arslan.dosya

import android.text.format.Formatter
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

private val trLocale: Locale = Locale.forLanguageTag("tr")
private val timeFmt = SimpleDateFormat("HH:mm", trLocale)
private val dayFmt = SimpleDateFormat("d MMM", trLocale)
private val fullFmt = SimpleDateFormat("d MMM yyyy", trLocale)

/** "Bugün 14:20", "Dün 09:05", "21 Eki", "3 Mar 2024" */
fun formatDate(ms: Long): String {
    val now = Calendar.getInstance()
    val c = Calendar.getInstance().apply { timeInMillis = ms }
    val sameYear = now.get(Calendar.YEAR) == c.get(Calendar.YEAR)
    val dayDiff = now.get(Calendar.DAY_OF_YEAR) - c.get(Calendar.DAY_OF_YEAR)
    return when {
        sameYear && dayDiff == 0 -> "Bugün " + timeFmt.format(Date(ms))
        sameYear && dayDiff == 1 -> "Dün " + timeFmt.format(Date(ms))
        sameYear -> dayFmt.format(Date(ms))
        else -> fullFmt.format(Date(ms))
    }
}

private val Line = Color(0xFFE5E7EB)
private val LineSoft = Color(0xFFF0F1F3)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(vm: MainViewModel) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val shareApps = rememberShareApps()
    var sortMenu by remember { mutableStateOf(false) }
    var renameTarget by remember { mutableStateOf<DocFile?>(null) }
    var snackJob by remember { mutableStateOf<Job?>(null) }
    var showDuplicates by remember { mutableStateOf(false) }

    val all = vm.all
    val filtered = remember(all, vm.query, vm.sort) { vm.filterAndSort(all, vm.query, vm.sort) }
    val section = vm.section
    val favs = vm.favorites
    val recent = vm.recent
    val visible = remember(filtered, section, favs, recent) {
        when {
            section.recent -> {
                val byPath = filtered.associateBy { it.path }
                recent.mapNotNull { byPath[it] }
            }
            section.fav -> filtered.filter { it.path in favs }
            section.kind == null -> filtered
            else -> filtered.filter { it.kind == section.kind }
        }
    }
    val selectionMode = vm.selected.isNotEmpty()

    BackHandler(enabled = selectionMode) { vm.clearSelection() }

    LaunchedEffect(vm.scrollTop) {
        if (vm.scrollTop > 0) listState.animateScrollToItem(0)
    }

    fun toast(msg: String) {
        scope.launch {
            snackbar.currentSnackbarData?.dismiss()
            snackbar.showSnackbar(msg, duration = SnackbarDuration.Short)
        }
    }

    // Hemen sil + 3 saniye "Geri al"
    fun deleteNow(list: List<DocFile>) {
        if (list.isEmpty()) return
        vm.deleteWithUndo(list)
        snackJob?.cancel()
        snackJob = scope.launch {
            snackbar.currentSnackbarData?.dismiss()
            val timer = launch {
                delay(3000)
                snackbar.currentSnackbarData?.dismiss()
            }
            val msg = if (list.size == 1) "\"${list[0].name}\" silindi" else "${list.size} dosya silindi"
            val result = snackbar.showSnackbar(msg, actionLabel = "GERİ AL", duration = SnackbarDuration.Indefinite)
            timer.cancel()
            if (result == SnackbarResult.ActionPerformed) vm.undo() else vm.commitPending()
        }
    }

    if (showDuplicates) {
        DuplicatesScreen(
            vm = vm,
            onBack = { showDuplicates = false; vm.closeDuplicates() },
            onDelete = { list ->
                showDuplicates = false
                vm.closeDuplicates()
                deleteNow(list)
            }
        )
        return
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = {
            SnackbarHost(snackbar) { data ->
                Snackbar(
                    snackbarData = data,
                    shape = RoundedCornerShape(14.dp),
                    containerColor = Color(0xFF1F2937),
                    contentColor = Color.White,
                    actionColor = MaterialTheme.colorScheme.secondary
                )
            }
        },
        topBar = {
            if (selectionMode) {
                val chosen = all.filter { it.path in vm.selected }
                val allFav = chosen.isNotEmpty() && chosen.all { it.path in favs }
                Column {
                    TopAppBar(
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                        navigationIcon = {
                            IconButton(onClick = { vm.clearSelection() }) {
                                Icon(Icons.Filled.Close, contentDescription = "Seçimi kapat")
                            }
                        },
                        title = { Text("${vm.selected.size} seçildi", fontWeight = FontWeight.SemiBold, fontSize = 18.sp) },
                        actions = {
                            IconButton(onClick = { vm.selectAll(visible) }) {
                                Icon(Icons.Filled.SelectAll, contentDescription = "Tümünü seç")
                            }
                            IconButton(onClick = {
                                val added = vm.toggleFavorites(chosen)
                                vm.clearSelection()
                                toast(if (added) "${chosen.size} dosya favorilere eklendi" else "${chosen.size} dosya favorilerden çıkarıldı")
                            }) {
                                Icon(
                                    if (allFav) Icons.Filled.Star else Icons.Filled.StarBorder,
                                    contentDescription = if (allFav) "Favorilerden çıkar" else "Favorilere ekle",
                                    tint = if (allFav) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurface
                                )
                            }
                            IconButton(onClick = { FileActions.share(ctx, chosen) }) {
                                Icon(Icons.Filled.Share, contentDescription = "Paylaş")
                            }
                            IconButton(onClick = { deleteNow(chosen) }) {
                                Icon(Icons.Filled.Delete, contentDescription = "Sil", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    )
                    HorizontalDivider(color = Line)
                }
            } else {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(start = 16.dp, end = 16.dp, top = 12.dp)
                ) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("Dosyalarım", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.3).sp)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            if (vm.loading) "taranıyor…" else "${all.size} belge",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(bottom = 3.dp)
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        LabeledButton(Icons.Filled.History, "Son açılan", section.recent) {
                            vm.section = if (section.recent) Section.ALL else Section.RECENT
                        }
                        LabeledButton(Icons.Filled.Star, "Favoriler", section.fav, activeTint = MaterialTheme.colorScheme.secondary) {
                            vm.section = if (section.fav) Section.ALL else Section.FAV
                        }
                        LabeledButton(Icons.Filled.CleaningServices, "Kopyalar", false) {
                            showDuplicates = true
                            vm.findDuplicates()
                        }
                        Box {
                            LabeledButton(Icons.Filled.SwapVert, "Sırala", false) { sortMenu = true }
                            DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                                SortBy.entries.forEach { s ->
                                    DropdownMenuItem(
                                        text = { Text(s.label) },
                                        onClick = { vm.sort = s; sortMenu = false },
                                        trailingIcon = { if (vm.sort == s) Icon(Icons.Filled.Check, contentDescription = null) }
                                    )
                                }
                            }
                        }
                        LabeledButton(Icons.Filled.Refresh, "Yenile", false) { vm.refresh(user = true) }
                    }
                }
            }
        }
    ) { pad ->
        Column(
            Modifier
                .padding(pad)
                .fillMaxSize()
        ) {
            // Arama kutusu (gri, kenarlıksız)
            SearchField(
                value = vm.query,
                onChange = { vm.query = it },
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 6.dp)
            )

            // Tür sekmeleri: tek ekrana sığar, kaydırma yok
            val tabs = listOf(Section.ALL, Section.PDF, Section.EXCEL, Section.WORD, Section.SLIDES)
            val tabIndex = tabs.indexOf(section)
            TabRow(
                selectedTabIndex = if (tabIndex >= 0) tabIndex else 0,
                containerColor = MaterialTheme.colorScheme.background,
                contentColor = MaterialTheme.colorScheme.primary,
                divider = { HorizontalDivider(color = Line) },
                indicator = { positions ->
                    if (tabIndex >= 0 && tabIndex < positions.size) {
                        TabRowDefaults.PrimaryIndicator(
                            modifier = with(TabRowDefaults) { Modifier.tabIndicatorOffset(positions[tabIndex]) },
                            width = 32.dp,
                            height = 3.dp,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            ) {
                tabs.forEach { s ->
                    val count = if (s.kind == null) filtered.size else filtered.count { it.kind == s.kind }
                    val on = section == s
                    Tab(
                        selected = on,
                        onClick = { vm.section = s },
                        selectedContentColor = MaterialTheme.colorScheme.primary,
                        unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.height(54.dp)
                    ) {
                        Text(s.label, fontSize = 13.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Medium, maxLines = 1, softWrap = false)
                        Text("$count", fontSize = 11.sp, maxLines = 1, softWrap = false,
                            color = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            // Son açılanlar / Favoriler seçiliyken bilgi şeridi
            if (section.recent || section.fav) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .padding(start = 16.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(if (section.fav) Icons.Filled.Star else Icons.Filled.History, contentDescription = null,
                        tint = if (section.fav) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (section.fav) "Favoriler (${visible.size})" else "Son açılanlar (${visible.size})",
                        fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    TextButton(onClick = { vm.section = Section.ALL }) { Text("Tümüne dön") }
                }
            }

            if (vm.loading && !vm.userRefreshing && all.isNotEmpty()) {
                LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp))
            }

            PullToRefreshBox(
                isRefreshing = vm.userRefreshing,
                onRefresh = { vm.refresh(user = true) },
                modifier = Modifier.fillMaxSize()
            ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 24.dp)
                ) {
                    when {
                        vm.loading && all.isEmpty() -> item {
                            CenterMessage(
                                loading = true,
                                title = "Dosyalar taranıyor…",
                                text = "Bu ilk seferde biraz sürebilir.",
                                modifier = Modifier.fillParentMaxSize()
                            )
                        }

                        visible.isEmpty() -> item {
                            CenterMessage(
                                loading = false,
                                title = if (section.recent) "Henüz açılan dosya yok" else if (section.fav) "Henüz favori yok" else "Dosya bulunamadı",
                                text = when {
                                    vm.query.isNotBlank() -> "\"${vm.query}\" aramasına uygun dosya yok."
                                    section.fav -> "Bir dosyaya basılı tutup ☆ butonuna dokunun."
                                    section.recent -> "Açtığınız dosyalar burada listelenir."
                                    else -> "Bu bölümde gösterilecek dosya yok."
                                },
                                modifier = Modifier.fillParentMaxSize()
                            )
                        }

                        else -> items(visible, key = { it.path }) { d ->
                            FileRow(
                                d = d,
                                isNew = vm.isNew(d),
                                isFav = d.path in favs,
                                onToggleFav = {
                                    val added = vm.toggleFavorites(listOf(d))
                                    toast(if (added) "Favorilere eklendi" else "Favorilerden çıkarıldı")
                                },
                                selected = d.path in vm.selected,
                                selectionMode = selectionMode,
                                shareApps = shareApps,
                                onClick = {
                                    if (selectionMode) vm.toggle(d.path)
                                    else FileActions.openViewer(ctx, d.path, d.name)
                                },
                                onLongClick = { vm.toggle(d.path) },
                                onOpenWith = { FileActions.openExternal(ctx, d.path, d.name) },
                                onShare = { FileActions.share(ctx, listOf(d)) },
                                onShareTo = { pkg -> ShareApps.send(ctx, pkg, listOf(d)) },
                                onRename = { renameTarget = d },
                                onDelete = { deleteNow(listOf(d)) },
                                modifier = Modifier.animateItem()
                            )
                        }
                    }
                }
            }
        }
    }

    renameTarget?.let { d ->
        RenameDialog(
            d = d,
            onDismiss = { renameTarget = null },
            onConfirm = { newBase, setError ->
                scope.launch {
                    val err = vm.rename(d, newBase)
                    if (err == null) {
                        renameTarget = null
                        toast("Ad değiştirildi")
                    } else {
                        setError(err)
                    }
                }
            }
        )
    }
}

/** Simge + altında küçük ad (üstteki buton şeridi) */
@Composable
fun LabeledButton(icon: ImageVector, label: String, active: Boolean, activeTint: Color = Color.Unspecified, onClick: () -> Unit) {
    val tint = if (active) (if (activeTint != Color.Unspecified) activeTint else MaterialTheme.colorScheme.primary) else MaterialTheme.colorScheme.onSurface
    Column(
        Modifier
            .width(64.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(if (active) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(21.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(
            label,
            fontSize = 11.sp,
            maxLines = 1,
            softWrap = false,
            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
            color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun RoundIconButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    OutlinedIconButton(
        onClick = onClick,
        modifier = Modifier.size(44.dp),
        border = BorderStroke(1.dp, Line),
        colors = IconButtonDefaults.outlinedIconButtonColors(contentColor = MaterialTheme.colorScheme.onSurface)
    ) {
        Icon(icon, contentDescription = label, modifier = Modifier.size(20.dp))
    }
}

@Composable
fun SearchField(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String = "Ara") {
    Row(
        modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(start = 14.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp)
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = TextStyle(fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (value.isNotEmpty()) {
            IconButton(onClick = { onChange("") }) {
                Icon(Icons.Filled.Close, contentDescription = "Temizle", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Dosya türü rozeti: renkli yuvarlak kare + kısa ad */
@Composable
fun KindBadge(kind: FileKind, selected: Boolean) {
    Box(
        Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) MaterialTheme.colorScheme.primary else kindColor(kind)),
        contentAlignment = Alignment.Center
    ) {
        if (selected) Icon(Icons.Filled.Check, contentDescription = "Seçili", tint = Color.White, modifier = Modifier.size(24.dp))
        else Text(kindLabel(kind), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
fun RenameDialog(d: DocFile, onDismiss: () -> Unit, onConfirm: (String, (String) -> Unit) -> Unit) {
    val ext = FileKinds.ext(d.name)
    var text by remember { mutableStateOf(if (ext.isEmpty()) d.name else d.name.dropLast(ext.length + 1)) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        icon = { Icon(Icons.Filled.Edit, contentDescription = null) },
        title = { Text("Yeniden adlandır") },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it; error = null },
                singleLine = true,
                label = { Text("Yeni ad") },
                suffix = { if (ext.isNotEmpty()) Text(".$ext") },
                isError = error != null,
                supportingText = { error?.let { Text(it) } },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            Button(onClick = { onConfirm(text) { error = it } }) { Text("Kaydet") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Vazgeç") }
        }
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileRow(
    d: DocFile,
    isNew: Boolean,
    isFav: Boolean,
    onToggleFav: () -> Unit,
    selected: Boolean,
    selectionMode: Boolean,
    shareApps: List<Pair<ShareApp, String>>,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onOpenWith: () -> Unit,
    onShare: () -> Unit,
    onShareTo: (String) -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val ctx = LocalContext.current
    var menu by remember { mutableStateOf(false) }

    Column(
        modifier
            .fillMaxWidth()
            .background(if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.background)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
    ) {
        Row(
            Modifier.padding(start = 16.dp, top = 12.dp, bottom = if (!selectionMode && shareApps.isNotEmpty()) 2.dp else 12.dp, end = 0.dp),
            verticalAlignment = Alignment.Top
        ) {
            Box(Modifier.padding(top = 2.dp)) { KindBadge(d.kind, selected) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        d.name,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (isFav) {
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.Filled.Star, contentDescription = "Favori", tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(16.dp))
                    }
                    if (isNew) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            "YENİ",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF7A4A00),
                            modifier = Modifier
                                .background(Color(0xFFFFE8B3), RoundedCornerShape(6.dp))
                                .padding(horizontal = 6.dp, vertical = 1.dp)
                        )
                    }
                }
                Spacer(Modifier.height(3.dp))
                val meta = listOf(d.source, Formatter.formatShortFileSize(ctx, d.size), formatDate(d.modified)).filter { it.isNotEmpty() }
                Text(
                    meta.joinToString("  ·  "),
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            if (!selectionMode) {
                IconButton(onClick = onDelete, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.Filled.DeleteOutline, contentDescription = "Sil", tint = Color(0xFF9CA3AF))
                }
                Box {
                    IconButton(onClick = { menu = true }, modifier = Modifier.size(44.dp)) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "Seçenekler", tint = Color(0xFF6B7280))
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(
                            text = { Text("Aç") },
                            leadingIcon = { Icon(Icons.Filled.Visibility, contentDescription = null) },
                            onClick = { menu = false; onClick() }
                        )
                        DropdownMenuItem(
                            text = { Text(if (isFav) "Favorilerden çıkar" else "Favorilere ekle") },
                            leadingIcon = {
                                Icon(if (isFav) Icons.Filled.Star else Icons.Filled.StarBorder, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                            },
                            onClick = { menu = false; onToggleFav() }
                        )
                        DropdownMenuItem(
                            text = { Text("Yeniden adlandır") },
                            leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
                            onClick = { menu = false; onRename() }
                        )
                        DropdownMenuItem(
                            text = { Text("Başka uygulamada aç") },
                            leadingIcon = { Icon(Icons.Filled.OpenInNew, contentDescription = null) },
                            onClick = { menu = false; onOpenWith() }
                        )
                        DropdownMenuItem(
                            text = { Text("Diğer paylaşım seçenekleri") },
                            leadingIcon = { Icon(Icons.Filled.Share, contentDescription = null) },
                            onClick = { menu = false; onShare() }
                        )
                        DropdownMenuItem(
                            text = { Text("Seç") },
                            leadingIcon = { Icon(Icons.Filled.CheckCircle, contentDescription = null) },
                            onClick = { menu = false; onLongClick() }
                        )
                        HorizontalDivider(color = Line)
                        DropdownMenuItem(
                            text = { Text("Sil", color = MaterialTheme.colorScheme.error) },
                            leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                            onClick = { menu = false; onDelete() }
                        )
                    }
                }
            }
        }
        if (!selectionMode && shareApps.isNotEmpty()) {
            Box(Modifier.padding(start = 66.dp, end = 12.dp, bottom = 8.dp)) {
                ShareLinks(shareApps, onShareTo)
            }
        }
        HorizontalDivider(color = LineSoft, modifier = Modifier.padding(start = 72.dp))
    }
}

/** Sade metin bağlantıları: gerçek uygulama ikonu + ad */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ShareLinks(apps: List<Pair<ShareApp, String>>, onClick: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        apps.forEach { (app, pkg) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(app.color.copy(alpha = 0.08f))
                    .clickable { onClick(pkg) }
                    .padding(start = 6.dp, end = 10.dp, top = 5.dp, bottom = 5.dp)
            ) {
                AppIcon(app, pkg, 18.dp, app.color)
                Spacer(Modifier.width(5.dp))
                Text(app.label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = app.textColor, maxLines = 1, softWrap = false)
            }
        }
    }
}

@Composable
fun CenterMessage(loading: Boolean, title: String, text: String, modifier: Modifier = Modifier) {
    Column(
        modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (loading) {
            CircularProgressIndicator()
        } else {
            Box(
                Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Filled.Description, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(34.dp))
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
fun PermissionScreen(onGrant: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Filled.FolderOpen, contentDescription = null, tint = Color.White, modifier = Modifier.size(48.dp))
        }
        Spacer(Modifier.height(24.dp))
        Text(
            "ArslanDosya'ya Hoş Geldiniz",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(12.dp))
        Text(
            "Telefonunuzdaki tüm PDF, Excel, Word ve PowerPoint dosyalarını tek yerde gösterebilmem için " +
                "\"Tüm dosyalara erişim\" iznini açmanız gerekiyor.\n\nAçılan ekranda ArslanDosya'nın yanındaki düğmeyi açıp geri dönün.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(28.dp))
        Button(
            onClick = onGrant,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {
            Text("İzin ver", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
