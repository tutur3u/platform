package com.tuturuuu.app.mobile.telemetry

import android.content.ComponentName
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.installations.FirebaseInstallations
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

/** The channel is called only after app authentication, or to revoke collection. */
object FirebaseStartupGate {
    private var signedIn = false
    private var analyticsAdmitted = false

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

    private fun prepareAnalyticsCollection(context: Context, requested: Boolean): Boolean {
        val enabled = PersistedAnalyticsGate.mayEnable(
            requested, signedIn, TelemetryConsentDecision.allowsCollection(context),
        )
        if (enabled) setMeasurementComponentsEnabled(context, true)
        // Enable runs through the lazy FlutterFire plugin after this admission.
        // Native revocation also covers sign-out and a failed plugin start.
        if (!enabled && analyticsAdmitted) {
            FirebaseAnalytics.getInstance(context).setAnalyticsCollectionEnabled(false)
        }
        analyticsAdmitted = enabled
        if (!enabled) {
            val editor = context.getSharedPreferences(
                PersistedAnalyticsGate.PREFERENCES, Context.MODE_PRIVATE,
            ).edit()
            PersistedAnalyticsGate.disable { key, value -> editor.putBoolean(key, value) }
            check(editor.commit()) { "Cannot persist Analytics disable" }
        }
        if (!enabled) setMeasurementComponentsEnabled(context, false)
        return enabled
    }

    private fun pushPermission(context: Context): Boolean =
        context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() == true

    fun install(context: Context, messenger: BinaryMessenger) {
        MethodChannel(messenger, "mobile/firebase_startup").setMethodCallHandler { call, result ->
            when (call.method) {
                "initialize" -> {
                    val arguments = call.arguments as? Map<*, *> ?: emptyMap<Any, Any>()
                    signedIn = arguments["signedIn"] == true
                    val push = arguments["pushAllowed"] == true && pushPermission(context) &&
                        context.getSharedPreferences(TelemetryConsentDecision.PREFERENCES_FILE,
                            Context.MODE_PRIVATE).getBoolean("flutter.push-enabled", true)
                    val telemetry = arguments["telemetryAllowed"] == true &&
                        TelemetryConsentDecision.allowsCollection(context)
                    if (!PersistedAnalyticsGate.mayInitialize(signedIn, push, telemetry)) {
                        result.success(false)
                        return@setMethodCallHandler
                    }
                    val app = FirebaseApp.initializeApp(context)
                    if (app == null) {
                        result.error("firebase_configuration", "Firebase configuration unavailable", null)
                        return@setMethodCallHandler
                    }
                    app.setDataCollectionDefaultEnabled(false)
                    result.success(true)
                    return@setMethodCallHandler
                }
                "pushPermission" -> {
                    result.success(pushPermission(context))
                    return@setMethodCallHandler
                }
                "deleteInstallation" -> {
                    if (FirebaseApp.getApps(context).isEmpty()) {
                        result.success(null)
                        return@setMethodCallHandler
                    }
                    FirebaseInstallations.getInstance().delete().addOnCompleteListener { task ->
                        if (task.isSuccessful) {
                            Log.i("FirebaseConsent", "Firebase Installation deletion completed")
                            result.success(null)
                        } else {
                            Log.w("FirebaseConsent", "Firebase Installation deletion failed")
                            result.error("installation_delete", "Installation deletion failed", null)
                        }
                    }
                    return@setMethodCallHandler
                }
                "prepareAnalyticsCollection" -> {
                    result.success(prepareAnalyticsCollection(context, call.arguments == true))
                    return@setMethodCallHandler
                }
                "endSession" -> {
                    signedIn = false
                    prepareAnalyticsCollection(context, false)
                }
                else -> { result.notImplemented(); return@setMethodCallHandler }
            }
            result.success(null)
        }
    }
}
