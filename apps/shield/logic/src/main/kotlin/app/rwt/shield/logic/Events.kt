package app.rwt.shield.logic

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

private const val MAX_TEXT_LENGTH = 300
private val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
private val SOURCE_KEY = Regex("^[a-z0-9][a-z0-9:._-]{0,99}$")

@Serializable
data class EventSource(val key: String, val externalKey: String, val rawTitle: String)

@Serializable
data class EpisodePosition(val unit: String, val season: Int?, val episode: Int)

/** A "watched" event as the server's contract defines it (packages/core/event.schema.json). */
@Serializable
data class OutboxEvent(
    val id: String,
    val occurredAt: String,
    val kind: String,
    val source: EventSource,
    val position: EpisodePosition,
) {
    /** Loaded events are untrusted – the file can be damaged or edited – so only what the server would accept passes. */
    fun isValid(): Boolean =
        UUID_PATTERN.matches(id) &&
            runCatching { OffsetDateTime.parse(occurredAt) }.isSuccess &&
            kind == "watched" &&
            SOURCE_KEY.matches(source.key) &&
            isText(source.externalKey) &&
            isText(source.rawTitle) &&
            position.unit == "episode" &&
            (position.season == null || position.season in 1..999) &&
            position.episode in 1..99_999

    private fun isText(value: String) = value.isNotBlank() && value.length <= MAX_TEXT_LENGTH && value.none { it.isISOControl() }
}

@Serializable
private data class EventBatch(val events: List<OutboxEvent>)

object EventJson {
    private val json = Json { encodeDefaults = true }

    fun encode(event: OutboxEvent): String = json.encodeToString(OutboxEvent.serializer(), event)

    /** Null for anything that is not a valid event. */
    fun decode(line: String): OutboxEvent? =
        runCatching { json.decodeFromString(OutboxEvent.serializer(), line) }.getOrNull()?.takeIf { it.isValid() }

    /** The body of `POST /api/v1/events`. */
    fun batch(events: List<OutboxEvent>): String = json.encodeToString(EventBatch.serializer(), EventBatch(events))
}

class EventFactory(
    private val now: () -> Instant,
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    /**
     * The raw series title is also sent as key: the server derives the normalized streaming key
     * itself (SPEC §5.2), so the Shield and the desktop always meet on the same work.
     */
    fun watched(episode: WatchedEpisode): OutboxEvent =
        OutboxEvent(
            id = newId(),
            occurredAt = DateTimeFormatter.ISO_INSTANT.format(now()),
            kind = "watched",
            source = EventSource(episode.service, episode.seriesTitle, episode.seriesTitle),
            position = EpisodePosition("episode", episode.season, episode.episode),
        )
}
