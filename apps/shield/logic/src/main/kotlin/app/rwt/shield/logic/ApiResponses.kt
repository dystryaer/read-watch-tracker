package app.rwt.shield.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import java.time.Instant
import java.time.OffsetDateTime

data class PairingStart(val code: String, val pollSecret: String, val expiresAt: Instant)

sealed interface PairingPoll {
    data object Pending : PairingPoll

    data object Expired : PairingPoll

    data class Approved(val deviceToken: String) : PairingPoll
}

/**
 * Answers of the tracker's device API (SPEC §6), checked against the same contract as
 * packages/core/src/api.ts. A broken or hostile server can cause a retry, never a bad state.
 */
object ApiResponses {
    private val code = Regex("^[A-Z0-9]{6}$")
    private val uuid = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    private val outcomes = setOf("applied", "no_change", "pending", "ignored", "rejected")

    fun pairingStart(body: String): PairingStart? {
        val answer = parseObject(body) ?: return null
        val pairingCode = answer.string("code")?.takeIf(code::matches) ?: return null
        val pollSecret = answer.string("pollSecret")?.takeIf { it.length in 20..100 } ?: return null
        val expiresAt = answer.string("expiresAt")?.let { runCatching { OffsetDateTime.parse(it).toInstant() }.getOrNull() } ?: return null
        return PairingStart(pairingCode, pollSecret, expiresAt)
    }

    fun pairingPoll(body: String): PairingPoll? {
        val answer = parseObject(body) ?: return null
        return when (answer.string("status")) {
            "pending" -> PairingPoll.Pending
            "expired" -> PairingPoll.Expired
            "approved" -> answer.string("deviceToken")?.takeIf(TrackerSettings::isDeviceToken)?.let(PairingPoll::Approved)
            else -> null
        }
    }

    /** The ids among `sent` that the server answered for; null when the answer breaks the contract. */
    fun answeredIds(body: String, sent: Set<String>): Set<String>? {
        val results = parseObject(body)?.get("results") as? JsonArray ?: return null
        val answered = mutableSetOf<String>()
        for (result in results) {
            val entry = result as? JsonObject ?: return null
            val index = (entry["index"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull ?: return null
            if (index < 0 || entry.string("outcome") !in outcomes) return null
            when (val id = entry["id"]) {
                null, JsonNull -> Unit
                else -> answered += (id as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf(uuid::matches) ?: return null
            }
        }
        return answered intersect sent
    }

    private fun parseObject(body: String): JsonObject? = runCatching { Json.parseToJsonElement(body) }.getOrNull() as? JsonObject

    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
}
