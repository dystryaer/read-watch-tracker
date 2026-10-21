package app.rwt.shield.logic

/**
 * The "watched" rule (SPEC §8.3): with unchanged metadata an episode counts once the computed
 * position reaches 85 % of its duration. Checked on every playback change and by a 30-second tick
 * while playing; when the metadata changes (autoplay), the previous episode is judged one last
 * time. One event per (service, series, season, episode).
 */
class WatchTracker(
    private val elapsedMs: () -> Long,
    private val watchedRatio: Double = 0.85,
    private val minDurationMs: Long = 60_000,
) {
    companion object {
        const val MAX_UNRECOGNIZED = 20
        private const val MAX_COUNTED = 500
    }

    private class Session(val snapshot: MediaSnapshot, val episode: WatchedEpisode?) {
        var playback: PlaybackSample? = null
    }

    private val sessions = mutableMapOf<String, Session>()
    private val counted = LinkedHashSet<WatchedEpisode>()
    private val unrecognizedSnapshots = ArrayDeque<MediaSnapshot>()

    /** Metadata of allowlisted apps without a readable episode, newest first (status screen). */
    val unrecognized: List<MediaSnapshot>
        @Synchronized get() = unrecognizedSnapshots.toList()

    @Synchronized
    fun onMetadata(snapshot: MediaSnapshot): List<WatchedEpisode> {
        if (PackageMappings.serviceFor(snapshot.packageName) == null) return emptyList()
        val previous = sessions[snapshot.packageName]
        if (previous?.snapshot == snapshot) return emptyList()

        val finished = previous?.let(::evaluate).orEmpty()
        val episode = PackageMappings.map(snapshot)
        if (episode == null) rememberUnrecognized(snapshot)
        sessions[snapshot.packageName] = Session(snapshot, episode)
        return finished
    }

    @Synchronized
    fun onPlayback(packageName: String, sample: PlaybackSample): List<WatchedEpisode> {
        val session = sessions[packageName] ?: return emptyList()
        session.playback = sample
        return evaluate(session)
    }

    @Synchronized
    fun tick(): List<WatchedEpisode> = sessions.values.flatMap(::evaluate)

    @Synchronized
    fun isPlaying(): Boolean = sessions.values.any { it.playback?.status == PlaybackStatus.PLAYING }

    private fun evaluate(session: Session): List<WatchedEpisode> {
        val episode = session.episode ?: return emptyList()
        val playback = session.playback ?: return emptyList()
        val duration = session.snapshot.durationMs ?: return emptyList()
        if (duration < minDurationMs || episode in counted) return emptyList()

        val position = if (playback.status == PlaybackStatus.PLAYING) {
            playback.positionMs + ((elapsedMs() - playback.updatedAtMs) * playback.speed).toLong()
        } else {
            playback.positionMs
        }
        if (position.toDouble() / duration < watchedRatio) return emptyList()

        counted += episode
        if (counted.size > MAX_COUNTED) counted.remove(counted.first())
        return listOf(episode)
    }

    private fun rememberUnrecognized(snapshot: MediaSnapshot) {
        unrecognizedSnapshots.remove(snapshot)
        unrecognizedSnapshots.addFirst(snapshot)
        while (unrecognizedSnapshots.size > MAX_UNRECOGNIZED) unrecognizedSnapshots.removeLast()
    }
}
