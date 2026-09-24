package com.tuturuuu.app.mobile.live

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.PluginRegistry

class LiveScreenCapturePlugin : FlutterPlugin, ActivityAware,
    MethodChannel.MethodCallHandler, EventChannel.StreamHandler,
    PluginRegistry.ActivityResultListener {
    private lateinit var context: Context
    private lateinit var methods: MethodChannel
    private lateinit var events: EventChannel
    private var binding: ActivityPluginBinding? = null
    private var pending: MethodChannel.Result? = null
    private var awaitingConsent = false
    private var title = ""
    private var stopLabel = ""
    private var microphoneActive = false
    private val requestCode = 8617

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        methods = MethodChannel(binding.binaryMessenger, "mobile/live_screen_capture")
        events = EventChannel(binding.binaryMessenger, "mobile/live_screen_capture/events")
        methods.setMethodCallHandler(this)
        events.setStreamHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "start" -> {
                val activity = binding?.activity
                if (activity == null || awaitingConsent || LiveScreenCaptureService.active) {
                    result.error("capture_busy", "Screen capture is unavailable", null)
                    return
                }
                title = call.argument<String>("notificationTitle") ?: ""
                stopLabel = call.argument<String>("stopLabel") ?: ""
                if (title.isBlank() || stopLabel.isBlank()) {
                    result.error("capture_invalid", "Missing capture labels", null)
                    return
                }
                microphoneActive = call.argument<Boolean>("microphoneActive") == true
                pending = result
                awaitingConsent = true
                try {
                    val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                    val consent = if (Build.VERSION.SDK_INT >= 34) {
                        manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
                    } else manager.createScreenCaptureIntent()
                    activity.startActivityForResult(consent, requestCode)
                } catch (_: Exception) {
                    pending = null; awaitingConsent = false
                    result.error("capture_unavailable", "Screen capture could not start", null)
                }
            }
            "setMicrophoneActive" -> {
                microphoneActive = call.argument<Boolean>("active") == true
                try {
                    LiveScreenCaptureService.updateMicrophone(microphoneActive)
                    result.success(null)
                } catch (_: Exception) {
                    stop()
                    result.error("capture_unavailable", "Background microphone unavailable", null)
                }
            }
            "stop" -> { stop(); result.success(null) }
            else -> result.notImplemented()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != this.requestCode) return false
        awaitingConsent = false
        val response = pending ?: return true
        pending = null
        if (resultCode != Activity.RESULT_OK || data == null) {
            response.success(false)
            return true
        }
        if (LiveScreenCaptureService.listener == null) {
            response.error("capture_unavailable", "Screen capture listener is unavailable", null)
            return true
        }
        val intent = Intent(context, LiveScreenCaptureService::class.java)
            .putExtra("projectionData", data).putExtra("resultCode", resultCode)
            .putExtra("title", title).putExtra("stopLabel", stopLabel)
            .putExtra("microphoneActive", microphoneActive)
        try {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent)
            else context.startService(intent)
            response.success(true)
        } catch (_: Exception) {
            response.error("capture_unavailable", "Screen capture could not start", null)
        }
        return true
    }

    private fun stop() {
        pending?.success(false)
        pending = null
        context.stopService(Intent(context, LiveScreenCaptureService::class.java))
    }

    override fun onListen(arguments: Any?, sink: EventChannel.EventSink) {
        LiveScreenCaptureService.listener = { event -> Handler(Looper.getMainLooper()).post { sink.success(event) } }
    }
    override fun onCancel(arguments: Any?) { stop(); LiveScreenCaptureService.listener = null }
    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        this.binding = binding
        binding.addActivityResultListener(this)
    }
    override fun onDetachedFromActivityForConfigChanges() {
        binding?.removeActivityResultListener(this); binding = null
    }
    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) = onAttachedToActivity(binding)
    override fun onDetachedFromActivity() { stop(); onDetachedFromActivityForConfigChanges() }
    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        stop(); LiveScreenCaptureService.listener = null
        methods.setMethodCallHandler(null); events.setStreamHandler(null)
    }
}
