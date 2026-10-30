package com.tuturuuu.app.mobile.telemetry

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.FirebaseCrashlytics

/**
 * Turns collection off again right after Firebase starts, unless the user has
 * explicitly allowed it.
 *
 * Firebase persists the last setAnalyticsCollectionEnabled and
 * setCrashlyticsCollectionEnabled value and prefers it over the manifest
 * default, so a build from before the consent setting can leave "on" behind.
 * This runs after FirebaseInitProvider (initOrder 100) and before any Dart
 * (the Dart gate re-enables collection only after reading an explicit Allow).
 * Crashlytics' own override is also cleared earlier by
 * [TelemetryConsentGateProvider], so held reports never upload meanwhile.
 */
class TelemetryCollectionLockProvider : TelemetryGateProvider() {
    override fun runGate(context: Context) {
        if (TelemetryConsentDecision.allowsCollection(context)) return
        try {
            if (FirebaseApp.getApps(context).isEmpty()) return
            FirebaseAnalytics.getInstance(context).setAnalyticsCollectionEnabled(false)
            FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(false)
        } catch (error: RuntimeException) {
            Log.w("TelemetryCollectionLock", "Disable failed: ${error.javaClass.simpleName}")
        }
    }
}
