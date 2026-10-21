package app.rwt.shield.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SetupRulesTest {
    private val fresh = SetupRules.State(apiUrl = null, paired = false, pairing = false)

    @Test
    fun `an address handed over at launch fills in an app that is not set up yet`() {
        assertEquals("https://tracker.example", SetupRules.launchAddress("https://tracker.example/settings", fresh))
    }

    @Test
    fun `an address handed over at launch never replaces the tracker of a set-up app`() {
        // Any app on the device can start the activity with this extra (security review M2).
        assertNull(SetupRules.launchAddress("https://evil.example", fresh.copy(apiUrl = "https://tracker.example")))
        assertNull(SetupRules.launchAddress("https://evil.example", fresh.copy(paired = true)))
        assertNull(SetupRules.launchAddress("https://evil.example", fresh.copy(pairing = true)))
    }

    @Test
    fun `an invalid address handed over at launch is ignored`() {
        assertNull(SetupRules.launchAddress("http://tracker.example", fresh))
        assertNull(SetupRules.launchAddress(null, fresh))
    }

    @Test
    fun `token and pairing belong to the tracker they were made for`() {
        assertTrue(SetupRules.keepsCredentials("https://tracker.example", "https://tracker.example"))
        assertFalse(SetupRules.keepsCredentials("https://tracker.example", "https://other.example"))
        assertFalse(SetupRules.keepsCredentials(null, "https://tracker.example"))
        assertFalse(SetupRules.keepsCredentials("https://tracker.example", null))
    }
}
