package com.cosmo.symphony.companion

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
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
import androidx.documentfile.provider.DocumentFile
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var addressBar: EditText
    private lateinit var container: FrameLayout

    private var uploadMessage: ValueCallback<Array<Uri>>? = null
    private var folderBtnView: TextView? = null

    private val prefs by lazy { getSharedPreferences("cosmo_symphony_companion", Context.MODE_PRIVATE) }
    private val transferEngine by lazy { TransferEngine(this, { container }, prefs) }
    private val updateManager by lazy { AppUpdateManager(this, "cosmo-companion") }

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
            val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            try {
                contentResolver.takePersistableUriPermission(uri, takeFlags)
            } catch (e: Exception) {
                android.util.Log.w("CosmoSAF", "Persistable permission warning: ${e.message}")
            }

            val doc = DocumentFile.fromTreeUri(this, uri) ?: DocumentFile.fromTreeUri(applicationContext, uri)
            if (doc != null && doc.canWrite()) {
                val rawSegment = Uri.decode(uri.lastPathSegment ?: "")
                val folderName = SafStorageHelper.sanitizeFileName(
                    if (rawSegment.contains(":")) rawSegment.substringAfterLast(":") else rawSegment
                ).ifBlank { "Selected Folder" }

                prefs.edit()
                    .putString("custom_tree_uri", uri.toString())
                    .putString("custom_folder_name", folderName)
                    .putString("custom_subfolder_name", "")
                    .apply()
                folderBtnView?.let { SafStorageHelper.updateFolderLabel(prefs, it) }

                Toast.makeText(this, "✅ Target Folder set to: $folderName", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "⚠️ Selected folder is not writable. Please choose a writable directory.", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun uploadUrisDirectly(uriList: List<Uri>) {
        transferEngine.uploadUrisDirectly(uriList) {
            if (::webView.isInitialized) webView else null
        }
    }

    private fun downloadFilesDirectly(files: List<Pair<String, String>>) {
        transferEngine.downloadFilesDirectly(files)
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

        // Check for OTA Updates in background
        checkOtaUpdates(silent = true)
    }

    private fun checkOtaUpdates(silent: Boolean = false) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (!silent) {
                    runOnUiThread { Toast.makeText(this@MainActivity, "Checking for updates...", Toast.LENGTH_SHORT).show() }
                }
                val update = updateManager.checkForUpdates()
                if (update != null) {
                    withContext(Dispatchers.Main) {
                        showUpdateDialog(update)
                    }
                } else if (!silent) {
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "You have the latest version (v${updateManager.currentVersionName})", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                if (!silent) {
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "Could not reach update server.", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun showUpdateDialog(update: UpdateInfo) {
        val dialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("🚀 Update Available (v${update.versionName})")
            .setMessage("${update.releaseNotes}\n\nWould you like to download and install this update now?")
            .setPositiveButton("Update Now", null)
            .setNegativeButton("Later") { d, _ -> d.dismiss() }
            .create()

        dialog.setOnShowListener {
            val btn = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            btn.setOnClickListener {
                btn.isEnabled = false
                dialog.setMessage("Downloading update...\nPlease wait.")
                lifecycleScope.launch(Dispatchers.IO) {
                    val success = updateManager.downloadAndInstallUpdate(update.apkUrl) { progress ->
                        val pct = (progress * 100).toInt()
                        runOnUiThread {
                            dialog.setMessage("Downloading update: $pct%\nPlease wait.")
                        }
                    }
                    if (!success) {
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "Update download failed. Please check network.", Toast.LENGTH_LONG).show()
                            dialog.dismiss()
                        }
                    } else {
                        runOnUiThread { dialog.dismiss() }
                    }
                }
            }
        }
        dialog.show()
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

        val phoneIp = NetworkDiscoveryHelper.getLocalDeviceIp()
        val ipStatusText = TextView(this).apply {
            text = if (phoneIp != null) "📡 Connected to Wi-Fi ($phoneIp)" else "⚠️ Wi-Fi not connected (LAN sync needs Wi-Fi)"
            textSize = 11f
            setTextColor(if (phoneIp != null) Color.parseColor("#38bdf8") else Color.parseColor("#f87171"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16.dp)
        }
        root.addView(ipStatusText)

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

        val otaBtn = Button(this).apply {
            text = "🚀 CHECK FOR OTA UPDATES"
            textSize = 12f
            setTextColor(Color.parseColor("#94a3b8"))
            setBackgroundColor(Color.parseColor("#141923"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                42.dp
            ).apply { bottomMargin = 12.dp }
        }
        otaBtn.setOnClickListener {
            checkOtaUpdates(silent = false)
        }

        root.addView(input)
        root.addView(connectBtn)
        root.addView(autoDetectBtn)
        root.addView(otaBtn)

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
                    if (SafStorageHelper.isLocalLanUrl(error.url)) {
                        handler.proceed()
                    } else {
                        handler.cancel()
                    }
                }
            }

            setDownloadListener { downloadUrl, _, contentDisposition, _, _ ->
                val fileName = SafStorageHelper.extractFileName(contentDisposition, downloadUrl)
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
        SafStorageHelper.updateFolderLabel(prefs, folderBtn)

        folderBtn.setOnClickListener {
            val options = arrayOf(
                "📥 Downloads (/Download)",
                "🖼️ Pictures (/Pictures)",
                "📷 DCIM (/DCIM)",
                "📄 Documents (/Documents)",
                "🎬 Movies (/Movies)",
                "📂 Custom Folder (System Picker)...",
                "➕ Set Subfolder Name...",
                "🔄 Reset to Default Downloads",
                "🚀 Check for Updates (v${updateManager.currentVersionName})"
            )
            AlertDialog.Builder(this@MainActivity)
                .setTitle("📁 Companion Storage Destination")
                .setItems(options) { _, which ->
                    when (which) {
                        0 -> {
                            selectedSubDir = Environment.DIRECTORY_DOWNLOADS
                            prefs.edit()
                                .putString("phone_download_dir", selectedSubDir)
                                .putString("custom_tree_uri", "")
                                .putString("custom_folder_name", "")
                                .putString("custom_subfolder_name", "")
                                .apply()
                            SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                            Toast.makeText(this@MainActivity, "Destination set to: Downloads", Toast.LENGTH_SHORT).show()
                        }
                        1 -> {
                            selectedSubDir = Environment.DIRECTORY_PICTURES
                            prefs.edit()
                                .putString("phone_download_dir", selectedSubDir)
                                .putString("custom_tree_uri", "")
                                .putString("custom_folder_name", "")
                                .putString("custom_subfolder_name", "")
                                .apply()
                            SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                            Toast.makeText(this@MainActivity, "Destination set to: Pictures", Toast.LENGTH_SHORT).show()
                        }
                        2 -> {
                            selectedSubDir = Environment.DIRECTORY_DCIM
                            prefs.edit()
                                .putString("phone_download_dir", selectedSubDir)
                                .putString("custom_tree_uri", "")
                                .putString("custom_folder_name", "")
                                .putString("custom_subfolder_name", "")
                                .apply()
                            SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                            Toast.makeText(this@MainActivity, "Destination set to: DCIM", Toast.LENGTH_SHORT).show()
                        }
                        3 -> {
                            selectedSubDir = Environment.DIRECTORY_DOCUMENTS
                            prefs.edit()
                                .putString("phone_download_dir", selectedSubDir)
                                .putString("custom_tree_uri", "")
                                .putString("custom_folder_name", "")
                                .putString("custom_subfolder_name", "")
                                .apply()
                            SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                            Toast.makeText(this@MainActivity, "Destination set to: Documents", Toast.LENGTH_SHORT).show()
                        }
                        4 -> {
                            selectedSubDir = Environment.DIRECTORY_MOVIES
                            prefs.edit()
                                .putString("phone_download_dir", selectedSubDir)
                                .putString("custom_tree_uri", "")
                                .putString("custom_folder_name", "")
                                .putString("custom_subfolder_name", "")
                                .apply()
                            SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                            Toast.makeText(this@MainActivity, "Destination set to: Movies", Toast.LENGTH_SHORT).show()
                        }
                        5 -> {
                            try {
                                folderPickerLauncher.launch(null)
                            } catch (e: Exception) {
                                Toast.makeText(this@MainActivity, "Storage picker error: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                        6 -> {
                            val input = EditText(this@MainActivity).apply {
                                hint = "e.g. CosmoShare"
                                setText(prefs.getString("custom_subfolder_name", "") ?: "")
                                setPadding(16.dp, 12.dp, 16.dp, 12.dp)
                            }
                            AlertDialog.Builder(this@MainActivity)
                                .setTitle("➕ Set Subfolder Name")
                                .setMessage("Files will be saved in ${SafStorageHelper.getSaveDestinationPath(prefs)}/[subfolder]:")
                                .setView(input)
                                .setPositiveButton("Set") { _, _ ->
                                    val newFolderName = SafStorageHelper.sanitizeFileName(input.text.toString().trim())
                                    prefs.edit().putString("custom_subfolder_name", newFolderName).apply()
                                    SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                                    Toast.makeText(this@MainActivity, "Destination: ${SafStorageHelper.getSaveDestinationPath(prefs)}", Toast.LENGTH_LONG).show()
                                }
                                .setNegativeButton("Clear Subfolder") { _, _ ->
                                    prefs.edit().putString("custom_subfolder_name", "").apply()
                                    SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                                    Toast.makeText(this@MainActivity, "Subfolder cleared. Destination: ${SafStorageHelper.getSaveDestinationPath(prefs)}", Toast.LENGTH_SHORT).show()
                                }
                                .show()
                        }
                        7 -> {
                            selectedSubDir = Environment.DIRECTORY_DOWNLOADS
                            prefs.edit()
                                .putString("phone_download_dir", selectedSubDir)
                                .putString("custom_tree_uri", "")
                                .putString("custom_folder_name", "")
                                .putString("custom_subfolder_name", "")
                                .apply()
                            SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                            Toast.makeText(this@MainActivity, "Reset to Default Downloads", Toast.LENGTH_SHORT).show()
                        }
                        8 -> {
                            checkOtaUpdates(silent = false)
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
        val myIp = NetworkDiscoveryHelper.getLocalDeviceIp() ?: "unknown"
        Toast.makeText(this, "Scanning local Wi-Fi for Cosmo Symphony (Device: $myIp)...", Toast.LENGTH_SHORT).show()
        NetworkDiscoveryHelper.autoDiscoverPc(
            prefs,
            onFound = { foundUrl ->
                runOnUiThread {
                    prefs.edit().putString("last_url", foundUrl).apply()
                    Toast.makeText(this, "✅ Connected to Studio PC at $foundUrl", Toast.LENGTH_SHORT).show()
                    openWebView(foundUrl)
                }
            },
            onNotFound = {
                runOnUiThread {
                    Toast.makeText(this, "Could not find Cosmo Symphony on local network. Check PC IP or Wi-Fi.", Toast.LENGTH_LONG).show()
                    buildConnectScreen("Auto-detection finished. No Cosmo Symphony instance found on local subnet ($myIp).\n\n1. Verify PC & Phone are on the same Wi-Fi router\n2. Verify Wi-Fi Share is opened in Cosmo Symphony on PC\n3. Or manually enter your PC's IP address above.")
                }
            }
        )
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
        transferEngine.shutdown()
    }
}
