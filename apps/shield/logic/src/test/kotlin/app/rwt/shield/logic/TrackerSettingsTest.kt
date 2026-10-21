package app.rwt.shield.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

class TrackerSettingsTest {
    @Test
    fun `keeps only the origin of an https address`() {
        assertEquals("https://tracker.example", TrackerSettings.origin(" https://Tracker.example/settings?x=1 "))
        assertEquals("https://tracker.example:8443", TrackerSettings.origin("https://tracker.example:8443/"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["https://tracker.example:99999", "https://tracker.example:0", "http://tracker.example", "http://192.168.1.10:3000", "ftp://tracker.example", "javascript:alert(1)", "https://user:pw@tracker.example", "tracker.example", ""])
    fun `refuses addresses the token must not travel to`(raw: String) {
        assertNull(TrackerSettings.origin(raw))
    }

    @Test
    fun `accepts only well-formed device tokens`() {
        assertTrue(TrackerSettings.isDeviceToken("Ab-_".repeat(10) + "xyz"))
        assertFalse(TrackerSettings.isDeviceToken("A".repeat(42)))
        assertFalse(TrackerSettings.isDeviceToken("A".repeat(43) + "\n"))
        assertFalse(TrackerSettings.isDeviceToken(null))
    }
}
