package app.rwt.shield

import android.content.ComponentName
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSession
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import app.rwt.shield.logic.EventFactory
import app.rwt.shield.logic.MediaSnapshot
import app.rwt.shield.logic.PackageMappings
import app.rwt.shield.logic.PlaybackSample
import app.rwt.shield.logic.PlaybackStatus
import app.rwt.shield.logic.WatchTracker
import app.rwt.shield.logic.WatchedEpisode
import java.time.Instant
import java.util.concurrent.Executors

/**
 * Watches what is playing (SPEC §8.1): the notification-listener grant only unlocks
 * MediaSessionManager.getActiveSessions – notifications themselves are never read. Only apps on the
 * allowlist are evaluated (debug builds also log the others for Spike S1).
 */
class MediaWatcherService : NotificationListenerService() {
    private val handler = Handler(Looper.getMainLooper())
    // Outbox and preference writes stay off the main thread; one thread keeps their order.
    private val writer = Executors.newSingleThreadExecutor()
    private val tracker = WatchTracker(elapsedMs = SystemClock::elapsedRealtime)
    private val events = EventFactory(now = Instant::now)
    private val watched = mutableMapOf<MediaSession.Token, Pair<MediaController, MediaController.Callback>>()
    private val settings by lazy { ShieldSettings(this) }
    private val outbox by lazy { ShieldSettings.outbox(this) }
    private val spike by lazy { if (BuildConfig.DEBUG) SpikeLogger(this) else null }
    private val component by lazy { ComponentName(this, MediaWatcherService::class.java) }
    private var sessions: MediaSessionManager? = null

    private val onSessionsChanged = MediaSessionManager.OnActiveSessionsChangedListener { controllers -> watch(controllers.orEmpty()) }

    // While something plays, the position is checked every 30 seconds (SPEC §8.3).
    private val tick = object : Runnable {
        override fun run() {
            record(tracker.tick())
            if (tracker.isPlaying()) handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onListenerConnected() {
        SpikeLogger.discardOutsideDebug(this)
        val manager = getSystemService(MediaSessionManager::class.java) ?: return
        sessions = manager
        manager.addOnActiveSessionsChangedListener(onSessionsChanged, component, handler)
        watch(manager.getActiveSessions(component))
    }

    override fun onListenerDisconnected() {
        stopWatching()
        // Ask Android to bind again, so tracking resumes without the user (SPEC §8.4).
        requestRebind(component)
    }

    override fun onDestroy() {
        stopWatching()
        writer.shutdown()
        super.onDestroy()
    }

    private fun watch(controllers: List<MediaController>) {
        val active = controllers.associateBy { it.sessionToken }
        (watched.keys - active.keys).forEach(::unwatch)
        for ((token, controller) in active) {
            if (token in watched) continue
            val allowlisted = PackageMappings.serviceFor(controller.packageName) != null
            if (!allowlisted && spike == null) continue

            val callback = object : MediaController.Callback() {
                override fun onMetadataChanged(metadata: MediaMetadata?) = onMetadata(controller, metadata)

                override fun onPlaybackStateChanged(state: PlaybackState?) = onPlayback(controller.packageName, state)

                override fun onSessionDestroyed() = unwatch(token)
            }
            controller.registerCallback(callback, handler)
            watched[token] = controller to callback
            onMetadata(controller, controller.metadata)
            onPlayback(controller.packageName, controller.playbackState)
        }
    }

    // A session that is gone must not keep "playing" in the tracker (crash, kill, app closed).
    private fun unwatch(token: MediaSession.Token) {
        val (controller, callback) = watched.remove(token) ?: return
        controller.unregisterCallback(callback)
        record(tracker.onSessionEnded(controller.packageName))
    }

    private fun stopWatching() {
        sessions?.removeOnActiveSessionsChangedListener(onSessionsChanged)
        sessions = null
        watched.keys.toList().forEach(::unwatch)
        handler.removeCallbacks(tick)
    }

    // The player's current state goes along: on autoplay it can arrive before the new metadata.
    private fun onMetadata(controller: MediaController, metadata: MediaMetadata?) {
        val packageName = controller.packageName
        spike?.metadata(packageName, metadata)
        if (metadata == null) return
        record(tracker.onMetadata(snapshotOf(packageName, metadata), current = controller.playbackState?.let(::sampleOf)))
        rearmTick()
        settings.unrecognized = tracker.unrecognized.map { snapshot ->
            listOfNotNull(snapshot.displaySubtitle, snapshot.title, snapshot.displayTitle, snapshot.artist, snapshot.album)
                .filter { it.isNotBlank() }
                .joinToString(" · ")
                .ifEmpty { snapshot.packageName }
        }
    }

    private fun onPlayback(packageName: String, state: PlaybackState?) {
        spike?.playback(packageName, state)
        if (state == null) return
        record(tracker.onPlayback(packageName, sampleOf(state)))
        rearmTick()
    }

    private fun rearmTick() {
        handler.removeCallbacks(tick)
        if (tracker.isPlaying()) handler.postDelayed(tick, TICK_MS)
    }

    private fun record(episodes: List<WatchedEpisode>) {
        if (episodes.isEmpty() || writer.isShutdown) return
        val now = Instant.now()
        val queued = episodes.map { it to events.watched(it) }
        writer.execute {
            // Only what the outbox accepted is shown as counted.
            for ((episode, event) in queued) if (outbox.add(event)) settings.addRecent(episode, now)
            FlushWorker.schedule(this)
        }
    }

    private fun snapshotOf(packageName: String, metadata: MediaMetadata) = MediaSnapshot(
        packageName = packageName,
        title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE),
        displayTitle = metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE),
        displaySubtitle = metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE),
        artist = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST),
        album = metadata.getString(MediaMetadata.METADATA_KEY_ALBUM),
        durationMs = metadata.getLong(MediaMetadata.METADATA_KEY_DURATION).takeIf { it > 0 },
    )

    private fun sampleOf(state: PlaybackState) = PlaybackSample(
        status = when (state.state) {
            PlaybackState.STATE_PLAYING -> PlaybackStatus.PLAYING
            PlaybackState.STATE_PAUSED -> PlaybackStatus.PAUSED
            PlaybackState.STATE_STOPPED -> PlaybackStatus.STOPPED
            else -> PlaybackStatus.OTHER
        },
        positionMs = state.position,
        speed = state.playbackSpeed,
        updatedAtMs = state.lastPositionUpdateTime,
    )

    private companion object {
        const val TICK_MS = 30_000L
    }
}
