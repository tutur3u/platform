use serde_json::{Number, Value, json};
use std::cmp::Ordering;
use std::collections::BTreeMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_paginated_list::parse_js_parse_int_prefix,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

pub(crate) const ABUSE_INTELLIGENCE_PATH: &str = "/api/v1/infrastructure/abuse-intelligence";

const ABUSE_ACTIVITY_SIGNALS_TABLE: &str = "abuse_activity_signals";
const ABUSE_REPUTATION_SUBJECTS_TABLE: &str = "abuse_reputation_subjects";
const ABUSE_STEP_UP_CHALLENGES_TABLE: &str = "abuse_step_up_challenges";
const ABUSE_TRUST_OVERRIDES_TABLE: &str = "abuse_trust_overrides";
const ERROR_MESSAGE: &str = "Failed to load abuse intelligence snapshot";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AbuseIntelligenceAuthError {
    Forbidden,
    Internal,
    Unauthorized,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RestAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

pub(crate) async fn handle_abuse_intelligence_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ABUSE_INTELLIGENCE_PATH || request.method != "GET" {
        return None;
    }

    Some(abuse_intelligence_response(config, request, outbound).await)
}

async fn abuse_intelligence_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access_token = match authorize_abuse_intelligence(config, request, outbound).await {
        Ok(access_token) => access_token,
        Err(AbuseIntelligenceAuthError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(AbuseIntelligenceAuthError::Forbidden) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
        Err(AbuseIntelligenceAuthError::Internal) => return abuse_intelligence_error_response(),
    };
    let query = abuse_intelligence_query_from_url(request.url);
    let subjects = match fetch_table_rows(
        &config.contact_data,
        outbound,
        ABUSE_REPUTATION_SUBJECTS_TABLE,
        "last_seen_at.desc",
        query.limit,
        &[],
        RestAuth::AccessToken(&access_token),
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return abuse_intelligence_error_response(),
    };
    let signals = match fetch_table_rows(
        &config.contact_data,
        outbound,
        ABUSE_ACTIVITY_SIGNALS_TABLE,
        "created_at.desc",
        query.signal_limit,
        &[],
        RestAuth::AccessToken(&access_token),
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return abuse_intelligence_error_response(),
    };
    let challenges = match fetch_table_rows(
        &config.contact_data,
        outbound,
        ABUSE_STEP_UP_CHALLENGES_TABLE,
        "created_at.desc",
        50,
        &[],
        RestAuth::AccessToken(&access_token),
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return abuse_intelligence_error_response(),
    };
    let overrides = match fetch_table_rows(
        &config.contact_data,
        outbound,
        ABUSE_TRUST_OVERRIDES_TABLE,
        "created_at.desc",
        100,
        &[("revoked_at", "is.null")],
        RestAuth::ServiceRole,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return abuse_intelligence_error_response(),
    };

    no_store_response(json_response(
        200,
        abuse_intelligence_snapshot(subjects, signals, challenges, overrides),
    ))
}

async fn authorize_abuse_intelligence(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<String, AbuseIntelligenceAuthError> {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(AbuseIntelligenceAuthError::Unauthorized);
    };

    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => Ok(access_token),
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            Err(AbuseIntelligenceAuthError::Unauthorized)
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => Err(AbuseIntelligenceAuthError::Forbidden),
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            Err(AbuseIntelligenceAuthError::Internal)
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct AbuseIntelligenceQuery {
    limit: i64,
    signal_limit: i64,
}

fn abuse_intelligence_query_from_url(request_url: Option<&str>) -> AbuseIntelligenceQuery {
    let mut query = AbuseIntelligenceQuery {
        limit: 100,
        signal_limit: 100,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    query.limit = parse_positive_int_query_value(first_query_value(&url, "limit"), 100, 250);
    query.signal_limit =
        parse_positive_int_query_value(first_query_value(&url, "signalLimit"), 100, 250);

    query
}

fn first_query_value(url: &url::Url, expected_key: &str) -> Option<String> {
    url.query_pairs()
        .find_map(|(key, value)| (key == expected_key).then(|| value.into_owned()))
}

fn parse_positive_int_query_value(value: Option<String>, fallback: i64, max_value: i64) -> i64 {
    let Some(parsed) =
        value.and_then(|value| parse_js_parse_int_prefix(&value).filter(|value| *value >= 1))
    else {
        return fallback;
    };

    parsed.min(max_value)
}

async fn fetch_table_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    order: &str,
    limit: i64,
    extra_params: &[(&str, &str)],
    auth: RestAuth<'_>,
) -> Result<Vec<Value>, ()> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("order", order.to_owned()),
        ("limit", limit.to_string()),
    ];

    for (key, value) in extra_params {
        params.push((key, (*value).to_owned()));
    }

    let Some(url) = contact_data.rest_url(table, &params) else {
        return Err(());
    };
    let response = send_rest_get(contact_data, outbound, &url, auth).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_rest_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: RestAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        RestAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        RestAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn abuse_intelligence_snapshot(
    subjects: Vec<Value>,
    signals: Vec<Value>,
    challenges: Vec<Value>,
    overrides: Vec<Value>,
) -> Value {
    let tier_counts = count_by_tier(&subjects);
    let passed_challenges = challenges
        .iter()
        .filter(|challenge| string_field(challenge, "status") == Some("passed"))
        .count();
    let completed_challenges = challenges
        .iter()
        .filter(|challenge| matches!(string_field(challenge, "status"), Some("failed" | "passed")))
        .count();
    let challenge_pass_rate = if completed_challenges > 0 {
        Number::from_f64(passed_challenges as f64 / completed_challenges as f64)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    let top_risky_subjects = top_risky_subjects(&subjects);

    json!({
        "challenges": challenges,
        "overrides": overrides,
        "signals": signals,
        "subjects": subjects,
        "summary": {
            "activeOverrideCount": overrides.len(),
            "challengePassRate": challenge_pass_rate,
            "recentSignalCount": signals.len(),
            "restrictedSubjectCount": tier_count(&tier_counts, "restricted"),
            "tierCounts": tier_counts,
            "totalSubjectCount": top_risky_subjects.subject_count,
            "trustedSubjectCount": tier_count(&tier_counts, "trusted"),
            "watchedSubjectCount": tier_count(&tier_counts, "watch") + tier_count(&tier_counts, "challenge_required"),
        },
        "topRiskySubjects": top_risky_subjects.rows,
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct TopRiskySubjects {
    rows: Vec<Value>,
    subject_count: usize,
}

fn top_risky_subjects(subjects: &[Value]) -> TopRiskySubjects {
    let mut rows = subjects
        .iter()
        .filter(|subject| {
            matches!(
                string_field(subject, "tier"),
                Some("challenge_required" | "restricted" | "watch")
            )
        })
        .cloned()
        .collect::<Vec<_>>();

    rows.sort_by(|left, right| {
        let reputation_order = numeric_field(left, "reputation_score")
            .partial_cmp(&numeric_field(right, "reputation_score"))
            .unwrap_or(Ordering::Equal);

        if reputation_order != Ordering::Equal {
            return reputation_order;
        }

        numeric_field(right, "negative_signal_count")
            .partial_cmp(&numeric_field(left, "negative_signal_count"))
            .unwrap_or(Ordering::Equal)
    });
    rows.truncate(10);

    TopRiskySubjects {
        rows,
        subject_count: subjects.len(),
    }
}

fn count_by_tier(subjects: &[Value]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();

    for subject in subjects {
        let tier = string_field(subject, "tier").unwrap_or("standard");
        *counts.entry(tier.to_owned()).or_insert(0) += 1;
    }

    counts
}

fn tier_count(counts: &BTreeMap<String, usize>, tier: &str) -> usize {
    counts.get(tier).copied().unwrap_or(0)
}

fn string_field<'a>(value: &'a Value, field: &str) -> Option<&'a str> {
    value.get(field).and_then(Value::as_str)
}

fn numeric_field(value: &Value, field: &str) -> f64 {
    value.get(field).and_then(Value::as_f64).unwrap_or(0.0)
}

fn abuse_intelligence_error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": ERROR_MESSAGE })))
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handle_backend_request;
    use crate::outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundRequest, OutboundResponse,
    };
    use std::{cell::RefCell, collections::VecDeque};

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct RecordedOutboundRequest {
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

    #[derive(Default)]
    struct RecordingOutboundClient {
        calls: RefCell<Vec<RecordedOutboundRequest>>,
        responses: RefCell<VecDeque<OutboundResponse>>,
    }

    impl RecordingOutboundClient {
        fn with_responses(responses: Vec<OutboundResponse>) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                responses: RefCell::new(VecDeque::from(responses)),
            }
        }

        fn calls(&self) -> Vec<RecordedOutboundRequest> {
            self.calls.borrow().clone()
        }
    }

    impl OutboundHttpClient for RecordingOutboundClient {
        fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
            self.calls.borrow_mut().push(RecordedOutboundRequest {
                headers: request
                    .headers
                    .iter()
                    .map(|OutboundHeader { name, value }| (name.to_string(), value.to_string()))
                    .collect(),
                method: request.method,
                url: request.url.to_owned(),
            });
            let response = self
                .responses
                .borrow_mut()
                .pop_front()
                .unwrap_or_else(|| outbound_response(200, r#"[]"#));

            Box::pin(async move { Ok::<OutboundResponse, OutboundError>(response) })
        }
    }

    fn backend_config_with_contact_data() -> BackendConfig {
        let mut config = BackendConfig::new("test", "backend-test");
        config.contact_data = contact::ContactDataConfig::new(
            "https://project-ref.supabase.co",
            "test-service-role-secret",
        );
        config
    }

    fn request(method: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            body_text: None,
            cookie: None,
            method,
            origin: None,
            path: ABUSE_INTELLIGENCE_PATH,
            referer: None,
            request_id: None,
            url: Some(
                "https://backend.test/api/v1/infrastructure/abuse-intelligence?limit=999&signalLimit=2",
            ),
        }
    }

    fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
        OutboundResponse {
            body_text: body_text.into(),
            headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
            status,
        }
    }

    fn successful_auth_responses() -> Vec<OutboundResponse> {
        vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(
                200,
                r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"view_infrastructure"}]}}]"#,
            ),
            outbound_response(200, r#"[]"#),
        ]
    }

    fn recorded_header<'a>(request: &'a RecordedOutboundRequest, header: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(header))
            .map(|(_, value)| value.as_str())
    }

    #[tokio::test]
    async fn abuse_intelligence_rejects_missing_auth() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();
        let response = handle_backend_request(
            &config,
            BackendRequest {
                authorization: None,
                ..request("GET")
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body["message"], "Unauthorized");
        assert!(outbound.calls().is_empty());
    }

    #[tokio::test]
    async fn abuse_intelligence_rejects_missing_permission() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(200, r#"[]"#),
            outbound_response(200, r#"[]"#),
        ]);
        let response = handle_backend_request(&config, request("GET"), &outbound).await;

        assert_eq!(response.status, 403);
        assert_eq!(response.body["message"], "Forbidden");
        assert_eq!(outbound.calls().len(), 5);
    }

    #[tokio::test]
    async fn abuse_intelligence_returns_snapshot_with_summary_and_caller_scoped_reads() {
        let config = backend_config_with_contact_data();
        let mut responses = successful_auth_responses();
        responses.extend([
            outbound_response(
                200,
                r#"[
                    {"id":"subject-standard","tier":"standard","reputation_score":5,"negative_signal_count":1},
                    {"id":"subject-watch","tier":"watch","reputation_score":10,"negative_signal_count":5},
                    {"id":"subject-restricted","tier":"restricted","reputation_score":2,"negative_signal_count":1},
                    {"id":"subject-challenge","tier":"challenge_required","reputation_score":10,"negative_signal_count":9}
                ]"#,
            ),
            outbound_response(200, r#"[{"id":"signal-1"},{"id":"signal-2"}]"#),
            outbound_response(
                200,
                r#"[
                    {"id":"challenge-1","status":"passed"},
                    {"id":"challenge-2","status":"failed"},
                    {"id":"challenge-3","status":"pending"}
                ]"#,
            ),
            outbound_response(200, r#"[{"id":"override-1"}]"#),
        ]);
        let outbound = RecordingOutboundClient::with_responses(responses);
        let response = handle_backend_request(&config, request("GET"), &outbound).await;

        assert_eq!(response.status, 200);
        assert_eq!(response.body["subjects"][0]["id"], "subject-standard");
        assert_eq!(response.body["signals"].as_array().unwrap().len(), 2);
        assert_eq!(response.body["overrides"].as_array().unwrap().len(), 1);
        assert_eq!(response.body["summary"]["activeOverrideCount"], 1);
        assert_eq!(response.body["summary"]["challengePassRate"], json!(0.5));
        assert_eq!(response.body["summary"]["recentSignalCount"], 2);
        assert_eq!(response.body["summary"]["restrictedSubjectCount"], 1);
        assert_eq!(response.body["summary"]["tierCounts"]["standard"], 1);
        assert_eq!(response.body["summary"]["tierCounts"]["watch"], 1);
        assert_eq!(response.body["summary"]["tierCounts"]["restricted"], 1);
        assert_eq!(
            response.body["summary"]["tierCounts"]["challenge_required"],
            1
        );
        assert_eq!(response.body["summary"]["totalSubjectCount"], 4);
        assert_eq!(response.body["summary"]["trustedSubjectCount"], 0);
        assert_eq!(response.body["summary"]["watchedSubjectCount"], 2);
        assert_eq!(
            response.body["topRiskySubjects"][0]["id"],
            "subject-restricted"
        );
        assert_eq!(
            response.body["topRiskySubjects"][1]["id"],
            "subject-challenge"
        );
        assert_eq!(response.body["topRiskySubjects"][2]["id"], "subject-watch");

        let calls = outbound.calls();
        assert_eq!(calls.len(), 9);
        assert!(calls[5].url.contains("abuse_reputation_subjects"));
        assert!(calls[5].url.contains("order=last_seen_at.desc"));
        assert!(calls[5].url.contains("limit=250"));
        assert!(calls[6].url.contains("abuse_activity_signals"));
        assert!(calls[6].url.contains("limit=2"));
        assert!(calls[7].url.contains("abuse_step_up_challenges"));
        assert!(calls[7].url.contains("limit=50"));
        assert!(calls[8].url.contains("abuse_trust_overrides"));
        assert!(calls[8].url.contains("revoked_at=is.null"));
        assert!(calls[8].url.contains("limit=100"));
        for call in &calls[5..8] {
            assert_eq!(
                recorded_header(call, "Authorization"),
                Some("Bearer browser-access-token")
            );
            assert_eq!(
                recorded_header(call, "apikey"),
                Some("test-service-role-secret")
            );
        }
        assert_eq!(
            recorded_header(&calls[8], "Authorization"),
            Some("Bearer test-service-role-secret")
        );
    }

    #[tokio::test]
    async fn abuse_intelligence_returns_legacy_load_error_on_table_failure() {
        let config = backend_config_with_contact_data();
        let mut responses = successful_auth_responses();
        responses.push(outbound_response(500, r#"{"message":"failed"}"#));
        let outbound = RecordingOutboundClient::with_responses(responses);
        let response = handle_backend_request(&config, request("GET"), &outbound).await;

        assert_eq!(response.status, 500);
        assert_eq!(response.body["message"], ERROR_MESSAGE);
        assert_eq!(outbound.calls().len(), 6);
    }

    #[tokio::test]
    async fn abuse_intelligence_leaves_post_legacy_owned() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();
        let response = handle_abuse_intelligence_route(&config, request("POST"), &outbound).await;

        assert!(response.is_none());
        assert!(outbound.calls().is_empty());
    }
}
