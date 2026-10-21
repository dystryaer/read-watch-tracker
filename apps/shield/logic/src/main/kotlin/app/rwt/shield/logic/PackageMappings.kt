package app.rwt.shield.logic

/**
 * Allowlist and mapping per app (SPEC §8.3). Only these packages are evaluated; YouTube, music and
 * every other app are ignored. Package names and the field layout are unverified until Spike S1
 * (SPEC §8.5) records real metadata; until then all apps share one content-based mapping.
 */
object PackageMappings {
    private const val MAX_TITLE_LENGTH = 300

    private val services = mapOf(
        "com.amazon.amazonvideo.livingroom" to "primevideo",
        "com.netflix.ninja" to "netflix",
        "com.crunchyroll.crunchyroid" to "crunchyroll",
        "com.disney.disneyplus" to "disneyplus",
    )

    // The same cleanup as the server's cleanText: bidi controls go, control characters become spaces.
    private val bidiControls = Regex("""[\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]""")
    private val controls = Regex("""\p{Cc}+""")
    private val whitespace = Regex("""[\p{Z}\s\x{FEFF}]+""")

    // Where an episode label starts inside a combined title such as "Frieren Episode 5".
    private val labelStart = Regex("""(?<![\p{L}\d])(?:s\d|season|staffel|episode|folge|ep\.?\s*\d|e\d|\d{1,3}x\d)""", RegexOption.IGNORE_CASE)
    private val trailingSeparators = Regex("""[\s\-–—:|·,]+$""")

    fun serviceFor(packageName: String): String? = services[packageName]

    /**
     * The first field that names an episode is the label; the series is the album, else another
     * field without a label, else the text before the label. Nothing without an episode number.
     */
    fun map(snapshot: MediaSnapshot): WatchedEpisode? {
        val service = serviceFor(snapshot.packageName) ?: return null
        val labels = listOf(snapshot.displaySubtitle, snapshot.title, snapshot.displayTitle, snapshot.artist, snapshot.album).map(::clean)
        val label = labels.firstOrNull { EpisodeParser.parse(it) != null } ?: return null
        val episode = EpisodeParser.parse(label) ?: return null

        val series = listOf(snapshot.album, snapshot.artist, snapshot.displayTitle, snapshot.title)
            .map(::clean)
            .firstOrNull { it.isNotEmpty() && it != label && EpisodeParser.parse(it) == null }
            ?: label.split(labelStart, limit = 2).first().replace(trailingSeparators, "")
        if (series.isEmpty()) return null
        return WatchedEpisode(service, series, episode.season, episode.episode)
    }

    private fun clean(value: String?): String =
        (value ?: "").replace(bidiControls, "").replace(controls, " ").replace(whitespace, " ").trim().take(MAX_TITLE_LENGTH)
}
