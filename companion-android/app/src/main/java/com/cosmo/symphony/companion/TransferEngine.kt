package com.cosmo.symphony.companion

import android.app.Activity
import android.content.SharedPreferences
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import java.io.OutputStreamWriter
import java.io.PrintWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class TransferEngine(
    private val activity: Activity,
    private val containerProvider: () -> FrameLayout,
    private val prefs: SharedPreferences
) {
    val transferExecutor = Executors.newFixedThreadPool(4)

    private val Int.dp: Int
        get() = (this * activity.resources.displayMetrics.density).toInt()

    // ── Visual HUD Overlay (WCAG 2.1 Accessible & Micro-Animated) ──────────
    private var hudOverlay: LinearLayout? = null
    private var hudTitle: TextView? = null
    private var hudSub: TextView? = null
    private var hudProgressBar: ProgressBar? = null
    private val lastHudUpdateMs = AtomicLong(0L)

    private fun setupProgressHUD() {
        val container = containerProvider()
        if (hudOverlay != null) {
            if (hudOverlay?.parent == null) {
                container.addView(hudOverlay)
            }
            hudOverlay?.bringToFront()
            return
        }

        hudTitle = TextView(activity).apply {
            textSize = 14f
            setTextColor(Color.parseColor("#00ff88"))
            setTypeface(null, Typeface.BOLD)
            text = "🎵 Ingesting into Cosmo Symphony..."
        }

        hudSub = TextView(activity).apply {
            textSize = 11f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, 4.dp, 0, 8.dp)
            text = "Preparing media stream..."
            ellipsize = TextUtils.TruncateAt.END
            maxLines = 1
        }

        hudProgressBar = ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            progressTintList = ColorStateList.valueOf(Color.parseColor("#00ff88"))
            progressBackgroundTintList = ColorStateList.valueOf(Color.parseColor("#064e3b"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                16.dp
            )
        }

        hudOverlay = LinearLayout(activity).apply {
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

    fun updateProgressHUD(completed: Int, total: Int, currentFileName: String) {
        val now = System.currentTimeMillis()
        if (completed < total && now - lastHudUpdateMs.get() < 16) return
        lastHudUpdateMs.set(now)

        activity.runOnUiThread {
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

    fun hideProgressHUD(message: String, isSuccess: Boolean = true) {
        activity.runOnUiThread {
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

    fun uploadUrisDirectly(uriList: List<Uri>, webViewProvider: () -> WebView?) {
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
                val fileName = SafStorageHelper.queryFileName(activity.contentResolver, uri)
                try {
                    val mimeType = activity.contentResolver.getType(uri) ?: "application/octet-stream"
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

                    activity.contentResolver.openInputStream(uri)?.use { inputStream ->
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
                            activity.runOnUiThread {
                                webViewProvider()?.reload()
                            }
                        } else {
                            hideProgressHUD("⚠️ Upload failed: Could not connect to PC Studio ($serverUrl)", false)
                        }
                    }
                }
            }
        }
    }

    fun downloadFilesDirectly(files: List<Pair<String, String>>) {
        if (files.isEmpty()) return

        val total = files.size
        val completedCount = AtomicInteger(0)
        val successCount = AtomicInteger(0)

        updateProgressHUD(0, total, "Downloading from PC…")

        for ((downloadUrl, fileName) in files) {
            val cleanName = SafStorageHelper.sanitizeFileName(fileName)
            transferExecutor.execute {
                try {
                    val url = URL(downloadUrl)
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 15000
                    conn.readTimeout = 60000

                    if (conn.responseCode in 200..299) {
                        val saved = conn.inputStream.use { input ->
                            SafStorageHelper.saveStreamToSelectedDestination(activity, prefs, input, cleanName)
                        }
                        if (saved) {
                            successCount.incrementAndGet()
                        }
                    }
                    conn.disconnect()
                } catch (e: Exception) {
                    e.printStackTrace()
                } finally {
                    val currentCompleted = completedCount.incrementAndGet()
                    updateProgressHUD(currentCompleted, total, cleanName)
                    if (currentCompleted == total) {
                        val successes = successCount.get()
                        val destName = SafStorageHelper.getSaveDestinationPath(prefs)
                        if (successes > 0) {
                            hideProgressHUD("🎉 Complete! $successes of $total files saved.")
                            activity.runOnUiThread {
                                Toast.makeText(activity, "✅ Saved $successes file(s) to $destName!", Toast.LENGTH_LONG).show()
                            }
                        } else {
                            hideProgressHUD("⚠️ Failed to save files to $destName", false)
                            activity.runOnUiThread {
                                Toast.makeText(activity, "⚠️ Download failed. Please check network/storage.", Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                }
            }
        }
    }

    fun shutdown() {
        transferExecutor.shutdownNow()
    }
}
