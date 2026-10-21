package app.rwt.shield.logic

data class EpisodeInfo(val season: Int?, val episode: Int)

/**
 * Season and episode from a metadata label, the same way as `parseEpisode` in packages/core:
 * both are tested against packages/core/fixtures/episodes.json. The first matching pattern
 * decides; a number out of range (season 0 specials, episode 0) means "no episode".
 */
object EpisodeParser {
    private const val MAX_LABEL_LENGTH = 500
    private const val MAX_SEASON = 999
    private const val MAX_EPISODE = 99_999
    private val ignoreCase = setOf(RegexOption.IGNORE_CASE)

    // JavaScript's \s also covers no-break and other Unicode spaces; Java's does not, so they are folded first.
    private val unicodeSpace = Regex("""[\p{Z}\s]+""")

    private val seasonAndEpisode = listOf(
        Regex("""(?<![\p{L}\d])s(\d{1,4})\s*[:.]?\s*e(\d{1,6})(?!\d)""", ignoreCase),
        Regex("""(?<![\p{L}\d])(?:season|staffel)\s*(\d{1,4})\s*[,·:–—-]?\s*(?:episode|folge|ep\.?)\s*(\d{1,6})(?!\d)""", ignoreCase),
        Regex("""(?<![\p{L}\d])(\d{1,3})x(\d{1,4})(?!\d)"""),
    )

    // A bare "E5" only at the start, so "Live E3 2024" is not episode 3.
    private val episodeOnly = listOf(
        Regex("""^\s*e(\d{1,6})(?!\d)""", ignoreCase),
        Regex("""(?<![\p{L}\d])(?:episode|folge|ep\.?)\s*(\d{1,6})(?!\d)""", ignoreCase),
    )

    fun parse(raw: String): EpisodeInfo? {
        if (raw.length > MAX_LABEL_LENGTH) return null
        val label = raw.replace(unicodeSpace, " ")
        for (pattern in seasonAndEpisode) {
            val match = pattern.find(label) ?: continue
            return checked(match.groupValues[1].toInt(), match.groupValues[2].toInt())
        }
        for (pattern in episodeOnly) {
            val match = pattern.find(label) ?: continue
            return checked(null, match.groupValues[1].toInt())
        }
        return null
    }

    private fun checked(season: Int?, episode: Int): EpisodeInfo? {
        if (season != null && season !in 1..MAX_SEASON) return null
        if (episode !in 1..MAX_EPISODE) return null
        return EpisodeInfo(season, episode)
    }
}
