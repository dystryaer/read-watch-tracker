package app.rwt.shield.logic

import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.ConcurrentHashMap

/**
 * Events wait in a JSON-lines file in the app's private storage until the server acknowledged
 * them (SPEC §8.4). Every line is validated on load, so a damaged or edited file costs only its
 * bad lines. The listener service and the flush worker share one lock per file.
 */
class FileOutbox(private val file: File, private val limit: Int = 5_000) {
    companion object {
        private const val MAX_LINE_LENGTH = 4_096
        private val locks = ConcurrentHashMap<String, Any>()
    }

    private val lock: Any = locks.getOrPut(file.absoluteFile.normalize().path) { Any() }

    /** False for an event the server would not accept: it is not queued (and must not be shown as counted). */
    fun add(event: OutboxEvent): Boolean = synchronized(lock) {
        if (!event.isValid()) return false
        val events = load()
        if (events.none { it.id == event.id }) save((events + event).takeLast(limit))
        true
    }

    fun peek(max: Int): List<OutboxEvent> = synchronized(lock) { load().take(max) }

    fun remove(ids: Set<String>) = synchronized(lock) {
        if (ids.isNotEmpty()) save(load().filterNot { it.id in ids })
    }

    fun size(): Int = synchronized(lock) { load().size }

    private fun load(): List<OutboxEvent> {
        if (!file.isFile) return emptyList()
        return file.useLines { lines ->
            lines.filter { it.isNotEmpty() && it.length <= MAX_LINE_LENGTH }.mapNotNull(EventJson::decode).toList()
        }
    }

    // Written to a temporary file and moved over the old one, so a crash never leaves half a file.
    private fun save(events: List<OutboxEvent>) {
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeText(events.joinToString("") { EventJson.encode(it) + "\n" })
        try {
            Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }
}
