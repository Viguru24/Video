package com.cosmo.symphony.companion

import android.app.Activity
import android.app.AlertDialog
import android.content.SharedPreferences
import android.os.Environment
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher

object StorageFolderDialog {

    private val Int.dp: (Activity) -> Int
        get() = { activity -> (this * activity.resources.displayMetrics.density).toInt() }

    fun show(
        activity: Activity,
        prefs: SharedPreferences,
        updateManager: AppUpdateManager,
        folderPickerLauncher: ActivityResultLauncher<android.net.Uri?>,
        onFolderChanged: () -> Unit,
        onCheckUpdates: () -> Unit
    ) {
        val options = arrayOf(
            "📥 Downloads",
            "🖼️ Pictures",
            "📷 DCIM (Camera)",
            "📄 Documents",
            "📂 Select Storage Folder (System Picker)...",
            "➕ Create New Custom Folder...",
            "🔄 Reset to Default Downloads",
            "🚀 Check for Updates (v${updateManager.currentVersionName})"
        )

        AlertDialog.Builder(activity)
            .setTitle("📁 Companion Settings & Storage")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> setPredefined(activity, prefs, Environment.DIRECTORY_DOWNLOADS, "Downloads", onFolderChanged)
                    1 -> setPredefined(activity, prefs, Environment.DIRECTORY_PICTURES, "Pictures", onFolderChanged)
                    2 -> setPredefined(activity, prefs, Environment.DIRECTORY_DCIM, "DCIM", onFolderChanged)
                    3 -> setPredefined(activity, prefs, Environment.DIRECTORY_DOCUMENTS, "Documents", onFolderChanged)
                    4 -> {
                        try {
                            folderPickerLauncher.launch(null)
                        } catch (e: Exception) {
                            Toast.makeText(activity, "Storage picker error: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    }
                    5 -> promptNewCustomFolder(activity, prefs, onFolderChanged)
                    6 -> setPredefined(activity, prefs, Environment.DIRECTORY_DOWNLOADS, "Default Downloads", onFolderChanged)
                    7 -> onCheckUpdates()
                }
            }
            .show()
    }

    private fun setPredefined(
        activity: Activity,
        prefs: SharedPreferences,
        dir: String,
        name: String,
        onFolderChanged: () -> Unit
    ) {
        prefs.edit().putString("phone_download_dir", dir).apply()
        prefs.edit().putString("custom_folder_name", "").apply()
        prefs.edit().putString("custom_subfolder_name", "").apply()
        onFolderChanged()
        Toast.makeText(activity, "Folder set to: $name", Toast.LENGTH_SHORT).show()
    }

    private fun promptNewCustomFolder(
        activity: Activity,
        prefs: SharedPreferences,
        onFolderChanged: () -> Unit
    ) {
        val density = activity.resources.displayMetrics.density
        val pad16 = (16 * density).toInt()
        val pad12 = (12 * density).toInt()

        val input = EditText(activity).apply {
            hint = "e.g. Cosmo_Symphony_Media"
            setPadding(pad16, pad12, pad16, pad12)
        }

        AlertDialog.Builder(activity)
            .setTitle("➕ Create New Custom Folder")
            .setMessage("Enter a folder name for incoming media:")
            .setView(input)
            .setPositiveButton("Create & Use") { _, _ ->
                val newFolderName = FileTransferUtils.sanitizeFileName(input.text.toString().trim())
                if (newFolderName.isNotBlank()) {
                    prefs.edit().putString("custom_subfolder_name", newFolderName).apply()
                    onFolderChanged()
                    Toast.makeText(activity, "Folder created & set to: $newFolderName", Toast.LENGTH_LONG).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
