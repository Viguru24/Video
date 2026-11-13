package com.cosmo.symphony.companion

import android.content.SharedPreferences
import android.net.Uri
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

object NetworkDiscoveryHelper {

    fun getLocalDeviceIp(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
            for (iface in interfaces) {
                if (iface.isLoopback || !iface.isUp) continue
                for (addr in iface.inetAddresses) {
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        val host = addr.hostAddress ?: continue
                        if (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.")) {
                            return host
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        return null
    }

    fun getLocalScanSubnets(): List<String> {
        val subnets = mutableListOf<String>()
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            if (interfaces != null) {
                for (iface in interfaces) {
                    if (iface.isLoopback || !iface.isUp) continue
                    for (addr in iface.inetAddresses) {
                        if (!addr.isLoopbackAddress && addr is Inet4Address) {
                            val host = addr.hostAddress ?: continue
                            if (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.")) {
                                val base = host.substringBeforeLast(".") + "."
                                if (!subnets.contains(base)) {
                                    subnets.add(base)
                                }
                            }
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        if (!subnets.contains("192.168.1.")) subnets.add("192.168.1.")
        if (!subnets.contains("192.168.0.")) subnets.add("192.168.0.")
        return subnets
    }

    fun autoDiscoverPc(
        prefs: SharedPreferences,
        onFound: (String) -> Unit,
        onNotFound: () -> Unit
    ) {
        val subnets = getLocalScanSubnets()
        val scanExecutor = Executors.newFixedThreadPool(64)
        val found = AtomicBoolean(false)

        val candidates = mutableListOf<String>()
        val saved = prefs.getString("last_url", "") ?: ""
        val savedHost = if (saved.isNotBlank()) {
            try { Uri.parse(saved).host } catch (_: Exception) { null }
        } else null
        if (!savedHost.isNullOrBlank() && !candidates.contains(savedHost)) {
            candidates.add(savedHost)
        }

        for (subnet in subnets) {
            for (i in 1..254) {
                val ip = "$subnet$i"
                if (!candidates.contains(ip)) {
                    candidates.add(ip)
                }
            }
        }

        val pending = AtomicInteger(candidates.size)

        for (candidateIp in candidates) {
            scanExecutor.execute {
                if (!found.get()) {
                    try {
                        val socket = Socket()
                        socket.connect(InetSocketAddress(candidateIp, 48273), 850)
                        socket.close()

                        // Verify health response matches Cosmo Symphony Wi-Fi Share service
                        val pingUrl = URL("http://$candidateIp:48273/api/health")
                        val conn = pingUrl.openConnection() as HttpURLConnection
                        conn.connectTimeout = 1000
                        conn.readTimeout = 1000
                        val code = conn.responseCode
                        val body = if (code == 200) {
                            conn.inputStream.bufferedReader().use { it.readText() }
                        } else {
                            ""
                        }
                        conn.disconnect()
                        if (code == 200 && body.contains("cosmo-symphony-wifi-share")) {
                            if (found.compareAndSet(false, true)) {
                                scanExecutor.shutdownNow()
                                val targetUrl = "http://$candidateIp:48273"
                                onFound(targetUrl)
                            }
                        }
                    } catch (_: Exception) {
                    }
                }
                if (pending.decrementAndGet() == 0 && !found.get()) {
                    onNotFound()
                }
            }
        }
        scanExecutor.shutdown()
    }
}
