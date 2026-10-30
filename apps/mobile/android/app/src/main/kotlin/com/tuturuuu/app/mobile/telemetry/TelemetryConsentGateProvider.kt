package com.tuturuuu.app.mobile.telemetry

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.util.Log

/**
 * Clears the Crashlytics collection override before Firebase starts.
 *
 * Builds before the telemetry consent setting called
 * setCrashlyticsCollectionEnabled(true), which the SDK persists and prefers
 * over the manifest default. FirebaseInitProvider starts Crashlytics, and its
 * unsent-report upload, before Dart can read the stored consent. Removing the
 * override lets the manifest `false` apply until Dart enables collection from
 * the stored choice; without consent Dart then deletes the held reports.
 *
 * The preference file and key mirror the SDK DataCollectionArbiter.
 */
class TelemetryConsentGateProvider : ContentProvider() {
    override fun onCreate(): Boolean {
        context?.let { clearPersistedCrashCollection(it) }
        return true
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = 0

    companion object {
        private const val CRASHLYTICS_PREFS = "com.google.firebase.crashlytics"
        private const val COLLECTION_KEY = "firebase_crashlytics_collection_enabled"

        fun clearPersistedCrashCollection(context: Context) {
            try {
                val prefs = context.getSharedPreferences(CRASHLYTICS_PREFS, Context.MODE_PRIVATE)
                if (prefs.contains(COLLECTION_KEY)) {
                    // Synchronous so the SDK cannot read the stale value first.
                    prefs.edit().remove(COLLECTION_KEY).commit()
                }
            } catch (error: RuntimeException) {
                Log.w("TelemetryConsentGate", "Override reset failed: ${error.javaClass.simpleName}")
            }
        }
    }
}
