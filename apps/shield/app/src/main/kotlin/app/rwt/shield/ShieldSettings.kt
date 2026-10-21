package app.rwt.shield

import android.content.Context
import androidx.core.content.edit
import app.rwt.shield.logic.FileOutbox
import app.rwt.shield.logic.PairingStart
import app.rwt.shield.logic.TrackerSettings
import app.rwt.shield.logic.WatchedEpisode
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant

/**
 * What the app keeps in private SharedPreferences (SPEC §8.4). Every read is validated: a damaged
 * or edited value reads as "not set" instead of reaching the network or the screen.
 */
class ShieldSettings(context: Context) {
    private val prefs = context.getSharedPreferences("rwt", Context.MODE_PRIVATE)

    var apiUrl: String?
        get() = prefs.getString(KEY_API_URL, null)?.let(TrackerSettings::origin)
        set(value) = prefs.edit { putString(KEY_API_URL, value?.let(TrackerSettings::origin)) }

    var deviceToken: String?
        get() = prefs.getString(KEY_TOKEN, null)?.takeIf(TrackerSettings::isDeviceToken)
        set(value) = prefs.edit { putString(KEY_TOKEN, value?.takeIf(TrackerSettings::isDeviceToken)) }

    val deviceName: String
        get() = prefs.getString(KEY_NAME, null)?.trim()?.takeIf { it.isNotEmpty() && it.length <= 100 } ?: "Shield"

    /** The running pairing request, until it is approved or expires. */
    var pairing: PairingStart?
        get() = runCatching {
            val stored = JSONObject(prefs.getString(KEY_PAIRING, null) ?: return null)
            val start = PairingStart(stored.getString("code"), stored.getString("pollSecret"), Instant.parse(stored.getString("expiresAt")))
            start.takeIf { Regex("^[A-Z0-9]{6}$").matches(it.code) && it.pollSecret.length in 20..100 }
        }.getOrNull()
        set(value) = prefs.edit {
            if (value == null) {
                remove(KEY_PAIRING)
            } else {
                putString(KEY_PAIRING, JSONObject().put("code", value.code).put("pollSecret", value.pollSecret).put("expiresAt", value.expiresAt.toString()).toString())
            }
        }

    /** The last ten counted episodes, newest first, for the status screen. */
    val recent: List<String>
        get() = readList(KEY_RECENT)

    fun addRecent(episode: WatchedEpisode, at: Instant) {
        val season = episode.season?.let { "S$it · " } ?: ""
        writeList(KEY_RECENT, listOf("${episode.seriesTitle} · ${season}F${episode.episode} · $at") + recent, MAX_RECENT)
    }

    /** Metadata the mappings could not read ("Nicht erkannt"), newest first. */
    var unrecognized: List<String>
        get() = readList(KEY_UNRECOGNIZED)
        set(value) = writeList(KEY_UNRECOGNIZED, value, MAX_UNRECOGNIZED)

    private fun readList(key: String): List<String> = runCatching {
        val array = JSONArray(prefs.getString(key, null) ?: return emptyList())
        (0 until array.length()).map { array.getString(it).take(MAX_LINE) }
    }.getOrDefault(emptyList())

    private fun writeList(key: String, lines: List<String>, max: Int) =
        prefs.edit { putString(key, JSONArray(lines.take(max).map { it.take(MAX_LINE) }).toString()) }

    companion object {
        private const val KEY_API_URL = "apiUrl"
        private const val KEY_TOKEN = "deviceToken"
        private const val KEY_NAME = "deviceName"
        private const val KEY_PAIRING = "pairing"
        private const val KEY_RECENT = "recent"
        private const val KEY_UNRECOGNIZED = "unrecognized"
        private const val MAX_RECENT = 10
        private const val MAX_UNRECOGNIZED = 20
        private const val MAX_LINE = 400

        fun outbox(context: Context) = FileOutbox(File(context.filesDir, "outbox.jsonl"))
    }
}
