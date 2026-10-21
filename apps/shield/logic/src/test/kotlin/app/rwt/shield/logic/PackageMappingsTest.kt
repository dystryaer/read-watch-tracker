package app.rwt.shield.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

// Synthetic metadata (A10): the real values per app are recorded in Spike S1 (SPEC §8.5).
class PackageMappingsTest {
    private fun snapshot(
        pkg: String,
        title: String? = null,
        displayTitle: String? = null,
        displaySubtitle: String? = null,
        artist: String? = null,
        album: String? = null,
    ) = MediaSnapshot(pkg, title, displayTitle, displaySubtitle, artist, album, durationMs = 1_440_000)

    @Test
    fun `knows the four streaming apps and nothing else`() {
        assertEquals("primevideo", PackageMappings.serviceFor("com.amazon.amazonvideo.livingroom"))
        assertEquals("netflix", PackageMappings.serviceFor("com.netflix.ninja"))
        assertEquals("crunchyroll", PackageMappings.serviceFor("com.crunchyroll.crunchyroid"))
        assertEquals("disneyplus", PackageMappings.serviceFor("com.disney.disneyplus"))
        assertNull(PackageMappings.serviceFor("com.google.android.youtube.tv"))
        assertNull(PackageMappings.serviceFor("com.spotify.tv.android"))
    }

    @Test
    fun `reads the episode from one field and the series from the album`() {
        val mapped = PackageMappings.map(snapshot("com.netflix.ninja", title = "Lügen", displaySubtitle = "S2 E5 – Lügen", album = "Dark"))
        assertEquals(WatchedEpisode("netflix", "Dark", 2, 5), mapped)
    }

    @Test
    fun `takes another field for the series when there is no album`() {
        val mapped = PackageMappings.map(snapshot("com.amazon.amazonvideo.livingroom", title = "Staffel 2, Folge 5", artist = "The Boys"))
        assertEquals(WatchedEpisode("primevideo", "The Boys", 2, 5), mapped)
    }

    @Test
    fun `takes the text before the label when no field names the series`() {
        val mapped = PackageMappings.map(snapshot("com.crunchyroll.crunchyroid", title = "Frieren Episode 5"))
        assertEquals(WatchedEpisode("crunchyroll", "Frieren", null, 5), mapped)
    }

    @Test
    fun `maps nothing without an episode number`() {
        assertNull(PackageMappings.map(snapshot("com.netflix.ninja", title = "Glass Onion")))
        assertNull(PackageMappings.map(snapshot("com.netflix.ninja", title = "S2 E5")))
    }

    @Test
    fun `maps nothing for apps outside the allowlist`() {
        assertNull(PackageMappings.map(snapshot("com.google.android.youtube.tv", title = "S1 E5", album = "Some Show")))
    }

    @Test
    fun `cleans control and bidi characters out of titles like the server does`() {
        val bell = Char(7)
        val rightToLeftOverride = Char(0x202e)
        val mapped = PackageMappings.map(snapshot("com.netflix.ninja", displaySubtitle = "S1 E1", album = "Da${bell}rk$rightToLeftOverride"))
        assertEquals("Da rk", mapped?.seriesTitle)
    }

    @Test
    fun `caps overly long titles`() {
        val mapped = PackageMappings.map(snapshot("com.netflix.ninja", displaySubtitle = "S1 E1", album = "x".repeat(2000)))
        assertEquals(300, mapped?.seriesTitle?.length)
    }
}
