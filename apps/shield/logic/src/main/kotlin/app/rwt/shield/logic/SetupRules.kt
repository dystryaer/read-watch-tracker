package app.rwt.shield.logic

/**
 * Which tracker the app talks to. Any app on the device can start the activity with an extra,
 * so an address handed over at launch only fills in an app that is not set up yet, and the
 * device token and a running pairing belong to the tracker they were made for.
 */
object SetupRules {
    data class State(val apiUrl: String?, val paired: Boolean, val pairing: Boolean)

    /** The origin to use from a launch extra (e.g. `adb shell am start … --es apiUrl …`), or null. */
    fun launchAddress(raw: String?, current: State): String? {
        if (raw == null || current.apiUrl != null || current.paired || current.pairing) return null
        return TrackerSettings.origin(raw)
    }

    /** False when the address changes: token and pairing must then be dropped. */
    fun keepsCredentials(oldOrigin: String?, newOrigin: String?): Boolean = oldOrigin != null && oldOrigin == newOrigin
}
