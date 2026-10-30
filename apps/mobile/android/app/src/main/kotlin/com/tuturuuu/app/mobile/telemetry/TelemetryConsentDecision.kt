package com.tuturuuu.app.mobile.telemetry

import android.content.Context

/**
 * Native read of the consent the Dart gate stores with shared_preferences.
 *
 * Android keeps those values in FlutterSharedPreferences under a `flutter.`
 * prefix. Collection is allowed only for an explicit Allow given under the
 * current notice version, the same rule as TelemetryPreference in Dart; any
 * missing, stale or malformed value, or an unreadable store, means "not allowed".
 * Keep the constants in sync with telemetry_preference.dart.
 */
object TelemetryConsentDecision {
    const val PREFERENCES_FILE = "FlutterSharedPreferences"
    const val CHOICE_KEY = "flutter.telemetry-consent-choice"
    const val NOTICE_VERSION_KEY = "flutter.telemetry-consent-notice-version"
    const val CURRENT_NOTICE_VERSION = "telemetry-consent-v1"

    fun allowsCollection(stored: Map<String, *>): Boolean =
        stored[CHOICE_KEY] == true && stored[NOTICE_VERSION_KEY] == CURRENT_NOTICE_VERSION

    fun allowsCollection(context: Context): Boolean =
        try {
            allowsCollection(
                context.getSharedPreferences(PREFERENCES_FILE, Context.MODE_PRIVATE).all,
            )
        } catch (error: RuntimeException) {
            false
        }
}
