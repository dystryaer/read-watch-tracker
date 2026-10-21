package app.rwt.shield.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.junit.jupiter.api.Test
import java.time.Instant

/** Answers from the network are untrusted: anything outside the contract is refused. */
class ApiResponsesTest {
    private val token = "A".repeat(43)

    @Test
    fun `reads a pairing start`() {
        val body = """{"code":"K7P3QX","pollSecret":"${"s".repeat(43)}","expiresAt":"2026-10-21T20:10:00.000Z"}"""
        assertEquals(PairingStart("K7P3QX", "s".repeat(43), Instant.parse("2026-10-21T20:10:00Z")), ApiResponses.pairingStart(body))
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            """{"code":"k7p3qx","pollSecret":"ssssssssssssssssssssssssssssssssss","expiresAt":"2026-10-21T20:10:00Z"}""",
            """{"code":"K7P3QX1","pollSecret":"ssssssssssssssssssssssssssssssssss","expiresAt":"2026-10-21T20:10:00Z"}""",
            """{"code":"K7P3QX","pollSecret":"short","expiresAt":"2026-10-21T20:10:00Z"}""",
            """{"code":"K7P3QX","pollSecret":"ssssssssssssssssssssssssssssssssss","expiresAt":"tomorrow"}""",
            """{"code":"<b>","pollSecret":"ssssssssssssssssssssssssssssssssss","expiresAt":"2026-10-21T20:10:00Z"}""",
            "not json",
        ],
    )
    fun `refuses a pairing start outside the contract`(body: String) {
        assertNull(ApiResponses.pairingStart(body))
    }

    @Test
    fun `reads the pairing poll states`() {
        assertEquals(PairingPoll.Pending, ApiResponses.pairingPoll("""{"status":"pending"}"""))
        assertEquals(PairingPoll.Expired, ApiResponses.pairingPoll("""{"status":"expired"}"""))
        assertEquals(PairingPoll.Approved(token), ApiResponses.pairingPoll("""{"status":"approved","deviceToken":"$token"}"""))
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            """{"status":"approved","deviceToken":"short"}""",
            """{"status":"approved"}""",
            """{"status":"hacked"}""",
            """[]""",
        ],
    )
    fun `refuses a pairing poll outside the contract`(body: String) {
        assertNull(ApiResponses.pairingPoll(body))
    }

    @Test
    fun `reads the ids the server answered, ignoring ids it was not sent`() {
        val sent = setOf("6f1c0a52-8d4b-4a8e-9a7c-2f6b5d1e0c11")
        val body = """{"results":[{"id":"6f1c0a52-8d4b-4a8e-9a7c-2f6b5d1e0c11","index":0,"outcome":"applied"},{"id":"00000000-0000-4000-8000-000000000000","index":1,"outcome":"applied"},{"id":null,"index":2,"outcome":"rejected","reason":"invalid"}]}"""
        assertEquals(sent, ApiResponses.answeredIds(body, sent))
    }

    @Test
    fun `refuses event results with an unknown outcome`() {
        assertNull(ApiResponses.answeredIds("""{"results":[{"id":null,"index":0,"outcome":"deleted-everything"}]}""", emptySet()))
    }
}
