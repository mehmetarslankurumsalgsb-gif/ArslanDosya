package com.arslan.dosya

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import kotlin.math.roundToInt

class ViewerActivity : ComponentActivity() {
    companion object {
        const val EXTRA_PATH = "path"
        const val EXTRA_NAME = "name"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val path = intent.getStringExtra(EXTRA_PATH)
        if (path == null) {
            finish()
            return
        }
        val name = intent.getStringExtra(EXTRA_NAME) ?: File(path).name
        setContent {
            ArslanTheme {
                ViewerScreen(path, name, onBack = { finish() })
            }
        }
    }
}

/** Görüntüleyici ile arama kutusu arasındaki bağlantı */
class SearchLink {
    var run: (String) -> Unit = {}
    var next: () -> Unit = {}
    var prev: () -> Unit = {}
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ViewerScreen(path: String, name: String, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val file = remember(path) { File(path) }
    val shareApps = rememberShareApps()
    var menu by remember { mutableStateOf(false) }
    val ext = remember(name) { FileKinds.ext(name) }
    val canSearch = ext in setOf("pdf", "xlsx", "xlsm", "xls", "csv", "docx", "pptx")

    // Arama durumu
    var searching by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var total by remember { mutableIntStateOf(-1) }
    var current by remember { mutableIntStateOf(0) }
    val link = remember { SearchLink() }
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }

    LaunchedEffect(path) { Recent.add(ctx, path) }

    // Yazdıkça ara (kısa beklemeyle)
    LaunchedEffect(query, searching) {
        if (!searching) return@LaunchedEffect
        if (query.isBlank()) { total = -1; link.run(""); return@LaunchedEffect }
        kotlinx.coroutines.delay(350)
        link.run(query)
    }

    val openExternal: () -> Unit = {
        if (!FileActions.openExternal(ctx, path, name)) {
            Toast.makeText(ctx, "Bu dosyayı açacak uygulama bulunamadı.", Toast.LENGTH_LONG).show()
        }
    }
    fun closeSearch() {
        searching = false
        query = ""
        total = -1
        link.run("")
    }
    BackHandler(enabled = searching) { closeSearch() }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Column {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                    navigationIcon = {
                        IconButton(onClick = { if (searching) closeSearch() else onBack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Geri")
                        }
                    },
                    title = {
                        if (searching) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.weight(1f)) {
                                    if (query.isEmpty()) Text("Belgede ara", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 17.sp)
                                    androidx.compose.foundation.text.BasicTextField(
                                        value = query,
                                        onValueChange = { query = it },
                                        singleLine = true,
                                        textStyle = androidx.compose.ui.text.TextStyle(fontSize = 17.sp, color = MaterialTheme.colorScheme.onSurface),
                                        cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary),
                                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Search),
                                        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { link.next() }),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .focusRequester(focus)
                                    )
                                }
                                if (total >= 0) {
                                    Text(
                                        if (total == 0) "Yok" else "$current/$total",
                                        fontSize = 13.sp,
                                        color = if (total == 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 6.dp)
                                    )
                                }
                            }
                            LaunchedEffect(Unit) { focus.requestFocus() }
                        } else {
                            Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                        }
                    },
                    actions = {
                        if (searching) {
                            IconButton(onClick = { link.prev() }, enabled = total > 0) {
                                Icon(Icons.Filled.KeyboardArrowUp, contentDescription = "Önceki")
                            }
                            IconButton(onClick = { link.next() }, enabled = total > 0) {
                                Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Sonraki")
                            }
                        } else {
                            val doc = DocFile(path, name, file.length(), file.lastModified(), FileKinds.of(name), "")
                            if (canSearch) {
                                IconButton(onClick = { searching = true }) {
                                    Icon(Icons.Filled.Search, contentDescription = "Belgede ara")
                                }
                            }
                            shareApps.forEach { (app, pkg) ->
                                ShareBarButton(app, pkg) { ShareApps.send(ctx, pkg, listOf(doc)) }
                            }
                            Box {
                                IconButton(onClick = { menu = true }) {
                                    Icon(Icons.Filled.MoreVert, contentDescription = "Seçenekler")
                                }
                                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                    DropdownMenuItem(
                                        text = { Text("Diğer paylaşım seçenekleri") },
                                        leadingIcon = { Icon(Icons.Filled.Share, contentDescription = null) },
                                        onClick = { menu = false; FileActions.share(ctx, listOf(doc)) }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Başka uygulamada aç") },
                                        leadingIcon = { Icon(Icons.Filled.OpenInNew, contentDescription = null) },
                                        onClick = { menu = false; openExternal() }
                                    )
                                }
                            }
                        }
                    }
                )
                HorizontalDivider(color = Color(0xFFE5E7EB))
            }
        }
    ) { pad ->
        Box(
            Modifier
                .padding(pad)
                .fillMaxSize()
        ) {
            val onFound: (Int, Int) -> Unit = { t, c -> total = t; current = c }
            when (ext) {
                "pdf" -> PdfViewer(file, openExternal, link, onFound, searching)
                "xlsx", "xlsm", "xls", "csv" -> WebDocViewer(file, "excel.html", ext, openExternal, link, onFound)
                "docx" -> WebDocViewer(file, "docx.html", ext, openExternal, link, onFound)
                "pptx" -> WebDocViewer(file, "pptx.html", ext, openExternal, link, onFound)
                "ppt", "doc" -> MessageView(
                    title = "Eski biçim dosya",
                    text = "Bu dosya eski Office biçiminde (.$ext). ArslanDosya bunu içinde " +
                        "gösteremiyor; başka bir uygulamada açabilirsiniz.",
                    onExternal = openExternal
                )
                else -> MessageView("Desteklenmeyen dosya", "Bu dosya türü gösterilemiyor.", openExternal)
            }
        }
    }
}

@Composable
fun MessageView(title: String, text: String, onExternal: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Filled.ErrorOutline,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.size(64.dp)
        )
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))
        Button(onClick = onExternal, shape = RoundedCornerShape(14.dp)) {
            Icon(Icons.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Başka uygulamada aç")
        }
    }
}

// =================== EXCEL ve POWERPOINT (web görüntüleyici) ===================

/** Sayfadaki JavaScript ile Android arasındaki köprü */
class ViewerBridge(
    private val onReady: () -> Unit,
    private val onFailed: (String) -> Unit,
    private val onSheets: (List<String>, Int) -> Unit,
    private val onNotice: (String) -> Unit,
    private val onExternal: () -> Unit,
    private val onFound: (Int, Int) -> Unit = { _, _ -> },
    private val onPdfResults: (String) -> Unit = {},
) {
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun ready() { main.post { onReady() } }

    @JavascriptInterface
    fun failed(msg: String?) { main.post { onFailed(msg ?: "Dosya açılamadı.") } }

    @JavascriptInterface
    fun sheets(json: String?, active: Int) {
        val names = try {
            val arr = org.json.JSONArray(json ?: "[]")
            List(arr.length()) { arr.optString(it) }
        } catch (_: Exception) {
            emptyList()
        }
        main.post { onSheets(names, active) }
    }

    @JavascriptInterface
    fun notice(text: String?) { main.post { onNotice(text ?: "") } }

    @JavascriptInterface
    fun openExternal() { main.post { onExternal() } }

    @JavascriptInterface
    fun found(total: Int, current: Int) { main.post { onFound(total, current) } }

    @JavascriptInterface
    fun pdfResults(json: String?) { main.post { onPdfResults(json ?: "{}") } }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebDocViewer(
    file: File,
    page: String,
    type: String,
    onExternal: () -> Unit,
    link: SearchLink? = null,
    onFound: (Int, Int) -> Unit = { _, _ -> },
) {
    var ready by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sheets by remember { mutableStateOf<List<String>>(emptyList()) }
    var activeSheet by remember { mutableIntStateOf(0) }
    var notice by remember { mutableStateOf("") }
    var webView by remember { mutableStateOf<WebView?>(null) }

    // Çok uzun sürerse kullanıcıyı bekletme
    LaunchedEffect(file) {
        kotlinx.coroutines.delay(90_000)
        if (!ready && error == null) error = "Dosya açılamadı. Çok büyük ya da bozuk olabilir."
    }

    val err = error
    if (err != null) {
        MessageView("Açılamadı", err, onExternal)
        return
    }

    Column(Modifier.fillMaxSize()) {
        if (sheets.size > 1) {
            ScrollableTabRow(
                selectedTabIndex = activeSheet.coerceIn(0, sheets.size - 1),
                edgePadding = 8.dp,
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.tertiary,
            ) {
                sheets.forEachIndexed { i, name ->
                    Tab(
                        selected = i == activeSheet,
                        onClick = {
                            activeSheet = i
                            webView?.evaluateJavascript("showSheet($i)", null)
                        },
                        text = { Text(name, maxLines = 1) },
                        unselectedContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        if (notice.isNotEmpty()) {
            Text(
                notice,
                style = MaterialTheme.typography.labelMedium,
                color = Color(0xFF7A4A00),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFFFF3CD))
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            )
        }
        Box(Modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { c ->
                    val loader = WebViewAssetLoader.Builder()
                        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(c))
                        .addPathHandler("/doc/", WebViewAssetLoader.PathHandler { _ ->
                            try {
                                WebResourceResponse(FileKinds.mime(file.name), null, FileInputStream(file))
                            } catch (_: Exception) {
                                null
                            }
                        })
                        .build()

                    WebView(c).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        // Telefonun kendi iki parmak yakınlaştırması
                        settings.setSupportZoom(true)
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false
                        settings.useWideViewPort = true
                        settings.loadWithOverviewMode = true
                        setBackgroundColor(android.graphics.Color.WHITE)
                        addJavascriptInterface(
                            ViewerBridge(
                                onReady = { ready = true },
                                onFailed = { error = it },
                                onSheets = { names, active -> sheets = names; activeSheet = active },
                                onNotice = { notice = it },
                                onExternal = onExternal,
                                onFound = onFound
                            ),
                            "Arslan"
                        )
                        webViewClient = object : WebViewClient() {
                            override fun shouldInterceptRequest(
                                view: WebView,
                                request: WebResourceRequest
                            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                                request.url.host != "appassets.androidplatform.net"
                        }
                        loadUrl(
                            "https://appassets.androidplatform.net/assets/viewer/$page?f=" +
                                Uri.encode(file.name) + "&t=" + type
                        )
                        webView = this
                        val wv = this
                        link?.run = { q -> wv.evaluateJavascript("Find.search(" + org.json.JSONObject.quote(q) + ")", null) }
                        link?.next = { wv.evaluateJavascript("Find.next()", null) }
                        link?.prev = { wv.evaluateJavascript("Find.prev()", null) }
                    }
                },
                onRelease = { it.destroy() }
            )
            if (!ready) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(12.dp))
                    Text(
                        when {
                            page.startsWith("pptx") -> "Sunum açılıyor…"
                            page.startsWith("docx") -> "Belge açılıyor…"
                            else -> "Tablo hazırlanıyor…"
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

// =================== PDF ===================

class PdfHolder(file: File) {
    private var pfd: ParcelFileDescriptor? = null
    private var renderer: PdfRenderer? = null
    private val mutex = Mutex()
    private var closed = false
    val error: String?
    val pageCount: Int

    init {
        var err: String? = null
        var count = 0
        try {
            val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            pfd = fd
            val r = PdfRenderer(fd)
            renderer = r
            count = r.pageCount
        } catch (e: SecurityException) {
            err = "Bu PDF şifreli olduğu için açılamıyor."
        } catch (e: Exception) {
            err = "PDF açılamadı. Dosya bozuk olabilir."
        }
        error = err
        pageCount = count
    }

    suspend fun render(index: Int, widthPx: Int): Bitmap? = withContext(Dispatchers.IO) {
        mutex.withLock {
            val r = renderer
            if (closed || r == null) return@withLock null
            try {
                r.openPage(index).use { page ->
                    val w = widthPx.coerceIn(200, 2400)
                    val h = (w.toFloat() * page.height / page.width).roundToInt().coerceAtLeast(1)
                    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                    bmp.eraseColor(android.graphics.Color.WHITE)
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bmp
                }
            } catch (_: Throwable) {
                null
            }
        }
    }

    fun close() {
        CoroutineScope(Dispatchers.IO).launch {
            mutex.withLock {
                closed = true
                try { renderer?.close() } catch (_: Exception) {}
                try { pfd?.close() } catch (_: Exception) {}
            }
        }
    }
}

@Composable
fun PdfViewer(
    file: File,
    onExternal: () -> Unit,
    link: SearchLink? = null,
    onFound: (Int, Int) -> Unit = { _, _ -> },
    searching: Boolean = false,
) {
    val holder = remember(file) { PdfHolder(file) }
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val scope = rememberCoroutineScope()
    var results by remember { mutableStateOf<List<Pair<Int, String>>>(emptyList()) }
    var noText by remember { mutableStateOf(false) }
    var cur by remember { mutableIntStateOf(0) }
    var showList by remember { mutableStateOf(true) }
    var engine by remember { mutableStateOf<WebView?>(null) }

    fun goTo(i: Int) {
        if (results.isEmpty()) return
        cur = ((i % results.size) + results.size) % results.size
        onFound(results.size, cur + 1)
        scope.launch { listState.animateScrollToItem(results[cur].first) }
    }
    if (link != null) {
        link.run = { q ->
            if (q.isBlank()) { results = emptyList(); onFound(-1, 0) }
            else { showList = true; engine?.evaluateJavascript("pdfSearch(" + org.json.JSONObject.quote(q) + ")", null) }
        }
        link.next = { showList = false; goTo(cur + 1) }
        link.prev = { showList = false; goTo(cur - 1) }
    }
    // PDF'in yazılarını okuyan görünmez sayfa (PDF.js)
    if (searching) {
        PdfSearchEngine(file, onReady = { engine = it }) { json ->
            try {
                val o = org.json.JSONObject(json)
                val arr = o.optJSONArray("results") ?: org.json.JSONArray()
                results = List(arr.length()) { arr.getJSONObject(it).let { r -> r.optInt("page") to r.optString("snippet") } }
                noText = !o.optBoolean("hasText", true)
                cur = 0
                onFound(results.size, if (results.isEmpty()) 0 else 1)
                if (results.isNotEmpty()) scope.launch { listState.animateScrollToItem(results[0].first) }
            } catch (_: Exception) {
                results = emptyList()
                onFound(0, 0)
            }
        }
    }
    DisposableEffect(holder) { onDispose { holder.close() } }

    val err = holder.error
    if (err != null) {
        MessageView("PDF açılamadı", err, onExternal)
        return
    }

    var scale by remember { mutableFloatStateOf(1f) }
    val renderScale = ((scale * 2f).roundToInt() / 2f).coerceAtLeast(1f)

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF8A90A0).copy(alpha = 0.25f))
    ) {
        val baseWidth: Dp = maxWidth
        val baseWidthPx = constraints.maxWidth
        val hScroll = rememberScrollState()

        Box(
            Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    // İki parmakla yakınlaştırma
                    awaitEachGesture {
                        do {
                            val event = awaitPointerEvent(PointerEventPass.Initial)
                            if (event.changes.count { it.pressed } >= 2) {
                                val zoom = event.calculateZoom()
                                if (zoom != 1f) scale = (scale * zoom).coerceIn(1f, 4f)
                                event.changes.forEach { it.consume() }
                            }
                        } while (event.changes.any { it.pressed })
                    }
                }
                .horizontalScroll(hScroll)
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .width(baseWidth * scale)
                    .fillMaxHeight(),
                contentPadding = PaddingValues(vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(holder.pageCount) { i ->
                    PdfPage(holder, i, (baseWidthPx * renderScale).roundToInt())
                }
            }
        }
        if (searching && noText) {
            Text(
                "Bu PDF taranmış bir resim; içinde aranabilir yazı yok.",
                fontSize = 13.sp,
                color = Color(0xFF7A4A00),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFFFF3CD))
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            )
        } else if (searching && showList && results.isNotEmpty()) {
            Surface(
                shadowElevation = 6.dp,
                color = MaterialTheme.colorScheme.background,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 260.dp)
            ) {
                LazyColumn {
                    items(results.size) { i ->
                        val r = results[i]
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { showList = false; goTo(i) }
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Sayfa ${r.first + 1}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.width(64.dp)
                            )
                            Text(r.second, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        HorizontalDivider(color = Color(0xFFF0F1F3))
                    }
                }
            }
        }
    }
}

/** Görünmez WebView: PDF içindeki yazıları PDF.js ile okur */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PdfSearchEngine(file: File, onReady: (WebView) -> Unit, onResults: (String) -> Unit) {
    AndroidView(
        modifier = Modifier.size(1.dp),
        factory = { c ->
            val loader = WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(c))
                .addPathHandler("/doc/", WebViewAssetLoader.PathHandler { _ ->
                    try {
                        WebResourceResponse("application/pdf", null, FileInputStream(file))
                    } catch (_: Exception) {
                        null
                    }
                })
                .build()
            WebView(c).apply {
                settings.javaScriptEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                addJavascriptInterface(
                    ViewerBridge({}, {}, { _, _ -> }, {}, {}, onPdfResults = onResults),
                    "Arslan"
                )
                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                        loader.shouldInterceptRequest(request.url)
                }
                loadUrl("https://appassets.androidplatform.net/assets/viewer/pdfsearch.html?f=" + Uri.encode(file.name))
                onReady(this)
            }
        },
        onRelease = { it.destroy() }
    )
}

@Composable
fun PdfPage(holder: PdfHolder, index: Int, widthPx: Int) {
    val bmp by produceState<Bitmap?>(null, index, widthPx) {
        value = holder.render(index, widthPx)
    }
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        val b = bmp
        if (b != null) {
            Image(
                bitmap = b.asImageBitmap(),
                contentDescription = "Sayfa ${index + 1}",
                contentScale = ContentScale.FillWidth,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(b.width.toFloat() / b.height.toFloat())
                    .shadow(3.dp)
                    .background(Color.White)
            )
        } else {
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f / 1.414f)
                    .background(Color.White),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 2.dp)
            }
        }
        Text(
            "${index + 1} / ${holder.pageCount}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}
