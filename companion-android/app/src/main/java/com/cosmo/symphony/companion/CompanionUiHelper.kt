package com.cosmo.symphony.companion

import android.app.Activity
import android.app.AlertDialog
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Environment
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.*

private data class StoragePreset(val label: String, val directory: String, val toastName: String)

private val STORAGE_PRESETS = listOf(
    StoragePreset("📥 Downloads (/Download)", Environment.DIRECTORY_DOWNLOADS, "Downloads"),
    StoragePreset("🖼️ Pictures (/Pictures)", Environment.DIRECTORY_PICTURES, "Pictures"),
    StoragePreset("📷 DCIM (/DCIM)", Environment.DIRECTORY_DCIM, "DCIM"),
    StoragePreset("📄 Documents (/Documents)", Environment.DIRECTORY_DOCUMENTS, "Documents"),
    StoragePreset("🎬 Movies (/Movies)", Environment.DIRECTORY_MOVIES, "Movies")
)

private fun dp(activity: Activity, value: Int): Int =
    (value * activity.resources.displayMetrics.density).toInt()

/**
 * Helpers for building the Companion LAN connect screen and storage destination chooser dialog.
 */
object CompanionUiHelper {

    data class ConnectScreenResult(val rootView: View, val addressBar: EditText)

    fun buildConnectScreenView(
        activity: Activity,
        prefs: SharedPreferences,
        errorMessage: String?,
        onConnectUrl: (String) -> Unit,
        onAutoDetect: () -> Unit,
        onCheckOta: () -> Unit
    ): ConnectScreenResult {
        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#09090d"))
            val pad = dp(activity, 32)
            setPadding(pad, pad, pad, pad)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        val badge = TextView(activity).apply {
            text = "🎵 COSMO SYMPHONY"
            textSize = 12f
            setTextColor(Color.parseColor("#00ff88"))
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(activity, 4))
        }

        val title = TextView(activity).apply {
            text = "Companion Share"
            textSize = 28f
            setTextColor(Color.WHITE)
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(activity, 8))
        }

        val subtitle = TextView(activity).apply {
            text = "Connect to your PC Studio running Cosmo Symphony"
            textSize = 13f
            setTextColor(Color.parseColor("#94a3b8"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(activity, 24))
        }

        root.addView(badge)
        root.addView(title)
        root.addView(subtitle)

        val phoneIp = NetworkDiscoveryHelper.getLocalDeviceIp()
        val ipStatusText = TextView(activity).apply {
            text = if (phoneIp != null) "📡 Connected to Wi-Fi ($phoneIp)" else "⚠️ Wi-Fi not connected (LAN sync needs Wi-Fi)"
            textSize = 11f
            setTextColor(if (phoneIp != null) Color.parseColor("#38bdf8") else Color.parseColor("#f87171"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(activity, 16))
        }
        root.addView(ipStatusText)

        if (!errorMessage.isNullOrBlank()) {
            val errorBox = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.parseColor("#2a1215"))
                setPadding(dp(activity, 16), dp(activity, 12), dp(activity, 16), dp(activity, 12))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = dp(activity, 20) }
            }
            val errTitle = TextView(activity).apply {
                text = "⚠️ Connection Issue"
                textSize = 13f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.parseColor("#ff6b6b"))
            }
            val errDesc = TextView(activity).apply {
                text = errorMessage
                textSize = 12f
                setTextColor(Color.parseColor("#fca5a5"))
                setPadding(0, dp(activity, 4), 0, 0)
            }
            errorBox.addView(errTitle)
            errorBox.addView(errDesc)
            root.addView(errorBox)
        }

        val savedUrl = prefs.getString("last_url", "") ?: ""
        val displayUrl = if (savedUrl.contains("192.168.1.54") || savedUrl.contains(":8765")) "" else savedUrl

        val input = EditText(activity).apply {
            hint = "Enter PC IP (e.g. http://192.168.x.x:48273)"
            setText(displayUrl)
            setHintTextColor(Color.parseColor("#475569"))
            setTextColor(Color.WHITE)
            textSize = 16f
            setBackgroundColor(Color.parseColor("#141923"))
            val pad = dp(activity, 16)
            setPadding(pad, pad, pad, pad)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(activity, 10) }
            setSingleLine(true)
            inputType = InputType.TYPE_TEXT_VARIATION_URI or InputType.TYPE_CLASS_TEXT
        }

        val tokenInput = EditText(activity).apply {
            hint = "Pairing Token (from PC QR or Share window)"
            setText(prefs.getString("wifi_token", "") ?: "")
            setHintTextColor(Color.parseColor("#475569"))
            setTextColor(Color.parseColor("#00ff88"))
            textSize = 14f
            setBackgroundColor(Color.parseColor("#141923"))
            setPadding(dp(activity, 16), dp(activity, 14), dp(activity, 16), dp(activity, 14))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(activity, 12) }
            setSingleLine(true)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        }

        val connectBtn = Button(activity).apply {
            text = "CONNECT TO STUDIO"
            textSize = 15f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#09090d"))
            setBackgroundColor(Color.parseColor("#00ff88"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(activity, 52)
            ).apply { bottomMargin = dp(activity, 10) }
        }
        connectBtn.setOnClickListener {
            var raw = input.text.toString().trim()
            val manualToken = tokenInput.text.toString().trim()
            if (manualToken.isNotBlank()) {
                prefs.edit().putString("wifi_token", manualToken).apply()
            }
            if (raw.isNotBlank()) {
                if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
                    raw = "http://$raw"
                }
                val uri = Uri.parse(raw)
                val url = if (uri.port == -1) "$raw:48273" else raw
                onConnectUrl(url)
            } else {
                Toast.makeText(activity, "Please enter your PC's IP or tap Auto-Detect", Toast.LENGTH_SHORT).show()
            }
        }

        val autoDetectBtn = Button(activity).apply {
            text = "🔍 AUTO-DETECT STUDIO PC"
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#00ff88"))
            setBackgroundColor(Color.parseColor("#0d281e"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(activity, 48)
            ).apply { bottomMargin = dp(activity, 16) }
        }
        autoDetectBtn.setOnClickListener {
            val manualToken = tokenInput.text.toString().trim()
            if (manualToken.isNotBlank()) {
                prefs.edit().putString("wifi_token", manualToken).apply()
            }
            onAutoDetect()
        }

        val otaBtn = Button(activity).apply {
            text = "🚀 CHECK FOR OTA UPDATES"
            textSize = 12f
            setTextColor(Color.parseColor("#94a3b8"))
            setBackgroundColor(Color.parseColor("#141923"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(activity, 42)
            ).apply { bottomMargin = dp(activity, 12) }
        }
        otaBtn.setOnClickListener { onCheckOta() }

        root.addView(input)
        root.addView(tokenInput)
        root.addView(connectBtn)
        root.addView(autoDetectBtn)
        root.addView(otaBtn)

        return ConnectScreenResult(root, input)
    }

    fun showStorageDestinationDialog(
        activity: Activity,
        prefs: SharedPreferences,
        folderBtn: TextView,
        appVersionName: String,
        onLaunchFolderPicker: () -> Unit,
        onCheckOta: () -> Unit
    ) {
        val options = (STORAGE_PRESETS.map { it.label } + listOf(
            "📂 Custom Folder (System Picker)...",
            "➕ Set Subfolder Name...",
            "🔄 Reset to Default Downloads",
            "🚀 Check for Updates (v$appVersionName)"
        )).toTypedArray()

        fun applyStandardDir(dir: String, toastMessage: String) {
            prefs.edit()
                .putString("phone_download_dir", dir)
                .putString("custom_tree_uri", "")
                .putString("custom_folder_name", "")
                .putString("custom_subfolder_name", "")
                .apply()
            SafStorageHelper.updateFolderLabel(prefs, folderBtn)
            Toast.makeText(activity, toastMessage, Toast.LENGTH_SHORT).show()
        }

        AlertDialog.Builder(activity)
            .setTitle("📁 Companion Storage Destination")
            .setItems(options) { _, which ->
                if (which < STORAGE_PRESETS.size) {
                    val preset = STORAGE_PRESETS[which]
                    applyStandardDir(preset.directory, "Destination set to: ${preset.toastName}")
                    return@setItems
                }
                when (which - STORAGE_PRESETS.size) {
                    0 -> {
                        try {
                            onLaunchFolderPicker()
                        } catch (e: Exception) {
                            Toast.makeText(activity, "Storage picker error: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    }
                    1 -> {
                        val input = EditText(activity).apply {
                            hint = "e.g. CosmoShare"
                            setText(prefs.getString("custom_subfolder_name", "") ?: "")
                            setPadding(dp(activity, 16), dp(activity, 12), dp(activity, 16), dp(activity, 12))
                        }
                        AlertDialog.Builder(activity)
                            .setTitle("➕ Set Subfolder Name")
                            .setMessage("Files will be saved in ${SafStorageHelper.getSaveDestinationPath(prefs)}/[subfolder]:")
                            .setView(input)
                            .setPositiveButton("Set") { _, _ ->
                                val newFolderName = SafStorageHelper.sanitizeFileName(input.text.toString().trim())
                                prefs.edit().putString("custom_subfolder_name", newFolderName).apply()
                                SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                                Toast.makeText(activity, "Destination: ${SafStorageHelper.getSaveDestinationPath(prefs)}", Toast.LENGTH_LONG).show()
                            }
                            .setNegativeButton("Clear Subfolder") { _, _ ->
                                prefs.edit().putString("custom_subfolder_name", "").apply()
                                SafStorageHelper.updateFolderLabel(prefs, folderBtn)
                                Toast.makeText(activity, "Subfolder cleared. Destination: ${SafStorageHelper.getSaveDestinationPath(prefs)}", Toast.LENGTH_SHORT).show()
                            }
                            .show()
                    }
                    2 -> applyStandardDir(Environment.DIRECTORY_DOWNLOADS, "Reset to Default Downloads")
                    3 -> onCheckOta()
                }
            }
            .show()
    }
}
