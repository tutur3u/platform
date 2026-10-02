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
                    "phase" -> {
                        val phase = intent.getStringExtra("journal_phase")
                        if (phase == null) result.error("missing_phase", null, null)
                        else result.success(phase)
                    }
                    "report" -> {
                        try {
                            val report = JSONObject(call.arguments as String)
                            report.put("process_id", Process.myPid())
                            val temporary = File(filesDir, "journal-proof.tmp")
                            temporary.writeText(report.toString())
                            check(temporary.renameTo(File(filesDir, "journal-proof.json")))
                            result.success(null)
                        } catch (failure: Exception) {
                            runCatching {
                                val run = intent.getStringExtra("journal_run") ?: ""
                                val sha = intent.getStringExtra("journal_source_sha") ?: ""
                                val digest = intent.getStringExtra("journal_sha256") ?: ""
                                val phase = intent.getStringExtra("journal_phase")
                                check(run.matches(Regex("[0-9]+-[0-9]+-android")))
                                check(sha.matches(Regex("[0-9a-f]{40}")))
                                check(digest.matches(Regex("[0-9a-f]{64}")))
                                check(phase in listOf("write", "read", "cleanup", "verify-clean"))
                                val marker = JSONObject()
                                    .put("phase", phase).put("run_id", run)
                                    .put("source_sha", sha).put("journal_sha256", digest)
                                    .put("process_id", Process.myPid())
                                    .put("passed", false).put("error", "report_failed")
                                File(filesDir, "journal-proof.json").writeText(marker.toString())
                            }
                            result.error("report_failed", "Fixture report failed", null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
