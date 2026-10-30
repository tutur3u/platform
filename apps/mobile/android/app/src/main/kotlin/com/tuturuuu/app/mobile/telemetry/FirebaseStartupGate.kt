package com.tuturuuu.app.mobile.telemetry

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.messaging.FirebaseMessaging
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

/** The channel is called only after app authentication, or to revoke collection. */
object FirebaseStartupGate {
    private var signedIn = false
    private var analyticsStarted = false

    fun setMeasurementComponentsEnabled(context: Context, enabled: Boolean) {
        val state = if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        for (name in listOf("AppMeasurementReceiver", "AppMeasurementService", "AppMeasurementJobService")) {
            context.packageManager.setComponentEnabledSetting(
                ComponentName(context, "com.google.android.gms.measurement." + name),
                state, PackageManager.DONT_KILL_APP,
            )
        }
    }

    private fun setAnalyticsCollection(context: Context, requested: Boolean) {
        val enabled = PersistedAnalyticsGate.mayEnable(
            requested, signedIn, TelemetryConsentDecision.allowsCollection(context),
        )
        if (enabled) setMeasurementComponentsEnabled(context, true)
        if (enabled || analyticsStarted) {
            FirebaseAnalytics.getInstance(context).setAnalyticsCollectionEnabled(enabled)
            analyticsStarted = true
        }
        if (!enabled) {
            val editor = context.getSharedPreferences(
                PersistedAnalyticsGate.PREFERENCES, Context.MODE_PRIVATE,
            ).edit()
            PersistedAnalyticsGate.disable { key, value -> editor.putBoolean(key, value) }
            check(editor.commit()) { "Cannot persist Analytics disable" }
        }
        if (!enabled) setMeasurementComponentsEnabled(context, false)
    }

    fun install(context: Context, messenger: BinaryMessenger) {
        MethodChannel(messenger, "mobile/firebase_startup").setMethodCallHandler { call, result ->
            when (call.method) {
                "initialize" -> {
                    val app = FirebaseApp.initializeApp(context)
                    if (app == null) {
                        result.error("firebase_configuration", "Firebase configuration unavailable", null)
                        return@setMethodCallHandler
                    }
                    app.setDataCollectionDefaultEnabled(false)
                    FirebaseMessaging.getInstance().isAutoInitEnabled = false
                    FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(false)
                    signedIn = true
                }
                "setAnalyticsCollectionEnabled" -> setAnalyticsCollection(context, call.arguments == true)
                "endSession" -> {
                    signedIn = false
                    setAnalyticsCollection(context, false)
                }
                else -> { result.notImplemented(); return@setMethodCallHandler }
            }
            result.success(null)
        }
    }
}
