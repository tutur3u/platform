//! migration helpers extracted from `lib.rs` (pure movement).

use crate::*;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackendRuntime {
    pub(crate) deployment_target: String,
    pub(crate) runtime: &'static str,
    pub(crate) service: String,
    pub(crate) toolchain: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationStatus {
    pub(crate) backend: BackendRuntime,
    pub(crate) contact_data: contact::ContactDataLayerStatus,
    pub(crate) environment: String,
    pub(crate) frontend_targets: [&'static str; 2],
    pub(crate) ok: bool,
    pub(crate) route_ownership: RouteOwnership,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RouteOwnership {
    pub(crate) legacy_allowed: bool,
    pub(crate) manifest: &'static str,
    pub(crate) status: &'static str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RouteManifest {
    pub(crate) generated_by: String,
    pub(crate) routes: Vec<RouteManifestRoute>,
    pub(crate) summary: RouteManifestSummary,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RouteManifestSummary {
    pub(crate) api_routes: usize,
    pub(crate) cron_routes: usize,
    pub(crate) layouts: usize,
    pub(crate) method_counts: BTreeMap<String, usize>,
    pub(crate) pages: usize,
    pub(crate) route_handlers: usize,
    pub(crate) total: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RouteManifestRoute {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) method: Option<String>,
    pub(crate) methods: Vec<String>,
    pub(crate) parent_id: Option<String>,
    pub(crate) route_path: String,
    pub(crate) source_file: String,
    pub(crate) status: String,
    pub(crate) target_owner: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationProgress {
    pub(crate) generated_by: String,
    pub(crate) manifest: &'static str,
    pub(crate) ok: bool,
    pub(crate) progress: RouteManifestProgress,
    pub(crate) summary: RouteManifestSummary,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RouteManifestProgress {
    pub(crate) by_kind: Vec<RouteManifestProgressBucket>,
    pub(crate) by_owner: Vec<RouteManifestProgressBucket>,
    pub(crate) top_legacy_routes: Vec<RouteManifestProgressRoute>,
    pub(crate) totals: RouteManifestProgressBucket,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RouteManifestProgressBucket {
    pub(crate) accepted_removal: usize,
    pub(crate) key: String,
    pub(crate) label: String,
    pub(crate) legacy_next: usize,
    pub(crate) migrated: usize,
    pub(crate) percent_complete: f64,
    pub(crate) remaining: usize,
    pub(crate) terminal: usize,
    pub(crate) total: usize,
    pub(crate) unknown_status: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RouteManifestProgressRoute {
    pub(crate) id: Option<String>,
    pub(crate) kind: String,
    pub(crate) method: Option<String>,
    pub(crate) methods: Vec<String>,
    pub(crate) parent_id: Option<String>,
    pub(crate) route_path: String,
    pub(crate) source_file: String,
    pub(crate) status: String,
    pub(crate) target_owner: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationCutoverGates {
    pub(crate) counts: MigrationRouteCounts,
    pub(crate) gates: Vec<MigrationGate>,
    pub(crate) generated_by: String,
    pub(crate) manifest: &'static str,
    pub(crate) ok: bool,
    pub(crate) summary: RouteManifestSummary,
}

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationRouteCounts {
    pub(crate) accepted_removal: usize,
    pub(crate) backend_owned: usize,
    pub(crate) backend_route_artifacts: usize,
    pub(crate) frontend_owned: usize,
    pub(crate) legacy_next: usize,
    pub(crate) migrated: usize,
    pub(crate) total: usize,
    pub(crate) unknown_status: usize,
    pub(crate) unmapped: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationGate {
    pub(crate) detail: String,
    pub(crate) id: &'static str,
    pub(crate) label: &'static str,
    pub(crate) ok: bool,
    pub(crate) status: &'static str,
}

pub(crate) fn migration_status_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    if let Some(response) = require_internal_authorization(config, request.authorization) {
        return response;
    }

    json_response(
        200,
        MigrationStatus {
            backend: BackendRuntime {
                deployment_target: config.deployment_target.clone(),
                runtime: "rust",
                service: config.service_name.clone(),
                toolchain: config.toolchain(),
            },
            contact_data: config.contact_data.status(),
            environment: config.environment.clone(),
            frontend_targets: ["next", "tanstack-start"],
            ok: true,
            route_ownership: RouteOwnership {
                legacy_allowed: true,
                manifest: MIGRATION_MANIFEST_PATH,
                status: "migration-foundation",
            },
        },
    )
}

pub(crate) fn migration_manifest_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    if let Some(response) = require_internal_authorization(config, request.authorization) {
        return response;
    }

    match serde_json::from_str::<Value>(MIGRATION_MANIFEST_JSON) {
        Ok(manifest) => json_response(200, manifest),
        Err(error) => json_response(
            500,
            json!({
                "error": "route manifest parse failed",
                "message": error.to_string(),
            }),
        ),
    }
}

pub(crate) fn migration_cutover_gates_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    if let Some(response) = require_internal_authorization(config, request.authorization) {
        return response;
    }

    match parse_route_manifest() {
        Ok(manifest) => json_response(200, migration_cutover_gates(manifest)),
        Err(error) => json_response(
            500,
            json!({
                "error": "route manifest parse failed",
                "message": error.to_string(),
            }),
        ),
    }
}

pub(crate) fn migration_progress_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    if let Some(response) = require_internal_authorization(config, request.authorization) {
        return response;
    }

    match parse_route_manifest() {
        Ok(manifest) => {
            let progress = route_manifest_progress(&manifest.routes);

            json_response(
                200,
                MigrationProgress {
                    generated_by: manifest.generated_by,
                    manifest: MIGRATION_MANIFEST_PATH,
                    ok: progress.totals.remaining == 0,
                    progress,
                    summary: manifest.summary,
                },
            )
        }
        Err(error) => json_response(
            500,
            json!({
                "error": "route manifest parse failed",
                "message": error.to_string(),
            }),
        ),
    }
}

pub(crate) fn parse_route_manifest() -> Result<RouteManifest, serde_json::Error> {
    serde_json::from_str(MIGRATION_MANIFEST_JSON)
}

pub(crate) fn migration_cutover_gates(manifest: RouteManifest) -> MigrationCutoverGates {
    let counts = migration_route_counts(&manifest.routes);
    let manifest_current = counts.total == manifest.summary.total;
    let no_legacy_routes = counts.legacy_next == 0;
    let no_unmapped_routes = counts.unmapped == 0;
    let no_unknown_status = counts.unknown_status == 0;
    let backend_routes_mapped = counts.backend_route_artifacts == counts.backend_owned;
    let terminal_statuses = counts.total == counts.migrated + counts.accepted_removal;
    let external_e2e_evidence = false;
    let external_benchmark_evidence = false;
    let ok = manifest_current
        && no_legacy_routes
        && no_unmapped_routes
        && no_unknown_status
        && backend_routes_mapped
        && terminal_statuses
        && external_e2e_evidence
        && external_benchmark_evidence;

    MigrationCutoverGates {
        counts,
        gates: vec![
            gate(
                "route-manifest-current",
                "Route manifest parity",
                manifest_current,
                format!(
                    "Manifest summary tracks {} route artifacts.",
                    manifest.summary.total
                ),
            ),
            gate(
                "no-legacy-routes",
                "No legacy route ownership",
                no_legacy_routes,
                format!(
                    "{} route artifacts still have legacy-next status.",
                    counts.legacy_next
                ),
            ),
            gate(
                "no-unmapped-routes",
                "No unmapped route artifacts",
                no_unmapped_routes && no_unknown_status,
                format!(
                    "{} routes are unmapped and {} routes have unknown status.",
                    counts.unmapped, counts.unknown_status
                ),
            ),
            gate(
                "backend-owned-routes-mapped",
                "Backend-owned handlers mapped",
                backend_routes_mapped,
                format!(
                    "{} of {} backend route artifacts target the Rust backend.",
                    counts.backend_owned, counts.backend_route_artifacts
                ),
            ),
            gate(
                "terminal-migration-statuses",
                "Terminal migration statuses",
                terminal_statuses,
                format!(
                    "{} migrated and {} accepted-removal artifacts recorded.",
                    counts.migrated, counts.accepted_removal
                ),
            ),
            gate(
                "docker-e2e-compare",
                "Docker E2E compare",
                external_e2e_evidence,
                "Compare-mode Docker E2E evidence is not attached to this gate.".to_owned(),
            ),
            gate(
                "benchmark-compare",
                "Benchmark compare",
                external_benchmark_evidence,
                "Full compare benchmark evidence is not attached to this gate.".to_owned(),
            ),
        ],
        generated_by: manifest.generated_by,
        manifest: MIGRATION_MANIFEST_PATH,
        ok,
        summary: manifest.summary,
    }
}

pub(crate) fn migration_route_counts(routes: &[RouteManifestRoute]) -> MigrationRouteCounts {
    let mut counts = MigrationRouteCounts {
        total: routes.len(),
        ..MigrationRouteCounts::default()
    };

    for route in routes {
        match route.status.as_str() {
            "accepted-removal" => counts.accepted_removal += 1,
            "legacy-next" => counts.legacy_next += 1,
            "migrated" => counts.migrated += 1,
            _ => counts.unknown_status += 1,
        }

        match route.target_owner.as_str() {
            "rust-backend" => counts.backend_owned += 1,
            "tanstack-start" => counts.frontend_owned += 1,
            _ => counts.unmapped += 1,
        }

        if is_backend_route_kind(&route.kind) {
            counts.backend_route_artifacts += 1;
        }
    }

    counts
}

pub(crate) fn is_backend_route_kind(kind: &str) -> bool {
    matches!(kind, "api" | "cron" | "route-handler" | "trpc")
}

pub(crate) fn route_manifest_progress(routes: &[RouteManifestRoute]) -> RouteManifestProgress {
    let mut totals = progress_bucket("total", "All route artifacts");
    let mut by_owner = BTreeMap::new();
    let mut by_kind = BTreeMap::new();
    let mut top_legacy_routes = Vec::new();

    for route in routes {
        update_progress_bucket(&mut totals, route);
        update_progress_bucket(
            by_owner
                .entry(route.target_owner.clone())
                .or_insert_with(|| {
                    progress_bucket(&route.target_owner, owner_label(&route.target_owner))
                }),
            route,
        );
        update_progress_bucket(
            by_kind
                .entry(route.kind.clone())
                .or_insert_with(|| progress_bucket(&route.kind, &route.kind)),
            route,
        );

        if !is_terminal_migration_status(&route.status)
            && top_legacy_routes.len() < TOP_LEGACY_ROUTE_LIMIT
        {
            top_legacy_routes.push(RouteManifestProgressRoute {
                id: Some(route.id.clone()),
                kind: route.kind.clone(),
                method: route.method.clone(),
                methods: route.methods.clone(),
                parent_id: route.parent_id.clone(),
                route_path: route.route_path.clone(),
                source_file: route.source_file.clone(),
                status: route.status.clone(),
                target_owner: route.target_owner.clone(),
            });
        }
    }

    RouteManifestProgress {
        by_kind: finalize_progress_buckets(by_kind.into_values().collect()),
        by_owner: finalize_progress_buckets(by_owner.into_values().collect()),
        top_legacy_routes,
        totals: finalize_progress_bucket(totals),
    }
}

pub(crate) fn progress_bucket(key: &str, label: &str) -> RouteManifestProgressBucket {
    RouteManifestProgressBucket {
        key: key.to_owned(),
        label: label.to_owned(),
        ..RouteManifestProgressBucket::default()
    }
}

pub(crate) fn update_progress_bucket(
    bucket: &mut RouteManifestProgressBucket,
    route: &RouteManifestRoute,
) {
    bucket.total += 1;

    match route.status.as_str() {
        "accepted-removal" => bucket.accepted_removal += 1,
        "legacy-next" => bucket.legacy_next += 1,
        "migrated" => bucket.migrated += 1,
        _ => bucket.unknown_status += 1,
    }
}

pub(crate) fn finalize_progress_buckets(
    buckets: Vec<RouteManifestProgressBucket>,
) -> Vec<RouteManifestProgressBucket> {
    let mut buckets: Vec<_> = buckets.into_iter().map(finalize_progress_bucket).collect();
    buckets.sort_by(|left, right| {
        right
            .remaining
            .cmp(&left.remaining)
            .then_with(|| right.total.cmp(&left.total))
            .then_with(|| left.key.cmp(&right.key))
    });
    buckets
}

pub(crate) fn finalize_progress_bucket(
    mut bucket: RouteManifestProgressBucket,
) -> RouteManifestProgressBucket {
    bucket.terminal = bucket.accepted_removal + bucket.migrated;
    bucket.remaining = bucket.legacy_next + bucket.unknown_status;
    bucket.percent_complete = if bucket.total == 0 {
        100.0
    } else {
        ((bucket.terminal as f64 / bucket.total as f64) * 10_000.0).round() / 100.0
    };
    bucket
}

pub(crate) fn owner_label(owner: &str) -> &str {
    match owner {
        "rust-backend" => "Rust backend",
        "tanstack-start" => "TanStack Start",
        _ => owner,
    }
}

pub(crate) fn is_terminal_migration_status(status: &str) -> bool {
    matches!(status, "accepted-removal" | "migrated")
}

pub(crate) fn gate(
    id: &'static str,
    label: &'static str,
    ok: bool,
    detail: String,
) -> MigrationGate {
    MigrationGate {
        detail,
        id,
        label,
        ok,
        status: if ok { "pass" } else { "blocked" },
    }
}
