package com.cosmo.symphony.companion

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.net.URLDecoder

object FileTransferUtils {

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
