package dev.tuturuuu.fixture.sale_journal_fixture

import android.os.Process
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject
import java.io.File

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger, "fixture/sale_journal")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "phase" -> result.success(intent.getStringExtra("journal_phase"))
                    "report" -> {
                        try {
                            val report = JSONObject(call.arguments as String)
                            report.put("process_id", Process.myPid())
                            val temporary = File(filesDir, "journal-proof.tmp")
                            temporary.writeText(report.toString())
                            check(temporary.renameTo(File(filesDir, "journal-proof.json")))
                            result.success(null)
                        } catch (failure: Exception) {
                            result.error("report_failed", failure.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
