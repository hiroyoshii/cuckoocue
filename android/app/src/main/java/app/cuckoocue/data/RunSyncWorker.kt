package app.cuckoocue.data

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.google.firebase.auth.FirebaseAuth
import java.util.concurrent.TimeUnit

class RunSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val owner = inputData.getString("owner") ?: return Result.failure()
        val runId = inputData.getString("run_id") ?: return Result.failure()
        if (FirebaseAuth.getInstance().currentUser?.uid != owner) return Result.success()
        return when (CuckooRepository.getInstance(applicationContext).syncRunResult(runId)) {
            RunSyncResult.Synced -> Result.success()
            RunSyncResult.Retry -> Result.retry()
            RunSyncResult.Blocked -> Result.failure()
        }
    }

    companion object {
        fun enqueue(context: Context, owner: String, runId: String) {
            val request = OneTimeWorkRequestBuilder<RunSyncWorker>()
                .setInputData(workDataOf("owner" to owner, "run_id" to runId))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .build()
            // A change made during an upload needs a successor, not a dropped KEEP request.
            WorkManager.getInstance(context).enqueueUniqueWork("run-sync:$owner:$runId", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }
    }
}
