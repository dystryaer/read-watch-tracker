package app.rwt.shield.logic

import java.net.URI

/** Checks for what the app keeps in its preferences: stored values count as untrusted too. */
object TrackerSettings {
    private val deviceToken = Regex("^[A-Za-z0-9_-]{43}$")

    fun isDeviceToken(value: String?): Boolean = value != null && deviceToken.matches(value)

    /**
     * The tracker's origin (`https://host[:port]`) from a typed address, or null. Only https: the
     * device token must never travel unencrypted, and on a TV there is no "localhost" to exempt.
     */
    fun origin(raw: String): String? {
        val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return null
        if (!uri.scheme.equals("https", ignoreCase = true) || uri.rawUserInfo != null) return null
        val host = uri.host?.lowercase() ?: return null
        val port = if (uri.port == -1 || uri.port == 443) "" else ":${uri.port}"
        return "https://$host$port"
    }
}
