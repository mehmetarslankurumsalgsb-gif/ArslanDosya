package com.arslan.dosya

import android.text.format.Formatter
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val dateFmt = SimpleDateFormat("d MMM yyyy, HH:mm", Locale.forLanguageTag("tr"))
fun formatDate(ms: Long): String = dateFmt.format(Date(ms))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(vm: MainViewModel) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    var confirmDelete by remember { mutableStateOf<List<DocFile>?>(null) }
    var sortMenu by remember { mutableStateOf(false) }

    val all = vm.all
    val filtered = remember(all, vm.query, vm.sort) { vm.filterAndSort(all, vm.query, vm.sort) }
    val section = vm.section
    val visible = remember(filtered, section) {
        if (section.kind == null) filtered else filtered.filter { it.kind == section.kind }
    }
    val selectionMode = vm.selected.isNotEmpty()

    BackHandler(enabled = selectionMode) { vm.clearSelection() }

    val barColors = TopAppBarDefaults.topAppBarColors(
        containerColor = MaterialTheme.colorScheme.primary,
        titleContentColor = MaterialTheme.colorScheme.onPrimary,
        actionIconContentColor = MaterialTheme.colorScheme.onPrimary,
        navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
    )

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            if (selectionMode) {
                TopAppBar(
                    colors = barColors,
                    navigationIcon = {
                        IconButton(onClick = { vm.clearSelection() }) {
                            Icon(Icons.Filled.Close, contentDescription = "Seçimi kapat")
                        }
                    },
                    title = { Text("${vm.selected.size} seçildi", fontWeight = FontWeight.SemiBold) },
                    actions = {
                        IconButton(onClick = { vm.selectAll(visible) }) {
                            Icon(Icons.Filled.SelectAll, contentDescription = "Tümünü seç")
                        }
                        IconButton(onClick = {
                            FileActions.share(ctx, all.filter { it.path in vm.selected })
                        }) {
                            Icon(Icons.Filled.Share, contentDescription = "Paylaş")
                        }
                        IconButton(onClick = {
                            confirmDelete = all.filter { it.path in vm.selected }
                        }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Sil")
                        }
                    }
                )
            } else {
                TopAppBar(
                    colors = barColors,
                    title = {
                        Column {
                            Text("ArslanDosya", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                            Text(
                                if (vm.loading) "Taranıyor…" else "${all.size} belge",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f)
                            )
                        }
                    },
                    actions = {
                        IconButton(onClick = { vm.refresh() }) {
                            Icon(Icons.Filled.Refresh, contentDescription = "Yenile")
                        }
                        Box {
                            IconButton(onClick = { sortMenu = true }) {
                                Icon(Icons.Filled.SwapVert, contentDescription = "Sırala")
                            }
                            DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                                SortBy.entries.forEach { s ->
                                    DropdownMenuItem(
                                        text = { Text(s.label) },
                                        onClick = { vm.sort = s; sortMenu = false },
                                        trailingIcon = {
                                            if (vm.sort == s) Icon(Icons.Filled.Check, contentDescription = null)
                                        }
                                    )
                                }
                            }
                        }
                    }
                )
            }
        }
    ) { pad ->
        Column(
            Modifier
                .padding(pad)
                .fillMaxSize()
        ) {
            // Arama kutusu
            OutlinedTextField(
                value = vm.query,
                onValueChange = { vm.query = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                placeholder = { Text("Dosya ara…") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = {
                    if (vm.query.isNotEmpty()) {
                        IconButton(onClick = { vm.query = "" }) {
                            Icon(Icons.Filled.Close, contentDescription = "Temizle")
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(28.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                )
            )

            // Sekmeler
            TabRow(
                selectedTabIndex = section.ordinal,
                containerColor = MaterialTheme.colorScheme.background,
                contentColor = MaterialTheme.colorScheme.tertiary,
            ) {
                Section.entries.forEach { s ->
                    val count = if (s.kind == null) filtered.size else filtered.count { it.kind == s.kind }
                    Tab(
                        selected = section == s,
                        onClick = { vm.section = s },
                        text = {
                            Text(
                                "${s.label} ($count)",
                                maxLines = 1,
                                fontSize = 13.sp,
                                fontWeight = if (section == s) FontWeight.Bold else FontWeight.Normal
                            )
                        },
                        unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (vm.loading && all.isNotEmpty()) {
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }

            when {
                vm.loading && all.isEmpty() -> CenterMessage(loading = true, title = "Dosyalar taranıyor…", text = "Bu ilk seferde biraz sürebilir.")
                visible.isEmpty() -> CenterMessage(
                    loading = false,
                    title = "Dosya bulunamadı",
                    text = if (vm.query.isNotBlank()) "\"${vm.query}\" aramasına uygun dosya yok."
                    else "Bu bölümde gösterilecek dosya yok."
                )

                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)
                ) {
                    items(visible, key = { it.path }) { d ->
                        FileRow(
                            d = d,
                            selected = d.path in vm.selected,
                            selectionMode = selectionMode,
                            onClick = {
                                if (selectionMode) vm.toggle(d.path)
                                else FileActions.openViewer(ctx, d.path, d.name)
                            },
                            onLongClick = { vm.toggle(d.path) },
                            onOpenWith = { FileActions.openExternal(ctx, d.path, d.name) },
                            onShare = { FileActions.share(ctx, listOf(d)) },
                            onDelete = { confirmDelete = listOf(d) },
                        )
                    }
                }
            }
        }
    }

    confirmDelete?.let { list ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            icon = { Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
            title = { Text(if (list.size == 1) "Dosya silinsin mi?" else "${list.size} dosya silinsin mi?") },
            text = {
                Text(
                    if (list.size == 1) "\"${list[0].name}\" kalıcı olarak silinecek. Bu işlem geri alınamaz."
                    else "Seçilen dosyalar kalıcı olarak silinecek. Bu işlem geri alınamaz."
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        confirmDelete = null
                        scope.launch {
                            val n = vm.delete(list)
                            snackbar.showSnackbar(
                                if (n == list.size) "$n dosya silindi"
                                else "$n dosya silindi, ${list.size - n} dosya silinemedi"
                            )
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError
                    )
                ) { Text("Sil") }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = null }) { Text("Vazgeç") }
            }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileRow(
    d: DocFile,
    selected: Boolean,
    selectionMode: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onOpenWith: () -> Unit,
    onShare: () -> Unit,
    onDelete: () -> Unit,
) {
    val ctx = LocalContext.current
    var menu by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(16.dp)

    Surface(
        color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        shape = shape,
        shadowElevation = if (selected) 0.dp else 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
            .clip(shape)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
    ) {
        Row(
            Modifier.padding(start = 12.dp, top = 12.dp, bottom = 12.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (selected) MaterialTheme.colorScheme.primary else kindColor(d.kind)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (selected) Icons.Filled.Check else kindIcon(d.kind),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(26.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    d.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    "${Formatter.formatShortFileSize(ctx, d.size)}  ·  ${formatDate(d.modified)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (d.source.isNotEmpty()) {
                    Spacer(Modifier.height(5.dp))
                    Text(
                        d.source,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.tertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .background(
                                MaterialTheme.colorScheme.tertiary.copy(alpha = 0.10f),
                                RoundedCornerShape(6.dp)
                            )
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    )
                }
            }
            if (!selectionMode) {
                Box {
                    IconButton(onClick = { menu = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "Seçenekler")
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(
                            text = { Text("Aç") },
                            leadingIcon = { Icon(Icons.Filled.Visibility, contentDescription = null) },
                            onClick = { menu = false; onClick() }
                        )
                        DropdownMenuItem(
                            text = { Text("Başka uygulamada aç") },
                            leadingIcon = { Icon(Icons.Filled.OpenInNew, contentDescription = null) },
                            onClick = { menu = false; onOpenWith() }
                        )
                        DropdownMenuItem(
                            text = { Text("Paylaş") },
                            leadingIcon = { Icon(Icons.Filled.Share, contentDescription = null) },
                            onClick = { menu = false; onShare() }
                        )
                        DropdownMenuItem(
                            text = { Text("Seç") },
                            leadingIcon = { Icon(Icons.Filled.CheckCircle, contentDescription = null) },
                            onClick = { menu = false; onLongClick() }
                        )
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = { Text("Sil", color = MaterialTheme.colorScheme.error) },
                            leadingIcon = {
                                Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                            },
                            onClick = { menu = false; onDelete() }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CenterMessage(loading: Boolean, title: String, text: String) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (loading) {
            CircularProgressIndicator()
        } else {
            Icon(
                Icons.Filled.Description,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(72.dp)
            )
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
            "Telefonunuzdaki tüm PDF, Excel ve PowerPoint dosyalarını tek yerde gösterebilmem için " +
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
