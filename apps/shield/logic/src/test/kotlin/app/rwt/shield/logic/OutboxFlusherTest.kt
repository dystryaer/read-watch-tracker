package app.rwt.shield.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.io.IOException
import java.time.Instant

class OutboxFlusherTest {
    @TempDir
    lateinit var dir: File

    private val factory = EventFactory(now = { Instant.parse("2026-10-21T20:00:00Z") })
    private val outbox by lazy { FileOutbox(File(dir, "outbox.jsonl")) }
    private val sent = mutableListOf<String>()

    private fun transport(answer: (payload: String) -> HttpResult) =
        EventTransport { payload ->
            sent += payload
            answer(payload)
        }

    private fun acknowledgeAll(payload: String): HttpResult {
        val ids = Regex("\"id\":\"([0-9a-f-]{36})\"").findAll(payload).map { it.groupValues[1] }.toList()
        val results = ids.mapIndexed { index, id -> "{\"id\":\"$id\",\"index\":$index,\"outcome\":\"applied\"}" }
        return HttpResult(200, "{\"results\":[${results.joinToString(",")}]}")
    }

    private fun queue(count: Int) = repeat(count) { outbox.add(factory.watched(WatchedEpisode("netflix", "Dark", 2, it + 1))) }

    @Test
    fun `sends queued events in batches of 100 and removes what the server answered`() {
        queue(150)
        val result = OutboxFlusher(outbox, transport(::acknowledgeAll)).flush()

        assertEquals(FlushResult.Done(sent = 150), result)
        assertEquals(2, sent.size)
        assertEquals(0, outbox.size())
    }

    @Test
    fun `keeps events the server did not answer for`() {
        queue(3)
        val result = OutboxFlusher(outbox, transport { HttpResult(200, "{\"results\":[]}") }).flush()

        assertEquals(FlushResult.Done(sent = 0), result)
        assertEquals(3, outbox.size())
    }

    @Test
    fun `asks to retry on server errors and rate limits, keeping the events`() {
        queue(2)
        assertEquals(FlushResult.Retry(retryAfterMs = 30_000), OutboxFlusher(outbox, transport { HttpResult(429, "{}", retryAfterSeconds = 30) }).flush())
        assertEquals(FlushResult.Retry(retryAfterMs = null), OutboxFlusher(outbox, transport { HttpResult(503, "") }).flush())
        assertEquals(FlushResult.Retry(retryAfterMs = null), OutboxFlusher(outbox, transport { throw IOException("offline") }).flush())
        assertEquals(2, outbox.size())
    }

    @Test
    fun `asks to retry on an answer that does not fit the contract`() {
        queue(1)
        val broken = listOf("<html>proxy</html>", "{\"results\":[{\"id\":\"x\",\"index\":0,\"outcome\":\"applied\"}]}", "{\"wrong\":true}")
        for (body in broken) {
            assertEquals(FlushResult.Retry(retryAfterMs = null), OutboxFlusher(outbox, transport { HttpResult(200, body) }).flush(), body)
        }
        assertEquals(1, outbox.size())
    }

    @Test
    fun `reports a revoked token and keeps the events`() {
        queue(1)
        assertEquals(FlushResult.Unauthorized, OutboxFlusher(outbox, transport { HttpResult(401, "") }).flush())
        assertEquals(1, outbox.size())
    }

    @Test
    fun `does nothing with an empty outbox`() {
        assertEquals(FlushResult.Done(sent = 0), OutboxFlusher(outbox, transport { error("must not be called") }).flush())
    }
}
