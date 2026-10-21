package app.rwt.shield.logic

import java.io.IOException

data class HttpResult(val status: Int, val body: String, val retryAfterSeconds: Long? = null)

/** Sends one `POST /api/v1/events` body; the Android app implements it with HttpURLConnection. */
fun interface EventTransport {
    fun post(payload: String): HttpResult
}

sealed interface FlushResult {
    data class Done(val sent: Int) : FlushResult

    /** Try again later; WorkManager backs off, or waits `retryAfterMs` when the server said so. */
    data class Retry(val retryAfterMs: Long?) : FlushResult

    /** The token was revoked (SPEC §6.2): the device has to be paired again. */
    data object Unauthorized : FlushResult
}

/**
 * Empties the outbox in batches of 100. Only events the server answered for are removed; an
 * answer outside the contract changes nothing. Ids make resending harmless (idempotent server).
 */
class OutboxFlusher(
    private val outbox: FileOutbox,
    private val transport: EventTransport,
    private val batchSize: Int = 100,
) {
    fun flush(): FlushResult {
        var sent = 0
        while (true) {
            val batch = outbox.peek(batchSize)
            if (batch.isEmpty()) return FlushResult.Done(sent)

            val result = try {
                transport.post(EventJson.batch(batch))
            } catch (_: IOException) {
                return FlushResult.Retry(retryAfterMs = null)
            }
            when {
                result.status == 401 -> return FlushResult.Unauthorized
                result.status == 429 || result.status >= 500 ->
                    return FlushResult.Retry(result.retryAfterSeconds?.coerceIn(1, 3_600)?.times(1_000))
                result.status !in 200..299 -> return FlushResult.Retry(retryAfterMs = null)
            }

            val answered = ApiResponses.answeredIds(result.body, batch.map { it.id }.toSet())
                ?: return FlushResult.Retry(retryAfterMs = null)
            outbox.remove(answered)
            sent += answered.size
            if (answered.size < batch.size) return FlushResult.Done(sent) // the rest waits for the next run
        }
    }
}
