package com.cosmo.symphony.companion

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import java.util.concurrent.atomic.AtomicLong

class ProgressHudHelper(
    private val activity: Activity,
    private val container: FrameLayout
) {
    private var hudOverlay: LinearLayout? = null
    private var hudTitle: TextView? = null
    private var hudSub: TextView? = null
    private var hudProgressBar: ProgressBar? = null
    private val lastHudUpdateMs = AtomicLong(0L)

    private val Int.dp: Int
        get() = (this * activity.resources.displayMetrics.density).toInt()

    fun setup() {
        if (hudOverlay != null) {
            if (hudOverlay?.parent == null) {
                container.addView(hudOverlay)
            }
            hudOverlay?.bringToFront()
            return
        }

        hudTitle = TextView(activity).apply {
            textSize = 14f
            setTextColor(Color.parseColor("#00ff88")) // Cyber Emerald Green
            setTypeface(null, Typeface.BOLD)
            text = "🎵 Ingesting into Cosmo Symphony..."
        }

        hudSub = TextView(activity).apply {
            textSize = 11f
            setTextColor(Color.parseColor("#94a3b8")) // WCAG 2.1 AA compliant
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

    fun update(completed: Int, total: Int, currentFileName: String) {
        val now = System.currentTimeMillis()
        if (completed < total && now - lastHudUpdateMs.get() < 16) return
        lastHudUpdateMs.set(now)

        activity.runOnUiThread {
            setup()
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

    fun hide(message: String, isSuccess: Boolean = true) {
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
}
