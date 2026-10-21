package app.rwt.shield

import android.app.Activity
import androidx.core.net.toUri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat
import app.rwt.shield.logic.ApiResponses
import app.rwt.shield.logic.PairingPoll
import app.rwt.shield.logic.PairingStart
import app.rwt.shield.logic.TrackerSettings
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.Executors

/**
 * The only screen (SPEC §8.2, §8.4): tracker address, pairing code with QR code, then the status.
 * All text from the server or from the metadata is set as plain text.
 */
class MainActivity : Activity() {
    private val settings by lazy { ShieldSettings(this) }
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val time = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault())
    private var polling = false
    private lateinit var root: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Saves typing on the remote: adb shell am start -n app.rwt.shield/.MainActivity --es apiUrl https://…
        intent.getStringExtra("apiUrl")?.let(TrackerSettings::origin)?.let { settings.apiUrl = it }
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(48), dp(32), dp(48), dp(32))
        }
        setContentView(ScrollView(this).apply { addView(root) })
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    override fun onPause() {
        polling = false
        main.removeCallbacksAndMessages(null)
        super.onPause()
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }

    private fun render() {
        root.removeAllViews()
        val apiUrl = settings.apiUrl
        when {
            apiUrl == null -> showAddress()
            settings.deviceToken == null -> showPairing(apiUrl)
            else -> showStatus(apiUrl)
        }
    }

    private fun showAddress() {
        heading("Tracker verbinden")
        text("Adresse deines Trackers (https://…):")
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            hint = "https://dein-tracker.example"
        }
        root.addView(input)
        val error = text("")
        button("Weiter") {
            val origin = TrackerSettings.origin(input.text.toString())
            if (origin == null) {
                error.text = "Bitte eine https-Adresse eingeben."
            } else {
                settings.apiUrl = origin
                render()
            }
        }
    }

    private fun showPairing(apiUrl: String) {
        heading("Gerät koppeln")
        val status = text("Code wird angefordert …")
        val running = settings.pairing?.takeIf { it.expiresAt.isAfter(Instant.now()) }
        if (running != null) showCode(apiUrl, running, status) else requestCode(apiUrl, status)
        button("Andere Tracker-Adresse") {
            settings.pairing = null
            settings.apiUrl = null
            render()
        }
    }

    private fun requestCode(apiUrl: String, status: TextView) {
        io.execute {
            val start = runCatching {
                val body = JSONObject().put("kind", "shield").put("name", settings.deviceName).toString()
                val result = TrackerHttp(apiUrl).post("/api/v1/pairing", body)
                if (result.status in 200..299) ApiResponses.pairingStart(result.body) else null
            }.getOrNull()
            onScreen {
                if (start == null) {
                    status.text = "Der Tracker ist nicht erreichbar. Adresse prüfen und erneut versuchen."
                    button("Erneut versuchen") { render() }
                } else {
                    settings.pairing = start
                    render()
                }
            }
        }
    }

    private fun showCode(apiUrl: String, start: PairingStart, status: TextView) {
        status.text = "Gib diesen Code im Tracker unter Einstellungen → Gerät koppeln ein oder scanne den QR-Code:"
        root.addView(TextView(this).apply {
            text = "${start.code.take(3)}-${start.code.drop(3)}"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 56f)
            contentDescription = "Code " + start.code.toList().joinToString(" ")
        })
        root.addView(ImageView(this).apply { setImageBitmap(QrCode.bitmap("$apiUrl/pair?code=${start.code}", dp(220))) })
        text("Gültig bis ${time.format(start.expiresAt)} Uhr. Im Tracker siehst du vor dem Bestätigen, welches Gerät sich koppeln will.")
        poll(apiUrl, start, status)
    }

    // The next poll starts only after the previous one answered, so two never overlap.
    private fun poll(apiUrl: String, start: PairingStart, status: TextView) {
        polling = true
        val next = object : Runnable {
            override fun run() {
                if (!polling) return
                io.execute {
                    val answer = runCatching {
                        val body = JSONObject().put("pollSecret", start.pollSecret).toString()
                        val result = TrackerHttp(apiUrl).post("/api/v1/pairing/poll", body)
                        if (result.status == 200) ApiResponses.pairingPoll(result.body) else null
                    }.getOrNull()
                    onScreen {
                        if (!polling) return@onScreen
                        when (answer) {
                            is PairingPoll.Approved -> {
                                polling = false
                                settings.deviceToken = answer.deviceToken
                                settings.pairing = null
                                FlushWorker.schedule(this@MainActivity)
                                render()
                            }
                            PairingPoll.Expired -> {
                                polling = false
                                settings.pairing = null
                                status.text = "Der Code ist abgelaufen."
                                button("Neuen Code anfordern") { render() }
                            }
                            else -> main.postDelayed(this, POLL_MS) // still pending, or offline for a moment
                        }
                    }
                }
            }
        }
        main.postDelayed(next, POLL_MS)
    }

    private fun showStatus(apiUrl: String) {
        heading("Read-Watch-Tracker")
        text("Gekoppelt ✓ mit ${apiUrl.toUri().host}")
        val listening = NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)
        text(
            if (listening) {
                "Medienzugriff ✓"
            } else {
                "Medienzugriff ✗ – einmalig per adb freigeben:\nadb shell cmd notification allow_listener app.rwt.shield/app.rwt.shield.MediaWatcherService"
            },
        )
        text("Outbox: ${ShieldSettings.outbox(this).size()} wartende Ereignisse")

        subheading("Letzte Ereignisse")
        settings.recent.ifEmpty { listOf("Noch keine.") }.forEach { text(it) }
        subheading("Nicht erkannt")
        settings.unrecognized.ifEmpty { listOf("Nichts.") }.forEach { text(it) }

        button("Jetzt senden") { FlushWorker.schedule(this) }
        button("Entkoppeln") {
            settings.deviceToken = null
            render()
        }
    }

    private fun onScreen(block: () -> Unit) = main.post { if (!isFinishing && !isDestroyed) block() }

    private fun heading(value: String) = addText(value, 32f)

    private fun subheading(value: String) = addText(value, 22f).apply { setPadding(0, dp(24), 0, dp(8)) }

    private fun text(value: String) = addText(value, 18f)

    private fun addText(value: String, sizeSp: Float) = TextView(this).apply {
        text = value
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        setPadding(0, dp(4), 0, dp(4))
        root.addView(this)
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        setOnClickListener { onClick() }
        root.addView(this)
    }

    private fun dp(value: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    private companion object {
        const val POLL_MS = 3_000L
    }
}
