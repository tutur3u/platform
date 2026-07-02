//! Handler for
//! `GET /api/v1/workspaces/:wsId/tulearn/courses/:courseId/tests/:testId/attempt`.
//!
//! Ported from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/[testId]/attempt/route.ts`.
//!
//! Auth: `withSessionAuth({ allowAppSessionAuth: true })` →
//! `supabase_auth::request_access_token_allowing_app_sessions` +
//! `supabase_auth::fetch_supabase_auth_user`.
//!
//! ## Behavior gaps vs. legacy
//!
//! - **Auto-submit on expiry** is not implemented. The grading engine in
//!   `submitTestAttemptInternal` (type routing, private-schema correct-answer
//!   lookup, ordering/matching/paragraph logic) is too large to port here.
//!   Expired unsubmitted attempts are returned in their active state.
//! - **Workspace-slug normalization**: only `"internal"` → root UUID is
//!   handled; `"personal"` and handle-based slugs are not resolved. `wsId`
//!   is expected to be a UUID for this student-facing endpoint.
//! - `POST`/`PATCH`/`DELETE` return `None` (fall through to Next.js).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(crate) async fn handle_workspaces_wsid_tulearn_courses_courseid_tests_testid_attempt_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, course_id, test_id) = extract_path_params(request.path)?;
    Some(match request.method {
        "GET" => attempt_get(config, request, raw_ws_id, course_id, test_id, outbound).await,
        _ => return None,
    })
}

async fn attempt_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    test_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;

    let Some(token) = supabase_auth::request_access_token_allowing_app_sessions(request) else {
        return msg(401, "Unauthorized");
    };
    let Some(user_id) = supabase_auth::fetch_supabase_auth_user(cd, &token, outbound)
        .await
        .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return msg(401, "Unauthorized");
    };

    let student_id = student_id_from_url(request.url);
    let subject =
        match resolve_subject(cd, outbound, raw_ws_id, &user_id, student_id.as_deref()).await {
            Ok(s) => s,
            Err(SubjectError::Access(status, m)) => return msg(status, m),
            Err(SubjectError::Internal) => return msg(500, "Failed to load test attempt"),
        };

    let test = match fetch_row(
        cd,
        outbound,
        "course_tests",
        &[
            ("select", "id,is_score_published".to_owned()),
            ("id", format!("eq.{test_id}")),
            ("course_id", format!("eq.{course_id}")),
            ("is_published", "eq.true".to_owned()),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(Some(t)) => t,
        Ok(None) => {
            return no_store_response(json_response(404, json!({"message":"Test not found"})));
        }
        Err(()) => return msg(500, "Failed to load test attempt"),
    };

    let is_score_published = test
        .get("is_score_published")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let attempt = match fetch_row(
        cd,
        outbound,
        "course_test_attempts",
        &[
            ("select", "*".to_owned()),
            ("test_id", format!("eq.{test_id}")),
            (
                "user_id",
                format!("eq.{}", subject.student_platform_user_id),
            ),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(a) => a,
        Err(()) => return msg(500, "Failed to load test attempt"),
    };

    let Some(attempt) = attempt else {
        return no_store_response(json_response(200, json!({"attempt":null})));
    };

    let is_submitted = attempt
        .get("submitted_at")
        .map(|v| !v.is_null())
        .unwrap_or(false);
    let attempt_id = attempt.get("id").and_then(Value::as_str).unwrap_or("");

    // NOTE: auto-submit on expiry is not implemented (see module doc).

    if is_submitted {
        let score = if is_score_published {
            attempt.get("score").cloned().unwrap_or(Value::Null)
        } else {
            Value::Null
        };
        let mut attempt_out = attempt.clone();
        if let Some(obj) = attempt_out.as_object_mut() {
            obj.insert("score".to_owned(), score);
        }

        let (quizzes, answers) = if is_score_published {
            match load_quizzes_and_answers(cd, outbound, test_id, attempt_id, true).await {
                Ok(pair) => pair,
                Err(()) => return msg(500, "Failed to load test attempt"),
            }
        } else {
            (Value::Array(vec![]), Value::Array(vec![]))
        };

        return no_store_response(json_response(
            200,
            json!({
                "attempt": attempt_out,
                "quizzes": quizzes,
                "answers": answers,
            }),
        ));
    }

    // Active attempt.
    let (quizzes, answers) =
        match load_quizzes_and_answers(cd, outbound, test_id, attempt_id, false).await {
            Ok(pair) => pair,
            Err(()) => return msg(500, "Failed to load test attempt"),
        };
    no_store_response(json_response(
        200,
        json!({
            "attempt": attempt,
            "quizzes": quizzes,
            "answers": answers,
        }),
    ))
}

/// Fetches quizzes (with option fields depending on `review`) and answers
/// for `attempt_id`. Returns `(quizzes_json, answers_json)`.
async fn load_quizzes_and_answers(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    test_id: &str,
    attempt_id: &str,
    review: bool,
) -> Result<(Value, Value), ()> {
    // Fetch quiz IDs linked to this test.
    let url = cd
        .rest_url(
            "course_test_quizzes",
            &[
                ("select", "quiz_id".to_owned()),
                ("test_id", format!("eq.{test_id}")),
            ],
        )
        .ok_or(())?;
    let resp = srget(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    #[derive(Deserialize)]
    struct QIdRow {
        quiz_id: Option<String>,
    }
    let quiz_ids: Vec<String> = resp
        .json::<Vec<QIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|r| r.quiz_id)
        .collect();

    let quizzes = if quiz_ids.is_empty() {
        vec![]
    } else {
        let opts = if review {
            "quiz_options(id,value,is_correct,explanation)"
        } else {
            "quiz_options(id,value)"
        };
        let select = format!("id,question,type,content,score,{opts}");
        let in_f = in_list(&quiz_ids);
        let url2 = cd
            .rest_url(
                "workspace_quizzes",
                &[
                    ("select", select),
                    ("id", format!("in.{in_f}")),
                    ("order", "created_at.desc".to_owned()),
                ],
            )
            .ok_or(())?;
        let resp2 = srget(cd, outbound, &url2).await?;
        if !(200..300).contains(&resp2.status) {
            return Err(());
        }
        resp2.json::<Vec<Value>>().map_err(|_| ())?
    };

    let ans_select = if review {
        "quiz_id,selected_option_id,answer,is_correct,score_awarded,feedback"
    } else {
        "quiz_id,selected_option_id,answer"
    };
    let url3 = cd
        .rest_url(
            "course_test_attempt_answers",
            &[
                ("select", ans_select.to_owned()),
                ("attempt_id", format!("eq.{attempt_id}")),
            ],
        )
        .ok_or(())?;
    let resp3 = srget(cd, outbound, &url3).await?;
    if !(200..300).contains(&resp3.status) {
        return Err(());
    }
    let answers = resp3.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((Value::Array(quizzes), Value::Array(answers)))
}

// Subject resolution (mirrors access.ts::resolveTulearnSubject).

enum SubjectError {
    Access(u16, &'static str),
    Internal,
}

struct Subject {
    student_platform_user_id: String,
}

async fn resolve_subject(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    student_id: Option<&str>,
) -> Result<Subject, SubjectError> {
    let ws_id = if raw_ws_id.trim().eq_ignore_ascii_case("internal") {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if !education_enabled(cd, outbound, &ws_id)
        .await
        .map_err(|()| SubjectError::Internal)?
    {
        return Err(SubjectError::Access(
            404,
            "Tulearn is not enabled for this workspace",
        ));
    }

    // Self-student check.
    let url = cd
        .rest_url(
            "workspace_user_linked_users",
            &[
                ("select", "virtual_user_id".to_owned()),
                ("platform_user_id", format!("eq.{user_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(SubjectError::Internal)?;
    let r = srget(cd, outbound, &url)
        .await
        .map_err(|()| SubjectError::Internal)?;
    if !(200..300).contains(&r.status) {
        return Err(SubjectError::Internal);
    }
    #[derive(Deserialize)]
    struct LRow {
        virtual_user_id: Option<String>,
    }
    let is_student = r
        .json::<Vec<LRow>>()
        .map_err(|_| SubjectError::Internal)?
        .into_iter()
        .next()
        .and_then(|r| r.virtual_user_id)
        .is_some();

    if student_id.is_none() && is_student {
        return Ok(Subject {
            student_platform_user_id: user_id.to_owned(),
        });
    }

    // Parent link lookup.
    let mut params = vec![
        ("select", "student_platform_user_id".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("parent_user_id", format!("eq.{user_id}")),
        ("status", "eq.active".to_owned()),
    ];
    if let Some(sid) = student_id {
        params.push(("student_workspace_user_id", format!("eq.{sid}")));
    }
    params.push(("order", "created_at.asc".to_owned()));
    params.push(("limit", "1".to_owned()));
    let url2 = cd
        .rest_url("tulearn_parent_student_links", &params)
        .ok_or(SubjectError::Internal)?;
    let r2 = srget(cd, outbound, &url2)
        .await
        .map_err(|()| SubjectError::Internal)?;
    if !(200..300).contains(&r2.status) {
        return Err(SubjectError::Internal);
    }
    #[derive(Deserialize)]
    struct PRow {
        student_platform_user_id: Option<String>,
    }
    let link_id = r2
        .json::<Vec<PRow>>()
        .map_err(|_| SubjectError::Internal)?
        .into_iter()
        .next()
        .and_then(|r| r.student_platform_user_id);

    link_id
        .map(|id| Subject {
            student_platform_user_id: id,
        })
        .ok_or(SubjectError::Access(
            403,
            "You don't have access to this learner",
        ))
}

async fn education_enabled(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = cd
        .rest_url(
            "workspace_secrets",
            &[
                ("select", "value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("name", format!("eq.{ENABLE_EDUCATION_SECRET}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let r = srget(cd, outbound, &url).await?;
    if !(200..300).contains(&r.status) {
        return Err(());
    }
    #[derive(Deserialize)]
    struct SRow {
        value: Option<String>,
    }
    let rows: Vec<SRow> = r.json().map_err(|_| ())?;
    Ok(rows
        .into_iter()
        .next()
        .and_then(|r| r.value)
        .map(|v| v.trim().to_lowercase() == "true")
        .unwrap_or(false))
}

/// Fetches the first row matching `params` from `table`. Returns `Ok(None)`
/// when no row is found, `Err(())` on network/parse error.
async fn fetch_row(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Option<Value>, ()> {
    let url = cd.rest_url(table, params).ok_or(())?;
    let resp = srget(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    let rows: Vec<Value> = resp.json().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

async fn srget(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let key = cd.service_role_key().ok_or(())?;
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &format!("Bearer {key}"))
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())
}

fn student_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok())?;
    url.query_pairs()
        .find_map(|(k, v)| (k == "studentId" && !v.trim().is_empty()).then(|| v.into_owned()))
}

fn in_list(ids: &[String]) -> String {
    let inner = ids
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "")))
        .collect::<Vec<_>>()
        .join(",");
    format!("({inner})")
}

fn msg(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({"message": message})))
}

fn extract_path_params(path: &str) -> Option<(&str, &str, &str)> {
    let segs = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    // ["api","v1","workspaces",wsId,"tulearn","courses",courseId,"tests",testId,"attempt"]
    if segs.len() == 10
        && segs[0] == "api"
        && segs[1] == "v1"
        && segs[2] == "workspaces"
        && !segs[3].is_empty()
        && segs[4] == "tulearn"
        && segs[5] == "courses"
        && !segs[6].is_empty()
        && segs[7] == "tests"
        && !segs[8].is_empty()
        && segs[9] == "attempt"
    {
        Some((segs[3], segs[6], segs[8]))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_matches() {
        let r =
            extract_path_params("/api/v1/workspaces/ws-1/tulearn/courses/c-1/tests/t-1/attempt");
        assert_eq!(r, Some(("ws-1", "c-1", "t-1")));
    }

    #[test]
    fn test_extract_no_slash() {
        let r =
            extract_path_params("api/v1/workspaces/ws-abc/tulearn/courses/c-xyz/tests/t-9/attempt");
        assert_eq!(r, Some(("ws-abc", "c-xyz", "t-9")));
    }

    #[test]
    fn test_extract_wrong_suffix() {
        assert!(
            extract_path_params("/api/v1/workspaces/ws-1/tulearn/courses/c-1/tests/t-1/other")
                .is_none()
        );
    }

    #[test]
    fn test_extract_too_short() {
        assert!(
            extract_path_params("/api/v1/workspaces/ws-1/tulearn/courses/c-1/tests/t-1").is_none()
        );
    }

    #[test]
    fn test_extract_extra_segment() {
        assert!(
            extract_path_params(
                "/api/v1/workspaces/ws-1/tulearn/courses/c-1/tests/t-1/attempt/extra"
            )
            .is_none()
        );
    }

    #[test]
    fn test_extract_empty_ws_id() {
        assert!(
            extract_path_params("/api/v1/workspaces//tulearn/courses/c-1/tests/t-1/attempt")
                .is_none()
        );
    }

    #[test]
    fn test_in_list_single() {
        assert_eq!(in_list(&["a".to_owned()]), "(\"a\")");
    }

    #[test]
    fn test_in_list_multiple() {
        assert_eq!(in_list(&["x".to_owned(), "y".to_owned()]), "(\"x\",\"y\")");
    }

    #[test]
    fn test_in_list_empty() {
        assert_eq!(in_list(&[]), "()");
    }
}
