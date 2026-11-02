package com.tuturuuu.app.mobile.telemetry

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri

/**
 * Runs a gate during provider installation, which precedes
 * Application.onCreate, any Activity and the Flutter engine. Providers are
 * created from the highest initOrder down; FirebaseInitProvider uses 100.
 */
abstract class TelemetryGateProvider : ContentProvider() {
    protected abstract fun runGate(context: Context)

    override fun onCreate(): Boolean {
        context?.let { runGate(it) }
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
}
