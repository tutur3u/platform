package com.tuturuuu.app.mobile.notifications

import android.app.NotificationManager
import android.content.Context
import android.service.notification.StatusBarNotification
import android.util.Base64
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import org.json.JSONArray
import java.util.UUID

/** Only app-owned delivered records; never interacts with pending alarms. */
class DeliveredInboxNotificationsPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    private lateinit var channel: MethodChannel
    private lateinit var context: Context
    private var actor: String? = null
    private var epoch = 0L
    private val snapshots = linkedMapOf<String, Snapshot>()
    private data class Record(val tag: String, val id: Int, val time: Long, val key: String)
    private data class Snapshot(val actor: String, val epoch: Long, val records: List<Record>)
    private data class Identity(val actor: String, val workspace: String?, val id: String)
    private val uuid = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    private val prefix = "tuturuuu:inbox:v1:"

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, "mobile/delivered_inbox_notifications")
        channel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        actor = null
        epoch++
        snapshots.clear()
        channel.setMethodCallHandler(null)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "bindSession" -> {
                    // Invalidate even a repeated actor binding: logout/relogin is not identity equality.
                    epoch++
                    snapshots.clear()
                    actor = null
                    val next = call.argument<String>("actor")
                    require(next == null || uuid.matches(next))
                    actor = next
                    result.success(true)
                }
                "snapshot" -> snapshot(call, result)
                "dismissSnapshot" -> dismiss(call, result)
                "discardSnapshot" -> {
                    val owner = requireActor(call)
                    val token = call.argument<String>("token") ?: throw IllegalArgumentException()
                    val snapshot = snapshots[token] ?: throw IllegalArgumentException()
                    require(snapshot.actor == owner && snapshot.epoch == epoch)
                    snapshots.remove(token)
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        } catch (_: Exception) {
            result.error("unavailable", "Delivered notification operation unavailable", null)
        }
    }

    private fun manager() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun delivered(): List<StatusBarNotification> {
        val all = manager().activeNotifications
        require(all.size <= 512)
        return all.filter { it.packageName == context.packageName }
    }

    private fun requireActor(call: MethodCall): String {
        val requested = call.argument<String>("actor")
        require(requested != null && actor == requested && uuid.matches(requested))
        return requested
    }

    private fun identity(tag: String?): Identity? {
        if (tag == null || tag.length > 256 || !tag.startsWith(prefix)) return null
        return try {
            val encoded = tag.removePrefix(prefix)
            val bytes = Base64.decode(encoded, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            if (Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) != encoded) return null
            val json = bytes.toString(Charsets.UTF_8)
            val values = JSONArray(json)
            if (values.length() != 3 || values.toString() != json) return null
            val owner = values.opt(0) as? String ?: return null
            val ws = if (values.isNull(1)) null else values.opt(1) as? String ?: return null
            val id = values.opt(2) as? String ?: return null
            if (!uuid.matches(owner) || !uuid.matches(id) || (ws != null && !uuid.matches(ws))) return null
            Identity(owner, ws, id)
        } catch (_: Exception) { null }
    }

    private fun snapshot(call: MethodCall, result: MethodChannel.Result) {
        val owner = requireActor(call)
        require(snapshots.size < 8)
        val scope = call.argument<String>("scope")
        val ws = call.argument<String>("workspaceId")
        require(scope == "allActor" || (scope == "exactWorkspace" && ws != null && uuid.matches(ws)))
        require(scope != "allActor" || ws == null)
        val id = call.argument<String>("notificationId")
        require(id == null || uuid.matches(id))
        val records = delivered().mapNotNull { item ->
            val tag = item.tag ?: return@mapNotNull null
            val owned = identity(tag) ?: return@mapNotNull null
            if (owned.actor != owner || (scope == "exactWorkspace" && owned.workspace != ws) || (id != null && owned.id != id)) return@mapNotNull null
            Record(tag, item.id, item.postTime, item.key)
        }
        val token = UUID.randomUUID().toString()
        snapshots[token] = Snapshot(owner, epoch, records)
        result.success(mapOf("token" to token, "count" to records.size))
    }

    private fun dismiss(call: MethodCall, result: MethodChannel.Result) {
        val owner = requireActor(call)
        val token = call.argument<String>("token") ?: throw IllegalArgumentException()
        val snapshot = snapshots.remove(token) ?: throw IllegalArgumentException()
        require(snapshot.actor == owner && snapshot.epoch == epoch)
        val current = delivered().associateBy { it.key }
        var count = 0
        for (item in snapshot.records) {
            val visible = current[item.key] ?: continue
            if (visible.id == item.id && visible.tag == item.tag && visible.postTime == item.time) {
                // Platform lacks atomic compare-time-and-cancel; this is a bounded recheck.
                manager().cancel(item.tag, item.id)
                count++
            }
        }
        result.success(count)
    }
}
