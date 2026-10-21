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

    private class Session(val snapshot: MediaSnapshot, val episode: WatchedEpisode?, var playback: PlaybackSample?)

    private val sessions = mutableMapOf<String, Session>()
    private val counted = LinkedHashSet<WatchedEpisode>()
    private val unrecognizedSnapshots = ArrayDeque<MediaSnapshot>()

    /** Metadata of allowlisted apps without a readable episode, newest first (status screen). */
    val unrecognized: List<MediaSnapshot>
        @Synchronized get() = unrecognizedSnapshots.toList()

    /**
     * New metadata of an app. `current` is the player's playback state at this moment: an autoplay
     * update can arrive before the new metadata, so the service hands the current state over.
     * Refreshed metadata of the same episode (e.g. once the duration is known) keeps its playback.
     */
    @Synchronized
    fun onMetadata(snapshot: MediaSnapshot, current: PlaybackSample? = null): List<WatchedEpisode> {
        if (PackageMappings.serviceFor(snapshot.packageName) == null) return emptyList()
        val previous = sessions[snapshot.packageName]
        if (previous?.snapshot == snapshot) return emptyList()

        val finished = previous?.let { evaluate(it) }.orEmpty()
        val episode = PackageMappings.map(snapshot)
        if (episode == null) rememberUnrecognized(snapshot)
        val playback = current ?: previous?.playback?.takeIf { episode != null && episode == previous.episode }
        sessions[snapshot.packageName] = Session(snapshot, episode, playback)
        return finished
    }

    @Synchronized
    fun onPlayback(packageName: String, sample: PlaybackSample): List<WatchedEpisode> {
        val session = sessions[packageName] ?: return emptyList()
        session.playback = sample
        return evaluate(session)
    }

    /**
     * The app's session is gone (crashed, killed, closed): what was really played is judged once
     * more – without moving the position on – and the session is dropped, so nothing keeps "playing".
     */
    @Synchronized
    fun onSessionEnded(packageName: String): List<WatchedEpisode> {
        val session = sessions.remove(packageName) ?: return emptyList()
        return evaluate(session, extrapolate = false)
    }

    @Synchronized
    fun tick(): List<WatchedEpisode> = sessions.values.flatMap { evaluate(it) }

    @Synchronized
    fun isPlaying(): Boolean = sessions.values.any { it.playback?.status == PlaybackStatus.PLAYING }

    private fun evaluate(session: Session, extrapolate: Boolean = true): List<WatchedEpisode> {
        val episode = session.episode ?: return emptyList()
        val playback = session.playback ?: return emptyList()
        val duration = session.snapshot.durationMs ?: return emptyList()
        if (duration < minDurationMs || episode in counted) return emptyList()

        if (position(playback, duration, extrapolate).toDouble() / duration < watchedRatio) return emptyList()
        counted += episode
        if (counted.size > MAX_COUNTED) counted.remove(counted.first())
        return listOf(episode)
    }

    /**
     * The position now: moved on with the playback speed while playing. Not moved on when the update
     * time is impossible (0, in the future) or older than the whole episode – a device that slept
     * or a player that went away without a word must not count as having played on.
     */
    private fun position(playback: PlaybackSample, duration: Long, extrapolate: Boolean): Long {
        if (!extrapolate || playback.status != PlaybackStatus.PLAYING) return playback.positionMs
        val sinceUpdate = elapsedMs() - playback.updatedAtMs
        if (playback.updatedAtMs <= 0 || sinceUpdate < 0 || sinceUpdate > duration) return playback.positionMs
        return playback.positionMs + (sinceUpdate * playback.speed).toLong()
    }

    private fun rememberUnrecognized(snapshot: MediaSnapshot) {
        unrecognizedSnapshots.remove(snapshot)
        unrecognizedSnapshots.addFirst(snapshot)
        while (unrecognizedSnapshots.size > MAX_UNRECOGNIZED) unrecognizedSnapshots.removeLast()
    }
}
