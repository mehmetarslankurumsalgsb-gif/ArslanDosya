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
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ViewerScreen(path: String, name: String, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val file = remember(path) { File(path) }
    val openExternal: () -> Unit = {
        if (!FileActions.openExternal(ctx, path, name)) {
            Toast.makeText(ctx, "Bu dosyayı açacak uygulama bulunamadı.", Toast.LENGTH_LONG).show()
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                ),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Geri")
                    }
                },
                title = {
                    Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 17.sp)
                },
                actions = {
                    IconButton(onClick = {
                        FileActions.share(
                            ctx,
                            listOf(DocFile(path, name, file.length(), file.lastModified(), FileKinds.of(name), ""))
                        )
                    }) {
                        Icon(Icons.Filled.Share, contentDescription = "Paylaş")
                    }
                    IconButton(onClick = openExternal) {
                        Icon(Icons.Filled.OpenInNew, contentDescription = "Başka uygulamada aç")
                    }
                }
            )
        }
    ) { pad ->
        Box(
            Modifier
                .padding(pad)
                .fillMaxSize()
        ) {
            when (val ext = FileKinds.ext(name)) {
                "pdf" -> PdfViewer(file, openExternal)
                "xlsx", "xlsm", "xls", "csv" -> WebDocViewer(file, "excel.html", ext, openExternal)
                "pptx" -> WebDocViewer(file, "pptx.html", ext, openExternal)
                "ppt" -> MessageView(
                    title = "Eski biçim sunum",
                    text = "Bu sunum eski PowerPoint biçiminde (.ppt). ArslanDosya bunu içinde " +
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

class ViewerBridge(private val onExternal: () -> Unit) {
    @JavascriptInterface
    fun openExternal() {
        Handler(Looper.getMainLooper()).post { onExternal() }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebDocViewer(file: File, page: String, type: String, onExternal: () -> Unit) {
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
                settings.builtInZoomControls = true
                settings.displayZoomControls = false
                settings.useWideViewPort = true
                settings.setSupportZoom(true)
                setBackgroundColor(android.graphics.Color.WHITE)
                addJavascriptInterface(ViewerBridge(onExternal), "Arslan")
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
            }
        },
        onRelease = { it.destroy() }
    )
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
fun PdfViewer(file: File, onExternal: () -> Unit) {
    val holder = remember(file) { PdfHolder(file) }
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
    }
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
