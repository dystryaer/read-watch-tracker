package app.rwt.shield

import android.content.Context
import android.media.MediaMetadata
import android.media.session.PlaybackState
import org.json.JSONObject
import java.io.File
import java.time.Instant

/**
 * Debug builds only: writes every metadata key and playback state as JSON lines for Spike S1
 * (SPEC §8.5). Read it with
 * `adb shell run-as app.rwt.shield cat files/spike-s1.jsonl > spike-s1.jsonl`.
 */
class SpikeLogger(context: Context) {
    private val file = File(context.filesDir, FILE_NAME)

    fun metadata(packageName: String, metadata: MediaMetadata?) {
        val values = JSONObject()
        metadata?.keySet()?.forEach { key ->
            // URIs and ids can be signed links or profile ids; the spike only needs to know they exist.
            val value: Any? = if (PRIVATE_KEYS.any { key.endsWith(it) }) {
                "(vorhanden)"
            } else {
                metadata.getText(key)?.toString() ?: metadata.getLong(key).takeIf { it != 0L }
            }
            values.put(key, value ?: JSONObject.NULL)
        }
        write(JSONObject().put("type", "metadata").put("package", packageName).put("metadata", values))
    }

    fun playback(packageName: String, state: PlaybackState?) {
        val values = state?.let {
            JSONObject().put("state", it.state).put("position", it.position).put("speed", it.playbackSpeed.toDouble()).put("updated", it.lastPositionUpdateTime)
        }
        write(JSONObject().put("type", "playback").put("package", packageName).put("playback", values ?: JSONObject.NULL))
    }

    private fun write(line: JSONObject) {
        if (file.length() > MAX_BYTES) return
        file.appendText(line.put("at", Instant.now().toString()).toString() + "\n")
    }

    companion object {
        private const val MAX_BYTES = 5L * 1024 * 1024
        private const val FILE_NAME = "spike-s1.jsonl"
        private val PRIVATE_KEYS = listOf("_URI", "MEDIA_ID")

        /** A release build installed over a debug build drops the debug log of all apps. */
        fun discardOutsideDebug(context: Context) {
            if (!BuildConfig.DEBUG) File(context.filesDir, FILE_NAME).delete()
        }
    }
}
