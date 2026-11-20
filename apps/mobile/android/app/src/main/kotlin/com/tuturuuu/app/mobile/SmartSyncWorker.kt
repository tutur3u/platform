package com.tuturuuu.app.mobile

import android.content.Context
import android.net.ConnectivityManager
import android.os.BatteryManager
import android.os.PowerManager
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.util.UUID
import java.util.concurrent.TimeUnit

class SmartSyncWorker(
    context: Context,
    params: WorkerParameters,
) : Worker(context, params) {
    override fun doWork(): Result {
        if (backgroundAllowed(applicationContext)) {
            synchronized(hintLock) {
                preferences(applicationContext).edit().putString(hint, UUID.randomUUID().toString()).apply()
            }
        }
        return Result.success()
    }

    companion object {
        private const val workName = "mobile-smart-sync"
        private const val hint = "refresh-hint-token"
        private val hintLock = Any()

        private fun preferences(context: Context) =
            context.getSharedPreferences(workName, Context.MODE_PRIVATE)

        private fun backgroundAllowed(context: Context): Boolean {
            val power = context.getSystemService(PowerManager::class.java)
            val battery = context.getSystemService(BatteryManager::class.java)
            val network = context.getSystemService(ConnectivityManager::class.java)
            return power != null && !power.isPowerSaveMode &&
                (battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1) >= 20 &&
                network != null && network.activeNetwork != null &&
                !network.isActiveNetworkMetered &&
                network.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_DISABLED
        }

        fun install(context: Context, messenger: BinaryMessenger) {
            val app = context.applicationContext
            MethodChannel(messenger, "mobile/smart_sync").setMethodCallHandler { call, result ->
                when (call.method) {
                    "backgroundAllowed" -> result.success(backgroundAllowed(app))
                    "peekOsHintAndSchedule" -> {
                        val pending = preferences(app).getString(hint, null)
                        WorkManager.getInstance(app).enqueueUniqueWork(
                            workName,
                            ExistingWorkPolicy.KEEP,
                            OneTimeWorkRequestBuilder<SmartSyncWorker>()
                                .setInitialDelay(1, TimeUnit.HOURS)
                                .setConstraints(
                                    Constraints.Builder()
                                        .setRequiredNetworkType(NetworkType.UNMETERED)
                                        .setRequiresBatteryNotLow(true)
                                        .build(),
                                )
                                .build(),
                        )
                        result.success(pending)
                    }
                    "completeOsHint" -> {
                        synchronized(hintLock) {
                            val prefs = preferences(app)
                            val token = call.arguments as? String
                            if (token != null && prefs.getString(hint, null) == token) {
                                prefs.edit().remove(hint).apply()
                            }
                        }
                        result.success(null)
                    }
                    "cancelOsRefresh" -> {
                        WorkManager.getInstance(app).cancelUniqueWork(workName)
                        synchronized(hintLock) {
                            preferences(app).edit().remove(hint).apply()
                        }
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
        }
    }
}
