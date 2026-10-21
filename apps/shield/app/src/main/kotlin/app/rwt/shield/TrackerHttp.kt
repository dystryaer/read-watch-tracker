package app.rwt.shield

import app.rwt.shield.logic.HttpResult
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/** JSON requests to the tracker (https only, checked by TrackerSettings). Throws IOException when offline. */
class TrackerHttp(private val origin: String) {
    fun post(path: String, body: String, token: String? = null): HttpResult {
        val connection = URL(origin + path).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        // A redirect would carry the Authorization header to whatever host it names.
        connection.instanceFollowRedirects = false
        connection.connectTimeout = TIMEOUT_MS
        connection.readTimeout = TIMEOUT_MS
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
        try {
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            val text = stream?.use(::readCapped).orEmpty()
            return HttpResult(status, text, connection.getHeaderField("Retry-After")?.toLongOrNull())
        } finally {
            connection.disconnect()
        }
    }

    // A hostile server can make the app buffer neither more than this nor for longer than the deadline
    // (the read timeout applies per read, so a server dripping bytes could otherwise hold the worker).
    private fun readCapped(input: InputStream): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8_192)
        val deadline = System.nanoTime() + TOTAL_DEADLINE_NS
        while (output.size() < MAX_RESPONSE_BYTES) {
            if (System.nanoTime() > deadline) throw IOException("Response too slow")
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, minOf(read, MAX_RESPONSE_BYTES - output.size()))
        }
        return output.toString(Charsets.UTF_8.name())
    }

    private companion object {
        const val TIMEOUT_MS = 15_000
        const val MAX_RESPONSE_BYTES = 64 * 1024
        const val TOTAL_DEADLINE_NS = 30_000_000_000L
    }
}
