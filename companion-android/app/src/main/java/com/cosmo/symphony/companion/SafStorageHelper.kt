package com.cosmo.symphony.companion

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.SharedPreferences
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import android.widget.TextView
import androidx.documentfile.provider.DocumentFile
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.URLDecoder

object SafStorageHelper {

    /**
     * Sanitizes incoming filenames to prevent Directory Traversal attacks (OWASP A01:2021).
     */
    fun sanitizeFileName(rawName: String): String {
        var clean = File(rawName).name
        clean = clean.replace(Regex("""[\\/:\*\?"<>\|]"""), "_").trim()
        return clean.ifBlank { "download_${System.currentTimeMillis()}" }
    }

    /**
     * Restricts SSL bypass strictly to local LAN IP subnets.
     */
    fun isLocalLanUrl(urlStr: String): Boolean {
        val host = Uri.parse(urlStr).host ?: return false
        return host == "127.0.0.1" || host == "localhost" ||
                host.startsWith("192.168.") || host.startsWith("10.") ||
                Regex("""^172\.(1[6-9]|2[0-9]|3[0-1])\.""").containsMatchIn(host)
    }

    fun queryFileName(contentResolver: ContentResolver, uri: Uri): String {
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

    /**
     * O(log N) Binary-Probe Unique File Deduplication algorithm.
     */
    fun getUniqueDestinationFile(targetDir: File, rawFileName: String): File {
        val fileName = sanitizeFileName(rawFileName)
        val destFile = File(targetDir, fileName)
        if (!destFile.exists()) return destFile

        val dotIndex = fileName.lastIndexOf('.')
        val baseName = if (dotIndex != -1) fileName.substring(0, dotIndex) else fileName
        val extension = if (dotIndex != -1) fileName.substring(dotIndex) else ""

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

    fun getMimeTypeForName(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        if (ext.isNotBlank()) {
            val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
            if (!mime.isNullOrBlank()) return mime
        }
        return when (ext) {
            "mp4", "m4v" -> "video/mp4"
            "mov" -> "video/quicktime"
            "webm" -> "video/webm"
            "mkv" -> "video/x-matroska"
            "avi" -> "video/x-msvideo"
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            "aac" -> "audio/aac"
            "m4a" -> "audio/mp4"
            "pdf" -> "application/pdf"
            else -> "application/octet-stream"
        }
    }

    fun saveStreamToSelectedDestination(
        context: Context,
        prefs: SharedPreferences,
        inputStream: InputStream,
        cleanName: String
    ): Boolean {
        val contentResolver = context.contentResolver

        // Tier 1: User selected custom folder via System Storage Access Framework (SAF tree Uri)
        val treeUriStr = prefs.getString("custom_tree_uri", null)
        if (!treeUriStr.isNullOrBlank()) {
            try {
                val treeUri = Uri.parse(treeUriStr)
                val rootDoc = DocumentFile.fromTreeUri(context, treeUri)
                    ?: DocumentFile.fromTreeUri(context.applicationContext, treeUri)
                if (rootDoc != null && rootDoc.canWrite()) {
                    val subFolder = prefs.getString("custom_subfolder_name", "")?.trim() ?: ""
                    val targetDoc = if (subFolder.isNotBlank()) {
                        rootDoc.findFile(subFolder) ?: rootDoc.createDirectory(subFolder) ?: rootDoc
                    } else {
                        rootDoc
                    }
                    val mimeType = getMimeTypeForName(cleanName)
                    val existing = targetDoc.findFile(cleanName)
                    val fileDoc = existing?.takeIf { it.canWrite() } ?: targetDoc.createFile(mimeType, cleanName)
                    if (fileDoc != null) {
                        contentResolver.openOutputStream(fileDoc.uri, "wt")?.use { output ->
                            inputStream.copyTo(output)
                        } ?: throw IllegalStateException("Could not open stream for ${fileDoc.uri}")
                        android.util.Log.i("CosmoSave", "Saved via SAF Tree URI to: ${fileDoc.uri}")
                        return true
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("CosmoSave", "Tree URI save failed, falling back to MediaStore: ${e.message}", e)
            }
        }

        // Tier 2: Standard folder selection (Downloads, Pictures, DCIM, Documents, Movies) via MediaStore on Android 10+
        val baseDirName = prefs.getString("phone_download_dir", Environment.DIRECTORY_DOWNLOADS) ?: Environment.DIRECTORY_DOWNLOADS
        val subFolder = prefs.getString("custom_subfolder_name", "")?.trim() ?: ""
        val relativePath = if (subFolder.isNotBlank()) "$baseDirName/$subFolder" else baseDirName
        val mimeType = getMimeTypeForName(cleanName)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val contentUri = when (baseDirName) {
                    Environment.DIRECTORY_PICTURES, Environment.DIRECTORY_DCIM -> {
                        if (mimeType.startsWith("image/")) MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                        else if (mimeType.startsWith("video/")) MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                        else MediaStore.Files.getContentUri("external")
                    }
                    Environment.DIRECTORY_MOVIES -> {
                        if (mimeType.startsWith("video/")) MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                        else MediaStore.Files.getContentUri("external")
                    }
                    Environment.DIRECTORY_DOCUMENTS -> {
                        MediaStore.Files.getContentUri("external")
                    }
                    Environment.DIRECTORY_DOWNLOADS -> {
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI
                    }
                    else -> {
                        MediaStore.Files.getContentUri("external")
                    }
                }

                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, cleanName)
                    put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }

                var uri = contentResolver.insert(contentUri, contentValues)
                if (uri == null && contentUri != MediaStore.Files.getContentUri("external")) {
                    uri = contentResolver.insert(MediaStore.Files.getContentUri("external"), contentValues)
                }

                if (uri != null) {
                    contentResolver.openOutputStream(uri, "wt")?.use { output ->
                        inputStream.copyTo(output)
                    } ?: throw IllegalStateException("Could not open stream for $uri")
                    contentValues.clear()
                    contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                    contentResolver.update(uri, contentValues, null, null)
                    android.util.Log.i("CosmoSave", "Saved via MediaStore to: $relativePath/$cleanName")
                    return true
                }
            } catch (e: Exception) {
                android.util.Log.w("CosmoSave", "MediaStore primary insert failed: ${e.message}, trying Files fallback", e)
                try {
                    val fallbackValues = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, cleanName)
                        put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                        put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
                        put(MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(MediaStore.Files.getContentUri("external"), fallbackValues)
                    if (uri != null) {
                        contentResolver.openOutputStream(uri, "wt")?.use { output ->
                            inputStream.copyTo(output)
                        } ?: throw IllegalStateException("Could not open stream for $uri")
                        fallbackValues.clear()
                        fallbackValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                        contentResolver.update(uri, fallbackValues, null, null)
                        android.util.Log.i("CosmoSave", "Saved via MediaStore.Files fallback to: $relativePath/$cleanName")
                        return true
                    }
                } catch (e2: Exception) {
                    android.util.Log.e("CosmoSave", "MediaStore fallback failed: ${e2.message}", e2)
                }
            }
        }

        // Tier 3: Direct File API (Android 9 or legacy fallback)
        try {
            val publicBase = Environment.getExternalStoragePublicDirectory(baseDirName)
            val targetDir = if (subFolder.isNotBlank()) File(publicBase, subFolder) else publicBase
            if (!targetDir.exists()) targetDir.mkdirs()

            val destFile = getUniqueDestinationFile(targetDir, cleanName)
            FileOutputStream(destFile).use { output ->
                inputStream.copyTo(output)
            }
            MediaScannerConnection.scanFile(
                context.applicationContext,
                arrayOf(destFile.absolutePath),
                arrayOf(mimeType),
                null
            )
            android.util.Log.i("CosmoSave", "Saved via legacy File API to: ${destFile.absolutePath}")
            return true
        } catch (e: Exception) {
            android.util.Log.w("CosmoSave", "Public File save failed, falling back to app external files dir", e)
            val fallbackBase = context.getExternalFilesDir(baseDirName) ?: context.filesDir
            val fallbackDir = if (subFolder.isNotBlank()) File(fallbackBase, subFolder) else fallbackBase
            if (!fallbackDir.exists()) fallbackDir.mkdirs()
            val fallbackFile = getUniqueDestinationFile(fallbackDir, cleanName)
            FileOutputStream(fallbackFile).use { output ->
                inputStream.copyTo(output)
            }
            MediaScannerConnection.scanFile(
                context.applicationContext,
                arrayOf(fallbackFile.absolutePath),
                arrayOf(mimeType),
                null
            )
            return true
        }
    }

    fun getSaveDestinationPath(prefs: SharedPreferences): String {
        val customName = prefs.getString("custom_folder_name", "") ?: ""
        val subFolder = prefs.getString("custom_subfolder_name", "") ?: ""
        if (customName.isNotBlank()) {
            return if (subFolder.isNotBlank()) "$customName/$subFolder" else customName
        }

        val baseDir = prefs.getString("phone_download_dir", Environment.DIRECTORY_DOWNLOADS) ?: Environment.DIRECTORY_DOWNLOADS
        val baseLabel = when (baseDir) {
            Environment.DIRECTORY_PICTURES -> "Pictures"
            Environment.DIRECTORY_DCIM -> "DCIM"
            Environment.DIRECTORY_DOCUMENTS -> "Documents"
            Environment.DIRECTORY_MOVIES -> "Movies"
            else -> "Downloads"
        }
        return if (subFolder.isNotBlank()) "$baseLabel/$subFolder" else baseLabel
    }

    fun updateFolderLabel(prefs: SharedPreferences, btn: TextView) {
        val customFolder = prefs.getString("custom_folder_name", "") ?: ""
        val subFolder = prefs.getString("custom_subfolder_name", "") ?: ""

        val label = if (customFolder.isNotBlank()) {
            if (subFolder.isNotBlank()) "$customFolder/$subFolder" else customFolder
        } else {
            val selectedSubDir = prefs.getString("phone_download_dir", Environment.DIRECTORY_DOWNLOADS) ?: Environment.DIRECTORY_DOWNLOADS
            val base = when (selectedSubDir) {
                Environment.DIRECTORY_PICTURES -> "Pictures"
                Environment.DIRECTORY_DCIM -> "DCIM"
                Environment.DIRECTORY_DOCUMENTS -> "Documents"
                else -> "Downloads"
            }
            if (subFolder.isNotBlank()) "$base/$subFolder" else base
        }
        btn.text = "📁 $label"
    }

    fun extractFileName(
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
}
