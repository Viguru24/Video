package com.cosmo.symphony.companion

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.OpenableColumns
import android.text.InputType
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStreamWriter
import java.io.PrintWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var addressBar: EditText
    private lateinit var container: FrameLayout

    private var uploadMessage: ValueCallback<Array<Uri>>? = null
    private var folderBtnView: TextView? = null

    // Shared thread pool for non-blocking parallel transfers
    private val transferExecutor = Executors.newFixedThreadPool(4)
    private val prefs by lazy { getSharedPreferences("cosmo_symphony_companion", Context.MODE_PRIVATE) }

    // DP Helper Extension
    private val Int.dp: Int
        get() = (this * resources.displayMetrics.density).toInt()

    // ── Activity Result Launchers ───────────────────────────────────────────

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = uploadMessage
        uploadMessage = null

        if (result.resultCode == Activity.RESULT_OK) {
            val intentData = result.data
            val uriList = mutableListOf<Uri>()

            if (intentData?.clipData != null) {
                val clipData = intentData.clipData!!
                for (i in 0 until clipData.itemCount) {
                    clipData.getItemAt(i).uri?.let { uriList.add(it) }
                }
            } else if (intentData?.data != null) {
                uriList.add(intentData.data!!)
            }

            if (uriList.isNotEmpty()) {
                callback?.onReceiveValue(uriList.toTypedArray())
            } else {
                callback?.onReceiveValue(null)
            }
        } else {
            callback?.onReceiveValue(null)
        }
    }

    private val folderPickerLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        if (uri != null) {
            try {
                contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
            } catch (_: Exception) {}

            val rawSegment = Uri.decode(uri.lastPathSegment ?: "")
            val folderName = sanitizeFileName(
                if (rawSegment.contains(":")) rawSegment.substringAfterLast(":") else rawSegment
            ).ifBlank { "Secure Storage" }

            prefs.edit().putString("custom_folder_name", folderName).apply()
            prefs.edit().putString("custom_subfolder_name", "").apply()
            updateFolderLabel()

            Toast.makeText(this, "Save Folder set to: $folderName", Toast.LENGTH_SHORT).show()
        }
    }

    // ── Security & Hardening Helpers ────────────────────────────────────────

    /**
     * Sanitizes incoming filenames to prevent Directory Traversal attacks (OWASP A01:2021).
     */
    private fun sanitizeFileName(rawName: String): String {
        var clean = File(rawName).name
        clean = clean.replace(Regex("""[\\/:\*\?"<>\|]"""), "_").trim()
        return clean.ifBlank { "download_${System.currentTimeMillis()}" }
    }

    /**
     * Restricts SSL bypass strictly to local LAN IP subnets.
     */
    private fun isLocalLanUrl(urlStr: String): Boolean {
        val host = Uri.parse(urlStr).host ?: return false
        return host == "127.0.0.1" || host == "localhost" ||
                host.startsWith("192.168.") || host.startsWith("10.") ||
                Regex("""^172\.(1[6-9]|2[0-9]|3[0-1])\.""").containsMatchIn(host)
    }

    private fun queryFileName(uri: Uri): String {
        if (uri.scheme == "content") {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIdx != -1) {
                        cursor.getString(nameIdx)?.let { return sanitizeFileName(it) }
                    }
                }
            }
        }
        val fallback = uri.path?.substringAfterLast('/') ?: "upload_${System.currentTimeMillis()}.jpg"
        return sanitizeFileName(fallback)
    }

    // ── Visual HUD Overlay (WCAG 2.1 Accessible & Micro-Animated) ──────────

    private var hudOverlay: LinearLayout? = null
    private var hudTitle: TextView? = null
    private var hudSub: TextView? = null
    private var hudProgressBar: ProgressBar? = null
    private val lastHudUpdateMs = AtomicLong(0L)

    private fun setupProgressHUD() {
        if (hudOverlay != null) {
            if (hudOverlay?.parent == null) {
                container.addView(hudOverlay)
            }
            hudOverlay?.bringToFront()
            return
        }

        hudTitle = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.parseColor("#00ff88")) // Cyber Emerald Green
            setTypeface(null, Typeface.BOLD)
            text = "🎵 Ingesting into Cosmo Symphony..."
        }

        hudSub = TextView(this).apply {
            textSize = 11f
            setTextColor(Color.parseColor("#94a3b8")) // WCAG 2.1 AA compliant
            setPadding(0, 4.dp, 0, 8.dp)
            text = "Preparing media stream..."
            ellipsize = TextUtils.TruncateAt.END
            maxLines = 1
        }

        hudProgressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            progressTintList = ColorStateList.valueOf(Color.parseColor("#00ff88"))
            progressBackgroundTintList = ColorStateList.valueOf(Color.parseColor("#064e3b"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                16.dp
            )
        }

        hudOverlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#f009121a"))
            setPadding(20.dp, 16.dp, 20.dp, 16.dp)
            visibility = View.GONE
            alpha = 0f
            elevation = 16.dp.toFloat()
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                topMargin = 48.dp
                leftMargin = 20.dp
                rightMargin = 20.dp
            }
            addView(hudTitle)
            addView(hudSub)
            addView(hudProgressBar)
        }

        container.addView(hudOverlay)
    }

    private fun updateProgressHUD(completed: Int, total: Int, currentFileName: String) {
        val now = System.currentTimeMillis()
        // Throttle UI updates to ~60 FPS (16ms) to avoid main loop starvation
        if (completed < total && now - lastHudUpdateMs.get() < 16) return
        lastHudUpdateMs.set(now)

        runOnUiThread {
            setupProgressHUD()
            hudOverlay?.let { hud ->
                hud.bringToFront()
                if (hud.visibility != View.VISIBLE) {
                    hud.visibility = View.VISIBLE
                    hud.animate().alpha(1f).setDuration(250).start()
                }
            }
            val percent = if (total > 0) (completed * 100) / total else 0
            hudTitle?.text = "🎵 Ingesting $completed of $total Files ($percent%)"
            hudSub?.text = "Active: $currentFileName"
            hudProgressBar?.progress = percent
        }
    }

    private fun hideProgressHUD(message: String, isSuccess: Boolean = true) {
        runOnUiThread {
            hudTitle?.text = message
            hudTitle?.setTextColor(if (isSuccess) Color.parseColor("#00ff88") else Color.parseColor("#ff6b6b"))
            hudSub?.text = if (isSuccess) "Media ingested directly into Cosmo Symphony!" else "Please check PC Wi-Fi connection and tap Auto-Detect."
            hudProgressBar?.progress = 100
            hudOverlay?.postDelayed({
                hudOverlay?.animate()?.alpha(0f)?.setDuration(300)?.withEndAction {
                    hudOverlay?.visibility = View.GONE
                }?.start()
            }, 3000)
        }
    }

    // ── Optimized High-Speed Multi-Thread Transfer Engine ─────────────────

    private fun uploadUrisDirectly(uriList: List<Uri>) {
        val serverUrl = prefs.getString("last_url", "") ?: ""
        if (serverUrl.isBlank() || uriList.isEmpty()) return

        val baseUrl = if (serverUrl.contains("/room/")) {
            val code = serverUrl.substringAfter("/room/").trim('/')
            val origin = serverUrl.substringBefore("/room/")
            "$origin/api/rooms/$code/upload"
        } else {
            val origin = serverUrl.trimEnd('/')
            "$origin/api/rooms/local/upload"
        }

        val total = uriList.size
        val completedCount = AtomicInteger(0)
        val successCount = AtomicInteger(0)

        updateProgressHUD(0, total, "Starting high-speed transfer…")

        for (uri in uriList) {
            transferExecutor.execute {
                val fileName = queryFileName(uri)
                try {
                    val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                    val boundary = "---CosmoShareBoundary${System.currentTimeMillis()}_${(0..999).random()}"

                    val url = URL(baseUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.doOutput = true
                    conn.doInput = true
                    conn.useCaches = false
                    conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                    conn.setRequestProperty("Connection", "Keep-Alive")
                    conn.connectTimeout = 15000
                    conn.readTimeout = 60000

                    val outputStream = conn.outputStream
                    val writer = PrintWriter(OutputStreamWriter(outputStream, "UTF-8"), true)

                    writer.append("--").append(boundary).append("\r\n")
                    writer.append("Content-Disposition: form-data; name=\"files\"; filename=\"")
                        .append(fileName.replace("\"", "\\\"")).append("\"\r\n")
                    writer.append("Content-Type: ").append(mimeType).append("\r\n\r\n")
                    writer.flush()

                    // High-performance 256 KB stream buffer
                    contentResolver.openInputStream(uri)?.use { inputStream ->
                        val buffer = ByteArray(262144)
                        var bytesRead: Int
                        while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                            outputStream.write(buffer, 0, bytesRead)
                        }
                        outputStream.flush()
                    }

                    writer.append("\r\n").flush()
                    writer.append("--").append(boundary).append("--\r\n").flush()
                    writer.close()

                    if (conn.responseCode in 200..299) {
                        successCount.incrementAndGet()
                    }
                    conn.disconnect()
                } catch (e: Exception) {
                    e.printStackTrace()
                } finally {
                    val currentCompleted = completedCount.incrementAndGet()
                    updateProgressHUD(currentCompleted, total, fileName)

                    if (currentCompleted == total) {
                        val successes = successCount.get()
                        if (successes > 0) {
                            hideProgressHUD("🎉 Transfer Complete! $successes of $total files sent to PC.", true)
                            runOnUiThread {
                                if (::webView.isInitialized) {
                                    webView.reload()
                                }
                            }
                        } else {
                            hideProgressHUD("⚠️ Upload failed: Could not connect to PC Studio ($serverUrl)", false)
                        }
                    }
                }
            }
        }
    }

    /**
     * O(log N) Binary-Probe Unique File Deduplication algorithm.
     */
    private fun getUniqueDestinationFile(targetDir: File, rawFileName: String): File {
        val fileName = sanitizeFileName(rawFileName)
        val destFile = File(targetDir, fileName)
        if (!destFile.exists()) return destFile

        val dotIndex = fileName.lastIndexOf('.')
        val baseName = if (dotIndex != -1) fileName.substring(0, dotIndex) else fileName
        val extension = if (dotIndex != -1) fileName.substring(dotIndex) else ""

        // Binary jump probe algorithm to find duplicate index range in O(log N)
        var high = 1
        while (File(targetDir, "$baseName ($high)$extension").exists()) {
            high *= 2
        }
        var low = high / 2
        var targetIndex = high

        while (low <= high) {
            val mid = (low + high) / 2
            if (File(targetDir, "$baseName ($mid)$extension").exists()) {
                low = mid + 1
            } else {
                targetIndex = mid
                high = mid - 1
            }
        }

        return File(targetDir, "$baseName ($targetIndex)$extension")
    }

    private fun downloadFilesDirectly(files: List<Pair<String, String>>) {
        if (files.isEmpty()) return

        val total = files.size
        val completedCount = AtomicInteger(0)
        val successCount = AtomicInteger(0)

        updateProgressHUD(0, total, "Downloading from PC…")

        for ((downloadUrl, fileName) in files) {
            val cleanName = sanitizeFileName(fileName)
            transferExecutor.execute {
                try {
                    var targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    if (!targetDir.exists()) targetDir.mkdirs()

                    var destFile = getUniqueDestinationFile(targetDir, cleanName)

                    val url = URL(downloadUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 15000
                    conn.readTimeout = 60000

                    if (conn.responseCode in 200..299) {
                        try {
                            conn.inputStream.use { input ->
                                FileOutputStream(destFile).use { output ->
                                    input.copyTo(output)
                                }
                            }
                        } catch (e: Exception) {
                            val fallbackDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
                            destFile = getUniqueDestinationFile(fallbackDir, cleanName)
                            val conn2 = URL(downloadUrl).openConnection() as HttpURLConnection
                            conn2.inputStream.use { input ->
                                FileOutputStream(destFile).use { output ->
                                    input.copyTo(output)
                                }
                            }
                            conn2.disconnect()
                        }

                        successCount.incrementAndGet()
                        MediaScannerConnection.scanFile(
                            applicationContext,
                            arrayOf(destFile.absolutePath),
                            null,
                            null
                        )
                    }
                    conn.disconnect()
                } catch (e: Exception) {
                    e.printStackTrace()
                } finally {
                    val currentCompleted = completedCount.incrementAndGet()
                    updateProgressHUD(currentCompleted, total, cleanName)
                    if (currentCompleted == total) {
                        hideProgressHUD("🎉 Complete! ${successCount.get()} of $total files saved.")
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "✅ Saved to Downloads!", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
        }
    }

    private fun getSaveDestinationPath(): String {
        val customName = prefs.getString("custom_folder_name", "") ?: ""
        if (customName.isNotBlank()) {
            val subFolder = prefs.getString("custom_subfolder_name", "") ?: ""
            return if (subFolder.isNotBlank()) "$customName/$subFolder" else customName
        }

        val baseDir = prefs.getString("phone_download_dir", Environment.DIRECTORY_DOWNLOADS) ?: Environment.DIRECTORY_DOWNLOADS
        val subFolder = prefs.getString("custom_subfolder_name", "") ?: ""
        return if (subFolder.isNotBlank()) "$baseDir/$subFolder" else baseDir
    }

    private fun updateFolderLabel() {
        val btn = folderBtnView ?: return
        val customFolder = prefs.getString("custom_folder_name", "") ?: ""
        val subFolder = prefs.getString("custom_subfolder_name", "") ?: ""

        val label = if (customFolder.isNotBlank()) {
            if (subFolder.isNotBlank()) "$customFolder/$subFolder" else customFolder
        } else {
            val selectedSubDir = prefs.getString("phone_download_dir", Environment.DIRECTORY_DOWNLOADS) ?: Environment.DIRECTORY_DOWNLOADS
            val base = when(selectedSubDir) {
                Environment.DIRECTORY_PICTURES -> "Pictures"
                Environment.DIRECTORY_DCIM -> "DCIM"
                Environment.DIRECTORY_DOCUMENTS -> "Documents"
                else -> "Downloads"
            }
            if (subFolder.isNotBlank()) "$base/$subFolder" else base
        }
        btn.text = "📁 $label"
    }

    private val defaultStudioUrl = "http://192.168.1.55:48273"
    private var loadingSpinner: LinearLayout? = null

    // ── Lifecycle & App Structure ──────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideSystemBars()

        container = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#09090d"))
        }
        setContentView(container)

        val intentUrl = intent?.dataString
        var targetUrl = when {
            !intentUrl.isNullOrBlank() && intentUrl.startsWith("http") -> intentUrl
            else -> {
                val saved = prefs.getString("last_url", defaultStudioUrl)
                if (saved.isNullOrBlank() || saved.contains(":8765") || saved.contains("192.168.1.54")) defaultStudioUrl else saved
            }
        }

        if (targetUrl.contains(":8765")) {
            targetUrl = targetUrl.replace(":8765", ":48273")
        }

        prefs.edit().putString("last_url", targetUrl).apply()
        openWebView(targetUrl)
        handleIncomingShareIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val intentUrl = intent.dataString
        if (!intentUrl.isNullOrBlank() && intentUrl.startsWith("http")) {
            var url = intentUrl
            if (url.contains(":8765")) url = url.replace(":8765", ":48273")
            prefs.edit().putString("last_url", url).apply()
            openWebView(url)
        }
        handleIncomingShareIntent(intent)
    }

    private fun handleIncomingShareIntent(targetIntent: Intent?) {
        if (targetIntent == null) return
        val action = targetIntent.action ?: return
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return

        val sharedUris = mutableListOf<Uri>()

        if (action == Intent.ACTION_SEND) {
            val uri: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                targetIntent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                targetIntent.getParcelableExtra(Intent.EXTRA_STREAM)
            }
            if (uri != null) {
                sharedUris.add(uri)
            } else if (targetIntent.clipData != null && (targetIntent.clipData?.itemCount ?: 0) > 0) {
                val cd = targetIntent.clipData!!
                for (i in 0 until cd.itemCount) {
                    cd.getItemAt(i).uri?.let { sharedUris.add(it) }
                }
            }
        } else if (action == Intent.ACTION_SEND_MULTIPLE) {
            val uris: java.util.ArrayList<Uri>? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                targetIntent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                targetIntent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
            }
            if (!uris.isNullOrEmpty()) {
                sharedUris.addAll(uris)
            } else if (targetIntent.clipData != null) {
                val cd = targetIntent.clipData!!
                for (i in 0 until cd.itemCount) {
                    cd.getItemAt(i).uri?.let { sharedUris.add(it) }
                }
            }
        }

        if (sharedUris.isNotEmpty()) {
            Toast.makeText(this, "🚀 Sending ${sharedUris.size} item(s) to Cosmo Symphony...", Toast.LENGTH_SHORT).show()
            uploadUrisDirectly(sharedUris)
        }
    }

    // ── Connect Screen UI (WCAG 2.1 48dp Minimum Touch Target Compliant) ──

    private fun buildConnectScreen(errorMessage: String? = null) {
        container.removeAllViews()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#09090d"))
            setPadding(32.dp, 32.dp, 32.dp, 32.dp)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        val badge = TextView(this).apply {
            text = "🎵 COSMO SYMPHONY"
            textSize = 12f
            setTextColor(Color.parseColor("#00ff88"))
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 4.dp)
        }

        val title = TextView(this).apply {
            text = "Companion Share"
            textSize = 28f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 8.dp)
        }

        val subtitle = TextView(this).apply {
            text = "Connect to your PC Studio running Cosmo Symphony"
            textSize = 13f
            setTextColor(Color.parseColor("#94a3b8"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 24.dp)
        }

        root.addView(badge)
        root.addView(title)
        root.addView(subtitle)

        if (!errorMessage.isNullOrBlank()) {
            val errorBox = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.parseColor("#2a1215"))
                setPadding(16.dp, 12.dp, 16.dp, 12.dp)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = 20.dp }
            }
            val errTitle = TextView(this).apply {
                text = "⚠️ Connection Issue"
                textSize = 13f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.parseColor("#ff6b6b"))
            }
            val errDesc = TextView(this).apply {
                text = errorMessage
                textSize = 12f
                setTextColor(Color.parseColor("#fca5a5"))
                setPadding(0, 4.dp, 0, 0)
            }
            errorBox.addView(errTitle)
            errorBox.addView(errDesc)
            root.addView(errorBox)
        }

        val savedUrl = prefs.getString("last_url", defaultStudioUrl) ?: defaultStudioUrl
        val displayUrl = if (savedUrl.contains("192.168.1.54") || savedUrl.contains(":8765")) defaultStudioUrl else savedUrl

        val input = EditText(this).apply {
            hint = "http://192.168.1.55:48273"
            setText(displayUrl)
            setHintTextColor(Color.parseColor("#475569"))
            setTextColor(Color.WHITE)
            textSize = 16f
            setBackgroundColor(Color.parseColor("#141923"))
            setPadding(16.dp, 16.dp, 16.dp, 16.dp)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 12.dp }
            setSingleLine(true)
            inputType = InputType.TYPE_TEXT_VARIATION_URI or InputType.TYPE_CLASS_TEXT
        }
        addressBar = input

        val connectBtn = Button(this).apply {
            text = "CONNECT TO STUDIO"
            textSize = 15f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#09090d"))
            setBackgroundColor(Color.parseColor("#00ff88"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                52.dp
            ).apply { bottomMargin = 10.dp }
        }
        connectBtn.setOnClickListener {
            var raw = addressBar.text.toString().trim()
            if (raw.isNotBlank()) {
                if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
                    raw = "http://$raw"
                }
                val uri = Uri.parse(raw)
                val url = if (uri.port == -1) {
                    "$raw:48273"
                } else {
                    raw
                }
                prefs.edit().putString("last_url", url).apply()
                openWebView(url)
            } else {
                Toast.makeText(this, "Please enter your PC's IP (e.g. 192.168.1.55:48273) or tap Auto-Detect", Toast.LENGTH_SHORT).show()
            }
        }

        val autoDetectBtn = Button(this).apply {
            text = "🔍 AUTO-DETECT STUDIO PC"
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#00ff88"))
            setBackgroundColor(Color.parseColor("#0d281e"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                48.dp
            ).apply { bottomMargin = 16.dp }
        }
        autoDetectBtn.setOnClickListener {
            startAutoDetect()
        }

        root.addView(input)
        root.addView(connectBtn)
        root.addView(autoDetectBtn)

        container.addView(root)
    }

    // ── WebView Screen UI ──────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun openWebView(url: String) {
        container.removeAllViews()

        WebView.setWebContentsDebuggingEnabled(true)

        webView = WebView(this).apply {
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            setBackgroundColor(Color.parseColor("#09090d"))

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                loadsImagesAutomatically = true
                cacheMode = WebSettings.LOAD_NO_CACHE
                @Suppress("DEPRECATION")
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                userAgentString = "CosmoShareApp/1.0 Android"
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                useWideViewPort = true
                loadWithOverviewMode = true
            }

            addJavascriptInterface(object {
                @JavascriptInterface
                fun downloadFile(url: String, fileName: String) {
                    downloadFilesDirectly(listOf(Pair(url, fileName)))
                }

                @JavascriptInterface
                fun downloadBatch(jsonArrayStr: String) {
                    try {
                        val arr = JSONArray(jsonArrayStr)
                        val items = mutableListOf<Pair<String, String>>()
                        for (i in 0 until arr.length()) {
                            val obj = arr.getJSONObject(i)
                            val u = obj.optString("url")
                            val n = obj.optString("name")
                            if (u.isNotBlank() && n.isNotBlank()) {
                                items.add(Pair(u, n))
                            }
                        }
                        if (items.isNotEmpty()) {
                            downloadFilesDirectly(items)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                @JavascriptInterface
                fun showToast(msg: String) {
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
                    }
                }

                @JavascriptInterface
                fun copyToClipboard(text: String) {
                    runOnUiThread {
                        try {
                            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                            val clip = android.content.ClipData.newPlainText("CosmoShare", text)
                            clipboard.setPrimaryClip(clip)
                            Toast.makeText(this@MainActivity, "📋 Copied to clipboard!", Toast.LENGTH_SHORT).show()
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                }
            }, "CosmoNative")

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                    android.util.Log.d("CosmoWebView", "${consoleMessage?.message()} -- line ${consoleMessage?.lineNumber()} of ${consoleMessage?.sourceId()}")
                    return true
                }

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    filePathCallback?.let { callback ->
                        uploadMessage?.onReceiveValue(null)
                        uploadMessage = callback
                        try {
                            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                                addCategory(Intent.CATEGORY_OPENABLE)
                                type = "*/*"
                                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                                putExtra("android.provider.extra.PICK_IMAGES_MAX", 1000)
                                putExtra("com.google.android.gms.provider.extra.PICK_IMAGES_MAX", 1000)
                            }
                            fileChooserLauncher.launch(intent)
                            return true
                        } catch (e: Exception) {
                            try {
                                val fallbackIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                                    addCategory(Intent.CATEGORY_OPENABLE)
                                    type = "*/*"
                                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                                    putExtra("android.provider.extra.PICK_IMAGES_MAX", 1000)
                                    putExtra("com.google.android.gms.provider.extra.PICK_IMAGES_MAX", 1000)
                                }
                                fileChooserLauncher.launch(fallbackIntent)
                                return true
                            } catch (e2: Exception) {
                                uploadMessage?.onReceiveValue(null)
                                uploadMessage = null
                                return false
                            }
                        }
                    }
                    return false
                }
            }

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                    super.onPageFinished(view, finishedUrl)
                    runOnUiThread {
                        loadingSpinner?.visibility = View.GONE
                    }
                }

                override fun onReceivedError(
                    view: WebView, request: WebResourceRequest, error: WebResourceError
                ) {
                    if (request.isForMainFrame) {
                        runOnUiThread {
                            buildConnectScreen("Could not reach Cosmo Symphony at $url.\n\nMake sure Cosmo Symphony is running on your PC and 'Wi-Fi Share' is active.")
                        }
                    }
                }

                override fun onReceivedSslError(
                    view: WebView, handler: SslErrorHandler, error: android.net.http.SslError
                ) {
                    if (isLocalLanUrl(error.url)) {
                        handler.proceed()
                    } else {
                        handler.cancel()
                    }
                }
            }

            setDownloadListener { downloadUrl, _, contentDisposition, _, _ ->
                val fileName = extractFileName(contentDisposition, downloadUrl)
                downloadFilesDirectly(listOf(Pair(downloadUrl, fileName)))
            }

            setBackgroundColor(Color.parseColor("#09090d"))
        }

        // ── Top Bar ──────────────────────────────────────────────────────────
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#0e131b"))
            setPadding(8.dp, 6.dp, 12.dp, 6.dp)
            elevation = 8.dp.toFloat()
        }

        var selectedSubDir = prefs.getString("phone_download_dir", Environment.DIRECTORY_DOWNLOADS) ?: Environment.DIRECTORY_DOWNLOADS

        val backBtn = TextView(this).apply {
            text = "← PC"
            textSize = 13f
            setTextColor(Color.parseColor("#00ff88"))
            setTypeface(null, Typeface.BOLD)
            setPadding(12.dp, 12.dp, 12.dp, 12.dp)
            minHeight = 48.dp
            gravity = Gravity.CENTER_VERTICAL
        }
        backBtn.setOnClickListener { buildConnectScreen() }

        val titleView = TextView(this).apply {
            text = "🎵 Cosmo Symphony Studio"
            textSize = 13f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
            ellipsize = TextUtils.TruncateAt.END
            maxLines = 1
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val reloadBtn = TextView(this).apply {
            text = "🔄"
            textSize = 15f
            setPadding(12.dp, 12.dp, 12.dp, 12.dp)
            minHeight = 48.dp
            gravity = Gravity.CENTER_VERTICAL
            setOnClickListener {
                loadingSpinner?.visibility = View.VISIBLE
                webView.clearCache(true)
                webView.reload()
                Toast.makeText(this@MainActivity, "Reloading studio...", Toast.LENGTH_SHORT).show()
            }
        }

        val folderBtn = TextView(this).apply {
            textSize = 12f
            setTextColor(Color.parseColor("#00ff88"))
            setPadding(8.dp, 12.dp, 8.dp, 12.dp)
            minHeight = 48.dp
            gravity = Gravity.CENTER_VERTICAL
        }
        folderBtnView = folderBtn
        updateFolderLabel()

        folderBtn.setOnClickListener {
            val options = arrayOf(
                "📥 Downloads",
                "🖼️ Pictures",
                "📷 DCIM (Camera)",
                "📄 Documents",
                "📂 Select Storage Folder (System Picker)...",
                "➕ Create New Custom Folder...",
                "🔄 Reset to Default Downloads"
            )
            AlertDialog.Builder(this@MainActivity)
                .setTitle("📁 Select Save Folder for Symphony Files")
                .setItems(options) { _, which ->
                    when (which) {
                        0 -> {
                            selectedSubDir = Environment.DIRECTORY_DOWNLOADS
                            prefs.edit().putString("phone_download_dir", selectedSubDir).apply()
                            prefs.edit().putString("custom_folder_name", "").apply()
                            prefs.edit().putString("custom_subfolder_name", "").apply()
                            updateFolderLabel()
                            Toast.makeText(this@MainActivity, "Folder set to: Downloads", Toast.LENGTH_SHORT).show()
                        }
                        1 -> {
                            selectedSubDir = Environment.DIRECTORY_PICTURES
                            prefs.edit().putString("phone_download_dir", selectedSubDir).apply()
                            prefs.edit().putString("custom_folder_name", "").apply()
                            prefs.edit().putString("custom_subfolder_name", "").apply()
                            updateFolderLabel()
                            Toast.makeText(this@MainActivity, "Folder set to: Pictures", Toast.LENGTH_SHORT).show()
                        }
                        2 -> {
                            selectedSubDir = Environment.DIRECTORY_DCIM
                            prefs.edit().putString("phone_download_dir", selectedSubDir).apply()
                            prefs.edit().putString("custom_folder_name", "").apply()
                            prefs.edit().putString("custom_subfolder_name", "").apply()
                            updateFolderLabel()
                            Toast.makeText(this@MainActivity, "Folder set to: DCIM", Toast.LENGTH_SHORT).show()
                        }
                        3 -> {
                            selectedSubDir = Environment.DIRECTORY_DOCUMENTS
                            prefs.edit().putString("phone_download_dir", selectedSubDir).apply()
                            prefs.edit().putString("custom_folder_name", "").apply()
                            prefs.edit().putString("custom_subfolder_name", "").apply()
                            updateFolderLabel()
                            Toast.makeText(this@MainActivity, "Folder set to: Documents", Toast.LENGTH_SHORT).show()
                        }
                        4 -> {
                            try {
                                folderPickerLauncher.launch(null)
                            } catch (e: Exception) {
                                Toast.makeText(this@MainActivity, "Storage picker error: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                        5 -> {
                            val input = EditText(this@MainActivity).apply {
                                hint = "e.g. Cosmo_Symphony_Media"
                                setPadding(16.dp, 12.dp, 16.dp, 12.dp)
                            }
                            AlertDialog.Builder(this@MainActivity)
                                .setTitle("➕ Create New Custom Folder")
                                .setMessage("Enter a folder name for incoming media:")
                                .setView(input)
                                .setPositiveButton("Create & Use") { _, _ ->
                                    val newFolderName = sanitizeFileName(input.text.toString().trim())
                                    if (newFolderName.isNotBlank()) {
                                        prefs.edit().putString("custom_subfolder_name", newFolderName).apply()
                                        updateFolderLabel()
                                        Toast.makeText(this@MainActivity, "Folder created & set to: ${getSaveDestinationPath()}", Toast.LENGTH_LONG).show()
                                    }
                                }
                                .setNegativeButton("Cancel", null)
                                .show()
                        }
                        6 -> {
                            selectedSubDir = Environment.DIRECTORY_DOWNLOADS
                            prefs.edit().putString("phone_download_dir", selectedSubDir).apply()
                            prefs.edit().putString("custom_folder_name", "").apply()
                            prefs.edit().putString("custom_subfolder_name", "").apply()
                            updateFolderLabel()
                            Toast.makeText(this@MainActivity, "Reset to Default Downloads", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
                .show()
        }

        topBar.addView(backBtn)
        topBar.addView(titleView)
        topBar.addView(reloadBtn)
        topBar.addView(folderBtn)

        val topBarId = View.generateViewId()
        topBar.id = topBarId
        topBar.layoutParams = RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            RelativeLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            addRule(RelativeLayout.ALIGN_PARENT_TOP)
        }

        val webContainer = RelativeLayout(this).apply {
            setBackgroundColor(Color.parseColor("#09090d"))
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        webContainer.addView(topBar)

        val webViewParams = RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            RelativeLayout.LayoutParams.MATCH_PARENT
        ).apply {
            addRule(RelativeLayout.BELOW, topBarId)
            addRule(RelativeLayout.ALIGN_PARENT_BOTTOM)
        }
        webContainer.addView(webView, webViewParams)

        // Loading Spinner
        loadingSpinner = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#cc09090d"))
            layoutParams = RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.MATCH_PARENT,
                RelativeLayout.LayoutParams.MATCH_PARENT
            ).apply {
                addRule(RelativeLayout.BELOW, topBarId)
            }
            val pb = ProgressBar(this@MainActivity).apply {
                indeterminateTintList = ColorStateList.valueOf(Color.parseColor("#00ff88"))
            }
            val txt = TextView(this@MainActivity).apply {
                text = "Connecting to Cosmo Symphony Studio..."
                setTextColor(Color.parseColor("#00ff88"))
                textSize = 13f
                setPadding(0, 16.dp, 0, 0)
            }
            addView(pb)
            addView(txt)
        }
        webContainer.addView(loadingSpinner)

        container.addView(webContainer)
        webView.clearCache(true)
        webView.loadUrl(url)
    }

    private fun extractFileName(
        contentDisposition: String?,
        fallbackUrl: String
    ): String {
        if (!contentDisposition.isNullOrBlank()) {
            val regex = Regex("""filename[*]?=["']?([^"';\r\n]+)""", RegexOption.IGNORE_CASE)
            regex.find(contentDisposition)?.groupValues?.getOrNull(1)
                ?.trim()
                ?.let { return sanitizeFileName(URLDecoder.decode(it, "UTF-8")) }
        }
        val rawPath = Uri.parse(fallbackUrl).lastPathSegment ?: "cosmo-download"
        return sanitizeFileName(rawPath)
    }

    private fun showError(message: String) {
        if (!isFinishing) {
            AlertDialog.Builder(this)
                .setTitle("Connection Error")
                .setMessage(message)
                .setPositiveButton("Back") { _, _ -> buildConnectScreen() }
                .show()
        }
    }

    private fun hideSystemBars() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.decorView.post {
                    window.insetsController?.let { controller ->
                        controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                        controller.systemBarsBehavior =
                            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    }
                }
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = (
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                or View.SYSTEM_UI_FLAG_FULLSCREEN
                        )
            }
        } catch (_: Exception) {}
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemBars()
        }
    }

    private fun startAutoDetect() {
        Toast.makeText(this, "Scanning local Wi-Fi for Cosmo Symphony...", Toast.LENGTH_SHORT).show()
        autoDiscoverPc(
            onFound = { foundUrl ->
                prefs.edit().putString("last_url", foundUrl).apply()
                Toast.makeText(this, "✅ Found Studio PC at $foundUrl", Toast.LENGTH_SHORT).show()
                openWebView(foundUrl)
            },
            onNotFound = {
                Toast.makeText(this, "Could not find Cosmo Symphony on local network. Check PC IP or Wi-Fi.", Toast.LENGTH_LONG).show()
                buildConnectScreen("Auto-detection finished. No Cosmo Symphony instance found on local subnet. Verify your PC is on the same Wi-Fi and Wi-Fi Share is running.")
            }
        )
    }

    private fun autoDiscoverPc(onFound: (String) -> Unit, onNotFound: () -> Unit) {
        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as? android.net.wifi.WifiManager
        val ipInt = wm?.connectionInfo?.ipAddress ?: 0
        val baseIp = if (ipInt != 0) {
            String.format(
                java.util.Locale.US,
                "%d.%d.%d.",
                ipInt and 0xff,
                ipInt shr 8 and 0xff,
                ipInt shr 16 and 0xff
            )
        } else {
            "192.168.1."
        }

        val scanExecutor = Executors.newFixedThreadPool(32)
        val found = java.util.concurrent.atomic.AtomicBoolean(false)
        val pending = AtomicInteger(254)

        for (i in 1..254) {
            val candidateIp = "$baseIp$i"
            scanExecutor.execute {
                if (!found.get()) {
                    try {
                        val socket = java.net.Socket()
                        socket.connect(java.net.InetSocketAddress(candidateIp, 48273), 400)
                        socket.close()
                        if (found.compareAndSet(false, true)) {
                            val targetUrl = "http://$candidateIp:48273"
                            runOnUiThread { onFound(targetUrl) }
                        }
                    } catch (_: Exception) {
                    }
                }
                if (pending.decrementAndGet() == 0 && !found.get()) {
                    runOnUiThread { onNotFound() }
                }
            }
        }
        scanExecutor.shutdown()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized) {
            webView.evaluateJavascript("Boolean(window.__cosmoExitSolo && window.__cosmoExitSolo())") { result ->
                if (result == "true") {
                    return@evaluateJavascript
                }
                runOnUiThread {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        buildConnectScreen()
                    }
                }
            }
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onPause() {
        super.onPause()
        if (::webView.isInitialized) webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
        hideSystemBars()
    }

    override fun onDestroy() {
        super.onDestroy()
        transferExecutor.shutdownNow()
    }
}
