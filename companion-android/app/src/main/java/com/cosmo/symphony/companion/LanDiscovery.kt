package com.cosmo.symphony.companion

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.net.InetSocketAddress
import java.net.Socket
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

object LanDiscovery {

    fun autoDiscoverPc(
        context: Context,
        onFound: (String) -> Unit,
        onNotFound: () -> Unit
    ) {
        val mainHandler = Handler(Looper.getMainLooper())
        val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? android.net.wifi.WifiManager
        val ipInt = wm?.connectionInfo?.ipAddress ?: 0
        val baseIp = if (ipInt != 0) {
            String.format(
                Locale.US,
                "%d.%d.%d.",
                ipInt and 0xff,
                ipInt shr 8 and 0xff,
                ipInt shr 16 and 0xff
            )
        } else {
            "192.168.1."
        }

        val scanExecutor = Executors.newFixedThreadPool(32)
        val found = AtomicBoolean(false)
        val pending = AtomicInteger(254)

        for (i in 1..254) {
            val candidateIp = "$baseIp$i"
            scanExecutor.execute {
                if (!found.get()) {
                    try {
                        val socket = Socket()
                        socket.connect(InetSocketAddress(candidateIp, 48273), 400)
                        socket.close()
                        if (found.compareAndSet(false, true)) {
                            val targetUrl = "http://$candidateIp:48273"
                            mainHandler.post { onFound(targetUrl) }
                        }
                    } catch (_: Exception) {
                    }
                }
                if (pending.decrementAndGet() == 0 && !found.get()) {
                    mainHandler.post { onNotFound() }
                }
            }
        }
        scanExecutor.shutdown()
    }
}
