#[path = "cron_monitoring.rs"]
mod cron_monitoring;

#[cfg(feature = "native")]
mod native_tests {
    use super::cron_monitoring::{
        CronMonitoringPaths, parse_optional_positive_int, read_cron_execution_archive,
        read_cron_monitoring_snapshot,
    };
    use serde_json::{Value, json};
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is available")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "tuturuuu-cron-monitoring-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("temp dir can be created");
        dir
    }

    fn write_json(path: &Path, value: Value) {
        fs::create_dir_all(path.parent().expect("path has a parent")).expect("parent dir exists");
        fs::write(
            path,
            serde_json::to_string(&value).expect("json serializes"),
        )
        .expect("write json");
    }

    fn paths(root: &Path) -> CronMonitoringPaths {
        CronMonitoringPaths::new(
            root.join("cron.config.json"),
            root.join("runtime"),
            root.join("control"),
        )
    }

    #[test]
    fn native_snapshot_returns_legacy_empty_shape_for_missing_files() {
        let root = temp_dir("empty");
        let paths = paths(&root);
        let snapshot = read_cron_monitoring_snapshot(&paths, 10_000);

        assert_eq!(snapshot["enabled"], true);
        assert_eq!(snapshot["jobs"], json!([]));
        assert_eq!(snapshot["runs"], json!([]));
        assert_eq!(snapshot["status"], "missing");
        assert_eq!(snapshot["source"]["configAvailable"], false);

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn native_snapshot_merges_config_status_control_and_run_requests() {
        let root = temp_dir("merge");
        let paths = paths(&root);
        write_json(
            &paths.config_file,
            json!({"jobs":[{"id":"sync","path":"/api/cron/sync","schedule":"*/15 * * * *","description":"Sync","enabled":true}]}),
        );
        write_json(
            &paths.status_file,
            json!({"updatedAt":1000,"jobs":[{"id":"sync","failureStreak":2,"nextRunAt":4000}],"runs":[{"id":"run-1","jobId":"sync","requestedAt":10,"updatedAt":10,"status":"processing"}]}),
        );
        write_json(
            &paths.control_file,
            json!({"enabled":true,"jobs":{"sync":{"enabled":false,"updatedAt":1100,"updatedBy":null,"updatedByEmail":null}}}),
        );
        write_json(
            &paths.run_requests_dir.join("request.json"),
            json!({"id":"run-2","jobId":"sync","requestedAt":2000,"requestedBy":"ops","requestedByEmail":"ops@tuturuuu.com"}),
        );

        let snapshot = read_cron_monitoring_snapshot(&paths, 1100);

        assert_eq!(snapshot["status"], "live");
        assert_eq!(snapshot["jobs"][0]["enabled"], false);
        assert_eq!(snapshot["jobs"][0]["configuredEnabled"], true);
        assert_eq!(snapshot["jobs"][0]["controlEnabled"], false);
        assert_eq!(snapshot["overview"]["failedJobs"], 1);
        assert_eq!(snapshot["overview"]["processingRuns"], 1);
        assert_eq!(snapshot["overview"]["queuedRuns"], 1);
        assert_eq!(snapshot["runs"][0]["id"], "run-2");

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn native_snapshot_classifies_stale_and_reads_execution_window() {
        let root = temp_dir("executions");
        let paths = paths(&root);
        write_json(&paths.config_file, json!({"jobs":[]}));
        write_json(&paths.status_file, json!({"updatedAt":1000}));
        fs::create_dir_all(&paths.execution_dir).expect("execution dir exists");
        fs::write(
            paths.execution_dir.join("archive.jsonl"),
            r#"{"id":"old","jobId":"a","startedAt":1500,"status":"success"}"#.to_owned()
                + "\nnot-json\n"
                + r#"{"id":"new","jobId":"b","startedAt":3000,"status":"failed"}"#,
        )
        .expect("write jsonl");

        let snapshot = read_cron_monitoring_snapshot(&paths, 130_001);
        let archive = read_cron_execution_archive(&paths, Some("b"), Some(1), Some(10));

        assert_eq!(snapshot["status"], "stale");
        assert_eq!(snapshot["lastExecution"]["id"], "new");
        assert_eq!(snapshot["overview"]["failedExecutions"], 1);
        assert_eq!(archive["total"], 1);
        assert_eq!(archive["window"]["newestAt"], 3000);

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn native_archive_uses_positive_int_fallbacks_and_caps_page_size() {
        let root = temp_dir("archive");
        let paths = paths(&root);
        fs::create_dir_all(&paths.execution_dir).expect("execution dir exists");
        fs::write(
            paths.execution_dir.join("archive.jsonl"),
            (0..3)
                .map(|index| {
                    format!(
                        r#"{{"id":"e{index}","jobId":"sync","startedAt":{}}}"#,
                        100 - index
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"),
        )
        .expect("write jsonl");

        let archive = read_cron_execution_archive(&paths, None, Some(0), Some(500));

        assert_eq!(archive["page"], 1);
        assert_eq!(archive["limit"], 100);
        assert_eq!(parse_optional_positive_int(Some("12abc"), 25), 12);
        assert_eq!(parse_optional_positive_int(Some("-1"), 25), 25);

        fs::remove_dir_all(root).ok();
    }
}
