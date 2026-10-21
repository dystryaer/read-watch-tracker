package app.rwt.shield

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import app.rwt.shield.logic.EventTransport
import app.rwt.shield.logic.FlushResult
import app.rwt.shield.logic.OutboxFlusher
import java.util.concurrent.TimeUnit

/** Empties the outbox once the network is up, with exponential backoff (SPEC §8.4). */
class FlushWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val settings = ShieldSettings(applicationContext)
        val apiUrl = settings.apiUrl ?: return Result.success()
        val token = settings.deviceToken ?: return Result.success()
        val http = TrackerHttp(apiUrl)
        val transport = EventTransport { payload -> http.post("/api/v1/events", payload, token) }
        val flusher = OutboxFlusher(ShieldSettings.outbox(applicationContext), transport)

        return when (val result = flusher.flush()) {
            is FlushResult.Done -> Result.success()
            is FlushResult.Retry -> {
                val wait = result.retryAfterMs ?: return Result.retry()
                // The server said when: a follow-up run after exactly that wait instead of the backoff.
                schedule(applicationContext, delayMs = wait)
                Result.success()
            }
            FlushResult.Unauthorized -> {
                // Revoked in the web app: forget the token, keep the events for a new pairing.
                settings.deviceToken = null
                Result.success()
            }
        }
    }

    companion object {
        private const val WORK_NAME = "flush"

        /**
         * `now` (the "Jetzt senden" button) replaces a run that waits in backoff; otherwise new
         * events queue up behind the current run.
         */
        fun schedule(context: Context, now: Boolean = false, delayMs: Long = 0) {
            val request = OneTimeWorkRequestBuilder<FlushWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                .build()
            val policy = if (now) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.APPEND_OR_REPLACE
            WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, policy, request)
        }
    }
}
