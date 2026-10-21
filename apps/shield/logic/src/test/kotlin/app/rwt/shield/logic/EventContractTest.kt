package app.rwt.shield.logic

import com.fasterxml.jackson.databind.ObjectMapper
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

/** Every event the Shield sends must be one the server accepts (packages/core/event.schema.json). */
class EventContractTest {
    private val schema = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(CoreFiles.eventSchema())
    private val mapper = ObjectMapper()
    private val factory = EventFactory(now = { Instant.parse("2026-10-21T20:00:00.123Z") })

    private fun errors(json: String) = schema.validate(mapper.readTree(json))

    @Test
    fun `a watched episode with and without season matches the server's event schema`() {
        for (episode in listOf(WatchedEpisode("netflix", "Dark", 2, 5), WatchedEpisode("crunchyroll", "Frieren", null, 12))) {
            val json = EventJson.encode(factory.watched(episode))
            assertEquals(emptySet<Any>(), errors(json), json)
        }
    }

    @Test
    fun `the schema check would catch a broken payload`() {
        val valid = EventJson.encode(factory.watched(WatchedEpisode("netflix", "Dark", 2, 5)))
        assertTrue(errors(valid.replace("\"season\":2", "\"season\":0")).isNotEmpty())
        assertTrue(errors(valid.replace("\"kind\":\"watched\"", "\"kind\":\"deleted\"")).isNotEmpty())
    }

    @Test
    fun `events carry a random UUID, the time and the raw series title as key`() {
        val event = factory.watched(WatchedEpisode("netflix", "Dark (German Dub)", 2, 5))
        UUID.fromString(event.id)
        assertEquals("2026-10-21T20:00:00.123Z", event.occurredAt)
        // The server derives the streaming key itself (SPEC §5.2), so desktop and Shield agree.
        assertEquals(EventSource("netflix", "Dark (German Dub)", "Dark (German Dub)"), event.source)
    }

    @Test
    fun `the batch is wrapped as the events endpoint expects`() {
        val events = listOf(factory.watched(WatchedEpisode("netflix", "Dark", 2, 5)))
        val batch = Json.parseToJsonElement(EventJson.batch(events)).jsonObject
        assertEquals(1, batch.getValue("events").jsonArray.size)
    }
}
