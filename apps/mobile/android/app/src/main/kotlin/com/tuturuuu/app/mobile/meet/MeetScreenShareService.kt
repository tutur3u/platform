package com.tuturuuu.app.mobile.meet

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.ResultReceiver

/** Owns only the foreground lifetime. flutter_webrtc owns consent and capture. */
class MeetScreenShareService : Service() {
    companion object {
        const val STOP_ACTION = "com.tuturuuu.meet.STOP_SCREEN_SHARE"
        const val READY_RECEIVER = "readyReceiver"
        const val GENERATION = "generation"
        private const val CHANNEL_ID = "meet-screen-sharing"
        private const val NOTIFICATION_ID = 8618
        @Volatile var stoppedListener: ((Long) -> Unit)? = null
    }

    private var foreground = false
    private var generation = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP_ACTION) {
            if (intent.getLongExtra(GENERATION, 0L) == generation) stopSelf()
            return START_NOT_STICKY
        }
        @Suppress("DEPRECATION")
        val ready = intent?.getParcelableExtra<ResultReceiver>(READY_RECEIVER)
        try {
            generation = intent?.getLongExtra(GENERATION, 0L) ?: 0L
            check(generation > 0L) { "No Meet capture owner" }
            val title = intent?.getStringExtra("title") ?: "Screen sharing"
            val stopLabel = intent?.getStringExtra("stopLabel") ?: "Stop"
            val manager = getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26) {
                manager.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, title, NotificationManager.IMPORTANCE_LOW),
                )
            }
            val stop = PendingIntent.getService(
                this, 0, Intent(this, javaClass).setAction(STOP_ACTION).putExtra(GENERATION, generation),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val builder = if (Build.VERSION.SDK_INT >= 26) {
                Notification.Builder(this, CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
            }
            val notification = builder.setContentTitle(title)
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .addAction(Notification.Action.Builder(null, stopLabel, stop).build())
                .build()
            // RequestCapturePermission must finish before Dart starts this service.
            // Do not call getMediaProjection here: Android 14 consent is single-use.
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            foreground = true
            ready?.send(0, Bundle.EMPTY)
        } catch (_: Exception) {
            ready?.send(1, Bundle.EMPTY)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        if (foreground) {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE)
            else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            foreground = false
        }
        val stoppedGeneration = generation
        val listener = stoppedListener
        Handler(Looper.getMainLooper()).post { listener?.invoke(stoppedGeneration) }
        super.onDestroy()
    }
}
