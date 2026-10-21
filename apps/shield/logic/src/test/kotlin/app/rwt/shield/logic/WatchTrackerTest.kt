package app.rwt.shield.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WatchTrackerTest {
    private var elapsed = 0L
    private val tracker = WatchTracker(elapsedMs = { elapsed })
    private val netflix = "com.netflix.ninja"

    private fun episode(number: Int, durationMs: Long? = 3_000_000, pkg: String = netflix) =
        MediaSnapshot(pkg, title = "Folge $number", displayTitle = null, displaySubtitle = "S2 E$number", artist = null, album = "Dark", durationMs = durationMs)

    private fun playing(positionMs: Long) = PlaybackSample(PlaybackStatus.PLAYING, positionMs, 1f, elapsed)

    private fun paused(positionMs: Long) = PlaybackSample(PlaybackStatus.PAUSED, positionMs, 1f, elapsed)

    private fun dark(number: Int) = WatchedEpisode("netflix", "Dark", 2, number)

    @Test
    fun `counts an episode once 85 percent have played, and only once`() {
        tracker.onMetadata(episode(5))
        assertEquals(emptyList<WatchedEpisode>(), tracker.onPlayback(netflix, playing(0)))

        elapsed = 2_500_000 // 83 %
        assertEquals(emptyList<WatchedEpisode>(), tracker.tick())
        elapsed = 2_560_000 // 85.3 %
        assertEquals(listOf(dark(5)), tracker.tick())
        elapsed = 2_900_000
        assertEquals(emptyList<WatchedEpisode>(), tracker.tick())
    }

    @Test
    fun `uses the reported position while paused`() {
        tracker.onMetadata(episode(5))
        elapsed = 10_000_000 // time passes, but the player is paused
        assertEquals(emptyList<WatchedEpisode>(), tracker.onPlayback(netflix, paused(1_000_000)))
        assertEquals(listOf(dark(5)), tracker.onPlayback(netflix, paused(2_600_000)))
    }

    @Test
    fun `respects the playback speed`() {
        tracker.onMetadata(episode(5))
        tracker.onPlayback(netflix, PlaybackSample(PlaybackStatus.PLAYING, 0, 2f, elapsed))
        elapsed = 1_300_000 // 2.6 million ms of video at double speed
        assertEquals(listOf(dark(5)), tracker.tick())
    }

    @Test
    fun `evaluates the previous episode once more when autoplay switches the metadata`() {
        tracker.onMetadata(episode(5))
        tracker.onPlayback(netflix, playing(0))
        elapsed = 2_700_000 // no tick in between

        assertEquals(listOf(dark(5)), tracker.onMetadata(episode(6)))
    }

    @Test
    fun `does not count an episode left early, also when the next one starts`() {
        tracker.onMetadata(episode(5))
        tracker.onPlayback(netflix, playing(0))
        elapsed = 1_000_000

        assertEquals(emptyList<WatchedEpisode>(), tracker.onMetadata(episode(6)))
    }

    @Test
    fun `ignores repeated identical metadata`() {
        tracker.onMetadata(episode(5))
        tracker.onPlayback(netflix, playing(0))
        elapsed = 2_000_000
        assertEquals(emptyList<WatchedEpisode>(), tracker.onMetadata(episode(5)))
        elapsed = 2_600_000
        assertEquals(listOf(dark(5)), tracker.tick())
    }

    @Test
    fun `does not count an episode twice when it is played again`() {
        tracker.onMetadata(episode(5))
        tracker.onPlayback(netflix, paused(2_900_000))
        tracker.onMetadata(episode(6))
        tracker.onMetadata(episode(5))

        assertEquals(emptyList<WatchedEpisode>(), tracker.onPlayback(netflix, paused(2_950_000)))
    }

    @Test
    fun `ignores apps outside the allowlist completely`() {
        val youtube = episode(5, pkg = "com.google.android.youtube.tv")
        assertEquals(emptyList<WatchedEpisode>(), tracker.onMetadata(youtube))
        assertEquals(emptyList<WatchedEpisode>(), tracker.onPlayback(youtube.packageName, paused(2_950_000)))
        assertTrue(tracker.unrecognized.isEmpty())
    }

    @Test
    fun `lists metadata it cannot read as unrecognized and sends nothing for it`() {
        val movie = MediaSnapshot(netflix, title = "Glass Onion", displayTitle = null, displaySubtitle = null, artist = null, album = null, durationMs = 8_000_000)
        tracker.onMetadata(movie)
        tracker.onMetadata(movie)

        assertEquals(emptyList<WatchedEpisode>(), tracker.onPlayback(netflix, paused(7_900_000)))
        assertEquals(listOf(movie), tracker.unrecognized)
    }

    @Test
    fun `keeps the unrecognized list short`() {
        repeat(30) { number ->
            tracker.onMetadata(MediaSnapshot(netflix, title = "Film $number", displayTitle = null, displaySubtitle = null, artist = null, album = null, durationMs = 1))
        }
        assertEquals(WatchTracker.MAX_UNRECOGNIZED, tracker.unrecognized.size)
        assertEquals("Film 29", tracker.unrecognized.first().title)
    }

    @Test
    fun `ignores short clips and unknown durations`() {
        tracker.onMetadata(episode(5, durationMs = 30_000))
        assertEquals(emptyList<WatchedEpisode>(), tracker.onPlayback(netflix, paused(29_000)))
        tracker.onMetadata(episode(6, durationMs = null))
        assertEquals(emptyList<WatchedEpisode>(), tracker.onPlayback(netflix, paused(29_000_000)))
    }

    @Test
    fun `keeps the sessions of different apps apart`() {
        val prime = "com.amazon.amazonvideo.livingroom"
        tracker.onMetadata(episode(5))
        tracker.onMetadata(MediaSnapshot(prime, title = "S1 E2", displayTitle = null, displaySubtitle = null, artist = "The Boys", album = null, durationMs = 3_000_000))

        assertEquals(listOf(WatchedEpisode("primevideo", "The Boys", 1, 2)), tracker.onPlayback(prime, paused(2_800_000)))
        assertEquals(listOf(dark(5)), tracker.onPlayback(netflix, paused(2_800_000)))
    }

    @Test
    fun `knows whether anything is playing, for the 30-second check`() {
        assertFalse(tracker.isPlaying())
        tracker.onMetadata(episode(5))
        tracker.onPlayback(netflix, playing(0))
        assertTrue(tracker.isPlaying())
        tracker.onPlayback(netflix, paused(10))
        assertFalse(tracker.isPlaying())
    }
}
