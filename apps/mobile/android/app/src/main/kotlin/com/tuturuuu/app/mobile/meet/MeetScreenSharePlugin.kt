package com.tuturuuu.app.mobile.meet

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ResultReceiver
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class MeetScreenSharePlugin : FlutterPlugin, MethodChannel.MethodCallHandler, EventChannel.StreamHandler {
    private var context: Context? = null
    private var methods: MethodChannel? = null
    private var events: EventChannel? = null
    private var sink: EventChannel.EventSink? = null
    private val handler = Handler(Looper.getMainLooper())
    private var pendingStart: MethodChannel.Result? = null
    private var startTimeout: Runnable? = null
    private var tone: ToneGenerator? = null
    private var releaseTone: Runnable? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        methods = MethodChannel(binding.binaryMessenger, "mobile/meet_screen_share").also {
            it.setMethodCallHandler(this)
        }
        events = EventChannel(binding.binaryMessenger, "mobile/meet_screen_share/events").also {
            it.setStreamHandler(this)
        }
        MeetScreenShareService.stoppedListener = { sink?.success("stopped") }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val appContext = context
        if (appContext == null) {
            result.error("unavailable", "Meet screen share bridge is detached", null)
            return
        }
        when (call.method) {
            "start" -> start(appContext, call, result)
            "stop" -> {
                finishStart("cancelled")
                appContext.stopService(Intent(appContext, MeetScreenShareService::class.java))
                result.success(null)
            }
            "sound" -> {
                playSound(appContext)
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    private fun start(appContext: Context, call: MethodCall, result: MethodChannel.Result) {
        if (pendingStart != null) {
            result.error("busy", "Meet screen share is already starting", null)
            return
        }
        pendingStart = result
        val ready = object : ResultReceiver(handler) {
            override fun onReceiveResult(resultCode: Int, resultData: Bundle?) {
                // A late callback after cancellation cannot restart capture in Dart.
                if (pendingStart !== result) return
                finishStart(if (resultCode == 0) null else "capture_unavailable")
            }
        }
        startTimeout = Runnable {
            if (pendingStart !== result) return@Runnable
            finishStart("capture_unavailable")
            appContext.stopService(Intent(appContext, MeetScreenShareService::class.java))
        }.also { handler.postDelayed(it, 10000) }
        val intent = Intent(appContext, MeetScreenShareService::class.java)
            .putExtra("title", call.argument<String>("title"))
            .putExtra("stopLabel", call.argument<String>("stopLabel"))
            .putExtra(MeetScreenShareService.READY_RECEIVER, ready)
        try {
            if (Build.VERSION.SDK_INT >= 26) appContext.startForegroundService(intent)
            else appContext.startService(intent)
        } catch (_: Exception) {
            finishStart("capture_unavailable")
            appContext.stopService(Intent(appContext, MeetScreenShareService::class.java))
        }
    }

    private fun finishStart(error: String?) {
        startTimeout?.let(handler::removeCallbacks)
        startTimeout = null
        val result = pendingStart ?: return
        pendingStart = null
        if (error == null) result.success(null)
        else result.error(error, "Meet screen sharing could not start", null)
    }

    private fun playSound(appContext: Context) {
        // Respect silent/vibrate mode, notification volume and OS audio policy.
        try {
            val notifications = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 23 &&
                notifications.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL) return
            val audio = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL ||
                audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) == 0) return
            releaseTone?.let(handler::removeCallbacks)
            tone?.release()
            tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 35).also {
                it.startTone(ToneGenerator.TONE_PROP_BEEP, 180)
            }
            releaseTone = Runnable {
                tone?.release()
                tone = null
                releaseTone = null
            }.also { handler.postDelayed(it, 250) }
        } catch (_: Exception) {
            // A notification sound failure must not interrupt a call.
        }
    }

    override fun onListen(arguments: Any?, eventSink: EventChannel.EventSink?) { sink = eventSink }
    override fun onCancel(arguments: Any?) { sink = null }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        finishStart("cancelled")
        context?.let { it.stopService(Intent(it, MeetScreenShareService::class.java)) }
        MeetScreenShareService.stoppedListener = null
        releaseTone?.let(handler::removeCallbacks)
        tone?.release()
        tone = null
        releaseTone = null
        methods?.setMethodCallHandler(null)
        events?.setStreamHandler(null)
        sink = null
        context = null
    }
}
