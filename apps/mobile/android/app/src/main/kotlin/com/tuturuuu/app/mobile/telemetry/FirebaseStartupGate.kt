package com.tuturuuu.app.mobile.telemetry

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.messaging.FirebaseMessaging
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

/** Invoked by Dart only after authentication; providers never start Firebase. */
object FirebaseStartupGate {
    fun install(context: Context, messenger: BinaryMessenger) {
        MethodChannel(messenger, "mobile/firebase_startup").setMethodCallHandler { call, result ->
            if (call.method != "initialize") {
                result.notImplemented()
                return@setMethodCallHandler
            }
            val allowed = TelemetryConsentDecision.allowsCollection(context)
            // Clear a stale Analytics enable before late Firebase startup.
            if (!allowed) {
                FirebaseAnalytics.getInstance(context).setAnalyticsCollectionEnabled(false)
            }
            val app = FirebaseApp.initializeApp(context)
            if (app == null) {
                result.error("firebase_configuration", "Firebase configuration unavailable", null)
                return@setMethodCallHandler
            }
            app.setDataCollectionDefaultEnabled(false)
            FirebaseMessaging.getInstance().isAutoInitEnabled = false
            if (!allowed) FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(false)
            result.success(null)
        }
    }
}
