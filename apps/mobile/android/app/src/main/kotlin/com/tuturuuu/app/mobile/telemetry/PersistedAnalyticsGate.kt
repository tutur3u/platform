package com.tuturuuu.app.mobile.telemetry

/** Mirrors Measurement's persisted API override without constructing an SDK instance. */
object PersistedAnalyticsGate {
    const val PREFERENCES = "com.google.android.gms.measurement.prefs"

    fun mayEnable(requested: Boolean, signedIn: Boolean, consent: Boolean): Boolean =
        requested && signedIn && consent

    fun disable(write: (String, Boolean) -> Unit) {
        write("measurement_enabled", false)
        write("measurement_enabled_from_api", false)
    }
}
