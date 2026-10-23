package com.arslan.dosya

import android.text.format.Formatter
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Kopya dosyalar: aynı içeriğe sahip dosyalar gruplanır.
 * Her grupta en eski dosya (asıl olan) bırakılır, diğerleri silinmek üzere işaretli gelir.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DuplicatesScreen(vm: MainViewModel, onBack: () -> Unit, onDelete: (List<DocFile>) -> Unit) {
    val ctx = LocalContext.current
    val groups = vm.duplicates
    BackHandler { onBack() }

    // Varsayılan: her grupta ilki (en eski) kalsın, diğerleri seçili
    var chosen by remember(groups) {
        mutableStateOf(groups?.flatMap { g -> g.files.drop(1).map { it.path } }?.toSet() ?: emptySet())
    }
    val chosenFiles = groups?.flatMap { it.files }?.filter { it.path in chosen } ?: emptyList()
    val freed = chosenFiles.sumOf { it.size }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Column {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                    navigationIcon = {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Geri") }
                    },
                    title = {
                        Column {
                            Text("Kopya dosyalar", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                            if (groups != null) {
                                Text(
                                    if (groups.isEmpty()) "Kopya bulunamadı"
                                    else "${groups.size} grup · ${Formatter.formatShortFileSize(ctx, groups.sumOf { it.wasted })} boşaltılabilir",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                )
                HorizontalDivider(color = Color(0xFFE5E7EB))
            }
        },
        bottomBar = {
            if (!groups.isNullOrEmpty()) {
                Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.background) {
                    Button(
                        onClick = { onDelete(chosenFiles) },
                        enabled = chosenFiles.isNotEmpty(),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier
                            .fillMaxWidth()
                            .navigationBarsPadding()
                            .padding(16.dp)
                            .height(52.dp)
                    ) {
                        Text(
                            if (chosenFiles.isEmpty()) "Silinecek dosya seçin"
                            else "${chosenFiles.size} kopyayı sil (${Formatter.formatShortFileSize(ctx, freed)})",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    ) { pad ->
        Box(
            Modifier
                .padding(pad)
                .fillMaxSize()
        ) {
            when {
                groups == null || vm.dupLoading -> CenterMessage(true, "Kopyalar aranıyor…", "Dosyalar karşılaştırılıyor.", Modifier.fillMaxSize())
                groups.isEmpty() -> Column(
                    Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(64.dp))
                    Spacer(Modifier.height(12.dp))
                    Text("Harika, kopya dosya yok", fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
                }
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                    groups.forEachIndexed { gi, g ->
                        item(key = "h$gi") {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .padding(horizontal = 20.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    "${g.files.size} aynı dosya · her biri ${Formatter.formatShortFileSize(ctx, g.size)}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        items(g.files, key = { "f$gi" + it.path }) { d ->
                            val isChosen = d.path in chosen
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable { chosen = if (isChosen) chosen - d.path else chosen + d.path }
                                    .padding(start = 8.dp, end = 20.dp, top = 10.dp, bottom = 10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = isChosen,
                                    onCheckedChange = { chosen = if (it) chosen + d.path else chosen - d.path },
                                    colors = CheckboxDefaults.colors(checkedColor = MaterialTheme.colorScheme.error)
                                )
                                KindBadge(d.kind, false)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(d.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        listOf(d.source, formatDate(d.modified)).filter { it.isNotEmpty() }.joinToString("  ·  ") +
                                            if (d == g.files.first()) "  ·  en eski" else "",
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1
                                    )
                                }
                            }
                            HorizontalDivider(color = Color(0xFFF0F1F3), modifier = Modifier.padding(start = 108.dp))
                        }
                    }
                }
            }
        }
    }
}
