package app.rwt.shield.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.time.Instant
import java.util.UUID

class FileOutboxTest {
    @TempDir
    lateinit var dir: File

    private val file by lazy { File(dir, "outbox.jsonl") }

    private fun event(number: Int) =
        EventFactory(now = { Instant.parse("2026-10-21T20:00:00Z") }, newId = { UUID.nameUUIDFromBytes("e$number".toByteArray()).toString() })
            .watched(WatchedEpisode("netflix", "Dark", 2, number))

    @Test
    fun `keeps events across restarts until they are acknowledged`() {
        FileOutbox(file).apply {
            add(event(1))
            add(event(2))
        }
        val reopened = FileOutbox(file)
        assertEquals(listOf(event(1), event(2)), reopened.peek(10))

        reopened.remove(setOf(event(1).id))
        assertEquals(listOf(event(2)), FileOutbox(file).peek(10))
    }

    @Test
    fun `hands out at most the requested batch size`() {
        val outbox = FileOutbox(file)
        repeat(5) { outbox.add(event(it + 1)) }
        assertEquals(3, outbox.peek(3).size)
        assertEquals(5, outbox.size())
    }

    @Test
    fun `drops the oldest events beyond its limit`() {
        val outbox = FileOutbox(file, limit = 3)
        repeat(5) { outbox.add(event(it + 1)) }
        assertEquals(listOf(event(3), event(4), event(5)), outbox.peek(10))
    }

    @Test
    fun `does not queue the same event twice`() {
        val outbox = FileOutbox(file)
        outbox.add(event(1))
        outbox.add(event(1))
        assertEquals(1, outbox.size())
    }

    @Test
    fun `skips damaged or tampered lines instead of failing`() {
        val good = EventJson.encode(event(1))
        file.writeText(
            listOf(
                "not json",
                good,
                good.replace("\"season\":2", "\"season\":0"),
                good.replace("\"kind\":\"watched\"", "\"kind\":\"read\""),
                good.replace("\"key\":\"netflix\"", "\"key\":\"Netflix!\""),
                "{\"id\":\"" + "x".repeat(20_000) + "\"}",
                "",
            ).joinToString("\n"),
        )
        assertEquals(listOf(event(1)), FileOutbox(file).peek(10))
    }

    @Test
    fun `refuses to queue an event the server would not accept`() {
        val outbox = FileOutbox(file)
        val broken = event(1).copy(source = EventSource("netflix", "Da" + Char(7) + "rk", "Dark"))

        assertEquals(false, outbox.add(broken))
        assertEquals(true, outbox.add(event(2)))
        assertEquals(listOf(event(2)), outbox.peek(10))
    }

    @Test
    fun `is empty without a file`() {
        assertEquals(0, FileOutbox(file).size())
    }
}
