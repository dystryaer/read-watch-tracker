package app.rwt.shield.logic

/** The MediaMetadata fields the Shield evaluates (SPEC §8.1), copied out of the Android types. */
data class MediaSnapshot(
    val packageName: String,
    val title: String?,
    val displayTitle: String?,
    val displaySubtitle: String?,
    val artist: String?,
    val album: String?,
    val durationMs: Long?,
)

enum class PlaybackStatus { PLAYING, PAUSED, STOPPED, OTHER }

/** A PlaybackState: the position at `updatedAtMs` (elapsed-realtime clock), moving with `speed` while playing. */
data class PlaybackSample(
    val status: PlaybackStatus,
    val positionMs: Long,
    val speed: Float,
    val updatedAtMs: Long,
)

/** An episode of a series on a streaming service; `service` is the source key (SPEC §8.3). */
data class WatchedEpisode(
    val service: String,
    val seriesTitle: String,
    val season: Int?,
    val episode: Int,
)

/** What a package mapping reads from the metadata – the same tuple as a watched episode. */
typealias MappedEpisode = WatchedEpisode
