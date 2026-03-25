package com.tuturuuu.app.mobile

import android.os.Build
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var currentRoute: String? = null
    private var exitMessage: String = "Press back again to exit"
    private var lastExitAttemptAt: Long = 0L
    private var onBackInvokedCallback: OnBackInvokedCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val callback = OnBackInvokedCallback {
                Log.d("MainActivity", "OnBackInvokedCallback.handleBack")
                handleBackPress()
            }
            onBackInvokedCallback = callback
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                callback,
            )
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "mobile/shell_back",
        ).setMethodCallHandler { call, result ->
            if (call.method == "updateState") {
                currentRoute = call.argument<String>("route")
                exitMessage = call.argument<String>("exitMessage") ?: exitMessage
                Log.d(
                    "MainActivity",
                    "updateState route=$currentRoute exitMessage=$exitMessage",
                )
                result.success(null)
            } else {
                result.notImplemented()
            }
        }
    }

    override fun onBackPressed() {
        Log.d("MainActivity", "onBackPressed")
        handleBackPress()
    }

    private fun handleBackPress() {
        val route = currentRoute
        Log.d("MainActivity", "handleBackPress route=$route")
        if (route == "/" || route == "/apps") {
            val now = System.currentTimeMillis()
            if (now - lastExitAttemptAt <= 2000L) {
                Log.d("MainActivity", "handleBackPress exitConfirmed")
                finishAffinity()
                return
            }

            lastExitAttemptAt = now
            Log.d("MainActivity", "handleBackPress showExitToast")
            Toast.makeText(this, exitMessage, Toast.LENGTH_LONG).show()
            return
        }

        val engine = flutterEngine
        if (engine != null) {
            engine.navigationChannel.popRoute()
            return
        }

        super.onBackPressed()
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedCallback?.let { callback ->
                onBackInvokedDispatcher.unregisterOnBackInvokedCallback(callback)
            }
            onBackInvokedCallback = null
        }
        super.onDestroy()
    }
}
