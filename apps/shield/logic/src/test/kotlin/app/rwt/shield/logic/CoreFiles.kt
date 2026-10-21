package app.rwt.shield.logic

import java.io.File

/** Files shared with packages/core, so the TypeScript and Kotlin sides test the same cases. */
object CoreFiles {
    private val coreDir = File(requireNotNull(System.getProperty("rwt.coreDir")) { "rwt.coreDir is set by build.gradle.kts" })

    fun episodeFixtures(): String = File(coreDir, "fixtures/episodes.json").readText()

    fun eventSchema(): String = File(coreDir, "event.schema.json").readText()
}
