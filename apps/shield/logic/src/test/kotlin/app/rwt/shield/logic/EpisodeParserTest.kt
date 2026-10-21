package app.rwt.shield.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

class EpisodeParserTest {
    private val fixtures = Json.parseToJsonElement(CoreFiles.episodeFixtures()).jsonObject

    @TestFactory
    fun `reads every label the TypeScript parser reads`() =
        fixtures.getValue("parse").jsonArray.map { entry ->
            val case = entry.jsonObject
            val label = case.getValue("label").jsonPrimitive.content
            DynamicTest.dynamicTest(label) {
                val expected = EpisodeInfo(case.getValue("season").jsonPrimitive.intOrNull, case.getValue("episode").jsonPrimitive.int)
                assertEquals(expected, EpisodeParser.parse(label))
            }
        }

    @TestFactory
    fun `finds no episode where the TypeScript parser finds none`() =
        fixtures.getValue("reject").jsonArray.map { entry ->
            val label = entry.jsonPrimitive.content
            DynamicTest.dynamicTest("rejects \"$label\"") { assertNull(EpisodeParser.parse(label)) }
        }

    @Test
    fun `caps the label length before any pattern runs`() {
        assertNull(EpisodeParser.parse("x".repeat(5000) + " S1 E5"))
    }
}
