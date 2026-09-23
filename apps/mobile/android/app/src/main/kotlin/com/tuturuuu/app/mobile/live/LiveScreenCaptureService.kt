package com.tuturuuu.app.mobile.live

import android.Manifest
import android.content.pm.PackageManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

class LiveScreenCaptureService : Service() {
    companion object {
        @Volatile var active = false
            private set
        @Volatile var listener: ((Map<String, Any>) -> Unit)? = null
        private var instance: LiveScreenCaptureService? = null
        fun updateMicrophone(enabled: Boolean) { instance?.updateForeground(enabled) }
        private const val channelId = "live-screen-sharing"
        private const val notificationId = 8617
        private const val stopAction = "com.tuturuuu.live.STOP_SCREEN"
    }
    private var foregroundNotification: Notification? = null
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var worker: HandlerThread? = null
    private var handler: Handler? = null
    private var lastFrame = 0L
    @Volatile private var stopping = false

    override fun onCreate() { super.onCreate(); instance = this }
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == stopAction || intent == null || listener == null) {
            stopSelf(); return START_NOT_STICKY
        }
        if (active) return START_NOT_STICKY
        try {
            val title = intent.getStringExtra("title") ?: error("No label")
            val stopLabel = intent.getStringExtra("stopLabel") ?: error("No stop label")
            val manager = getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26) {
                manager.createNotificationChannel(NotificationChannel(channelId, title, NotificationManager.IMPORTANCE_LOW))
            }
            val stop = PendingIntent.getService(this, 0, Intent(this, javaClass).setAction(stopAction), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channelId) else Notification.Builder(this)
            val notification = builder.setContentTitle(title).setSmallIcon(android.R.drawable.ic_menu_view)
                .setOngoing(true).setCategory(Notification.CATEGORY_SERVICE)
                .addAction(Notification.Action.Builder(null, stopLabel, stop).build()).build()
            foregroundNotification = notification
            updateForeground(intent.getBooleanExtra("microphoneActive", false))
            @Suppress("DEPRECATION")
            val data = intent.getParcelableExtra<Intent>("projectionData") ?: error("No consent")
            val captureManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val capture = captureManager.getMediaProjection(intent.getIntExtra("resultCode", 0), data) ?: error("No capture")
            projection = capture
            worker = HandlerThread("live-screen-frames").also { it.start() }
            handler = Handler(worker!!.looper)
            capture.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { stopSelf() }
                override fun onCapturedContentResize(width: Int, height: Int) {
                    handler?.post {
                        if (!stopping && active) try { configureSurface(width, height) }
                        catch (_: Exception) {
                            listener?.invoke(mapOf("type" to "error", "code" to "capture_unavailable"))
                            stopSelf()
                        }
                    }
                }
            }, handler)
            val metrics = resources.displayMetrics
            configureSurface(metrics.widthPixels, metrics.heightPixels)
            active = true
            listener?.invoke(mapOf("type" to "started"))
        } catch (_: Exception) {
            listener?.invoke(mapOf("type" to "error", "code" to "capture_unavailable"))
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun updateForeground(microphoneActive: Boolean) {
        val notification = foregroundNotification ?: return
        if (Build.VERSION.SDK_INT >= 29) {
            var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            if (microphoneActive && Build.VERSION.SDK_INT >= 30) {
                check(checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }
            startForeground(notificationId, notification, types)
        } else startForeground(notificationId, notification)
    }

    private fun configureSurface(width: Int, height: Int) {
        if (width <= 0 || height <= 0) return
        val scale = minOf(1.0, 1280.0 / max(width, height))
        val w = (width * scale).roundToInt().coerceAtLeast(1)
        val h = (height * scale).roundToInt().coerceAtLeast(1)
        val old = reader
        val next = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
        reader = next
        next.setOnImageAvailableListener({ source ->
            // A resize can close the previous reader before its queued callback runs.
            val image = try { source.acquireLatestImage() }
                catch (_: IllegalStateException) { null }
                ?: return@setOnImageAvailableListener
            try {
                val now = System.nanoTime()
                if (stopping || listener == null || now - lastFrame < 600_000_000L) return@setOnImageAvailableListener
                lastFrame = now
                val plane = image.planes[0]
                val paddedWidth = plane.rowStride / plane.pixelStride
                val padded = Bitmap.createBitmap(paddedWidth, image.height, Bitmap.Config.ARGB_8888)
                try {
                    padded.copyPixelsFromBuffer(plane.buffer)
                    val frame = Bitmap.createBitmap(padded, 0, 0, image.width, image.height)
                    try {
                        val bytes = ByteArrayOutputStream()
                        frame.compress(Bitmap.CompressFormat.JPEG, 65, bytes)
                        if (bytes.size() <= 512 * 1024) listener?.invoke(mapOf("type" to "frame", "bytes" to bytes.toByteArray()))
                    } finally { if (frame !== padded) frame.recycle() }
                } finally { padded.recycle() }
            } catch (_: Exception) {
                listener?.invoke(mapOf("type" to "error", "code" to "capture_unavailable"))
                stopSelf()
            } finally { image.close() }
        }, handler)
        if (display == null) {
            display = projection?.createVirtualDisplay("Tuturuuu Live", w, h, resources.displayMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, next.surface, null, handler)
        } else {
            display?.resize(w, h, resources.displayMetrics.densityDpi)
            display?.surface = next.surface
        }
        old?.close()
    }

    override fun onDestroy() {
        stopping = true
        active = false
        if (instance === this) instance = null
        foregroundNotification = null
        // Release on the frame queue so an in-flight image is never closed underneath encoding.
        val cleanup = Runnable {
            display?.release(); display = null
            reader?.close(); reader = null
            projection?.stop(); projection = null
            worker?.quitSafely(); worker = null; handler = null
        }
        if (handler?.post(cleanup) != true) cleanup.run()
        stopForeground(STOP_FOREGROUND_REMOVE)
        listener?.invoke(mapOf("type" to "stopped"))
        super.onDestroy()
    }
}
