package com.tuturuuu.app.mobile

import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Choreographer
import android.view.WindowManager
import android.widget.Toast
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.lifecycle.Lifecycle
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugins.videoplayer.VideoPlayerPlugin
import java.util.UUID

class MainActivity : FlutterFragmentActivity(), ShellBackHost {
    private var exitMessage: String = "Press back again to exit"
    private var exitHintMessage: String = "Tap back once more to close the app"
    private var onBackInvokedCallback: OnBackInvokedCallback? = null
    private var shellBackChannel: MethodChannel? = null
    private var snapshotFlagOwned = false
    private data class PrivacyFrame(val token: String, val required: Boolean)
    private var pendingPrivacyFrame: PrivacyFrame? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val shellBack = ShellBackCoordinator(this)

    override fun onCreate(savedInstanceState: Bundle?) {
        protectLegacySnapshot()
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setRecentsScreenshotEnabled(false)
            val callback = OnBackInvokedCallback {
                Log.d("MainActivity", "OnBackInvokedCallback.handleBack")
                shellBack.onBack()
            }
            onBackInvokedCallback = callback
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                callback,
            )
        }
    }

    private fun protectLegacySnapshot() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
        val secureFlag = WindowManager.LayoutParams.FLAG_SECURE
        if (window.attributes.flags and secureFlag == 0) {
            window.addFlags(secureFlag)
            snapshotFlagOwned = true
        }
    }

    private fun preparePrivacyFrame(required: Boolean): String {
        protectLegacySnapshot()
        val frame = PrivacyFrame(UUID.randomUUID().toString(), required)
        pendingPrivacyFrame = frame
        return frame.token
    }

    private fun acknowledgePrivacyFrame(token: Any?): Boolean {
        val frame = pendingPrivacyFrame ?: return false
        if (frame.token != token || !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            return false
        }
        if (frame.required || Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pendingPrivacyFrame = null
            return true
        }

        // Keep the secure flag through the next display interval. A new policy
        // or pause replaces the entitlement even after an acknowledgment arrives.
        val choreographer = Choreographer.getInstance()
        choreographer.postFrameCallback {
            choreographer.postFrameCallback {
                if (pendingPrivacyFrame === frame &&
                    lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
                ) {
                    pendingPrivacyFrame = null
                    if (snapshotFlagOwned) {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        snapshotFlagOwned = false
                    }
                }
            }
        }
        return true
    }

    override fun onPause() {
        pendingPrivacyFrame = null
        protectLegacySnapshot()
        super.onPause()
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        com.tuturuuu.app.mobile.telemetry.FirebaseStartupGate.install(
            this, flutterEngine.dartExecutor.binaryMessenger,
        )
        flutterEngine.plugins.add(com.tuturuuu.app.mobile.notifications.DeliveredInboxNotificationsPlugin())
        flutterEngine.plugins.add(com.tuturuuu.app.mobile.live.LiveScreenCapturePlugin())
        flutterEngine.plugins.add(com.tuturuuu.app.mobile.meet.MeetScreenSharePlugin())
        flutterEngine.plugins.add(com.tuturuuu.app.mobile.iris.IrisDeviceKeyPlugin())

        // Safety-net registration for video_player. Auto-registration should
        // already handle this, but explicit registration avoids runtime
        // platform-interface fallback (UnimplementedError init()) when plugin
        // registration is skipped in certain engine boot paths.
        runCatching {
            flutterEngine.plugins.add(VideoPlayerPlugin())
        }.onFailure { error ->
            Log.w("MainActivity", "video_player explicit registration skipped: $error")
        }

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "mobile/app_snapshot_privacy",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "preparePrivacyFrame" -> {
                    val required = call.arguments as? Boolean
                    if (required == null) {
                        result.error("bad_arguments", "Expected a privacy policy", null)
                    } else {
                        result.success(preparePrivacyFrame(required))
                    }
                }
                "foregroundFrameReady" -> result.success(acknowledgePrivacyFrame(call.arguments))
                else -> result.notImplemented()
            }
        }

        val channel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "mobile/shell_back",
        )
        shellBackChannel = channel
        channel.setMethodCallHandler { call, result ->
            if (call.method == "updateState") {
                shellBack.updateRoute(call.argument<String>("route"))
                exitMessage = call.argument<String>("exitMessage") ?: exitMessage
                exitHintMessage =
                    call.argument<String>("exitHintMessage") ?: exitHintMessage
                Log.d(
                    "MainActivity",
                    "updateState route=${shellBack.route} exitMessage=$exitMessage",
                )
                result.success(null)
            } else {
                result.notImplemented()
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        Log.d("MainActivity", "onBackPressed")
        shellBack.onBack()
    }

    override fun queryHasModal(onReply: (ModalReply) -> Unit): Boolean {
        val channel = shellBackChannel ?: return false
        if (flutterEngine == null) return false
        channel.invokeMethod(
            "hasModal",
            null,
            object : MethodChannel.Result {
                override fun success(result: Any?) {
                    onReply(
                        when (result) {
                            true -> ModalReply.OPEN
                            false -> ModalReply.NONE
                            else -> ModalReply.UNAVAILABLE
                        },
                    )
                }

                override fun error(code: String, message: String?, details: Any?) {
                    onReply(ModalReply.UNAVAILABLE)
                }

                override fun notImplemented() {
                    onReply(ModalReply.UNAVAILABLE)
                }
            },
        )
        return true
    }

    override fun popFlutterRoute() {
        val engine = flutterEngine
        if (engine != null) {
            engine.navigationChannel.popRoute()
            return
        }

        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    override fun showExitHint() {
        Log.d("MainActivity", "handleBackPress showExitToast")
        Toast.makeText(this, "$exitMessage\n$exitHintMessage", Toast.LENGTH_SHORT).show()
    }

    override fun exitApp() {
        Log.d("MainActivity", "handleBackPress exitConfirmed")
        finishAffinity()
    }

    override fun schedule(delayMs: Long, action: () -> Unit): () -> Unit {
        val runnable = Runnable { action() }
        mainHandler.postDelayed(runnable, delayMs)
        return { mainHandler.removeCallbacks(runnable) }
    }

    override fun nowMs(): Long = SystemClock.elapsedRealtime()

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        shellBackChannel?.setMethodCallHandler(null)
        shellBackChannel = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedCallback?.let { callback ->
                onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback)
            }
            onBackInvokedCallback = null
        }
        super.onDestroy()
    }
}
