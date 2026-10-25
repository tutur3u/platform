package com.tuturuuu.app.mobile.assistant

import android.os.Handler
import android.os.Looper
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/** Bridges [AssistantShortcutInbox] to `mobile/assistant_shortcuts`. */
class AssistantShortcutsPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    private var channel: MethodChannel? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        val created = MethodChannel(binding.binaryMessenger, CHANNEL)
        created.setMethodCallHandler(this)
        channel = created
        // Payload-free signal; Dart always drains through `takePending`.
        AssistantShortcutInbox.setListener {
            mainHandler.post { channel?.invokeMethod("pendingAvailable", null) }
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        AssistantShortcutInbox.setListener(null)
        channel?.setMethodCallHandler(null)
        channel = null
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "takePending" -> result.success(AssistantShortcutInbox.drain().map { it.toPayload() })
            else -> result.notImplemented()
        }
    }

    companion object {
        const val CHANNEL = "mobile/assistant_shortcuts"
    }
}
