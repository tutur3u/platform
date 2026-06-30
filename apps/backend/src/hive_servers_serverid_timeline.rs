//! Handler for `GET /api/v1/hive/servers/:serverId/timeline`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/hive/servers/[serverId]/timeline/route.ts`
//!
//! ## Auth
//!
//! Mirrors `requireHiveAccess`:
//!
//! - `401` `{ "error": "Unauthorized" }` — missing/invalid session.
//! - `500` `{ "error": "Failed to resolve Hive access" }` — internal error.
//! - `403` `{ "error": "Hive access required" }` — no Hive access.
//!
//! ## Data layer gaps
//!
//! The legacy queries a separate Hive Postgres database (`HIVE_DATABASE_URL`)
//! with raw SQL joins. This port uses Supabase REST with these gaps:
//!
//! 1. **NPC names** (`npc_name`, `target_npc_name`): need a JOIN to
//!    `hive_npcs`. Returned as `null` here.
//! 2. **Workflow name** (`workflowName`): needs a JOIN to `hive_workflows`.
//!    Returned as `null` here.
//! 3. **isAdmin workflow filter**: legacy hides disabled-workflow runs for
//!    non-admins. This port omits that filter (the join is absent).
//! 4. **Fault tolerance**: all table fetches fail silently with `[]`, matching
//!    the legacy `.catch(() => [])` pattern on optional tables.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];

fn parse_path(path: &str) -> Option<&str> {
    let base = path.split('?').next().unwrap_or(path);
    let seg: Vec<&str> = base
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    if seg.len() == 6
        && seg[0] == "api"
        && seg[1] == "v1"
        && seg[2] == "hive"
        && seg[3] == "servers"
        && !seg[4].is_empty()
        && seg[5] == "timeline"
    {
        Some(seg[4])
    } else {
        None
    }
}

struct Filters<'a> {
    actor_user_id: Option<&'a str>,
    event_type: Option<&'a str>,
    limit: usize,
    npc_id: Option<&'a str>,
    research_session_id: Option<&'a str>,
    status: Option<&'a str>,
    trigger: Option<&'a str>,
    workflow_id: Option<&'a str>,
}

fn non_empty(s: &str) -> Option<&str> {
    let t = s.trim();
    if t.is_empty() { None } else { Some(t) }
}

fn parse_filters(path: &str) -> Filters<'_> {
    let qs = path.split_once('?').map(|x| x.1).unwrap_or("");
    let mut actor_user_id = None;
    let mut event_type = None;
    let mut limit_raw: Option<&str> = None;
    let mut npc_id = None;
    let mut research_session_id = None;
    let mut status = None;
    let mut trigger = None;
    let mut workflow_id = None;
    for part in qs.split('&') {
        let mut kv = part.splitn(2, '=');
        let key = kv.next().unwrap_or("");
        let val = kv.next().unwrap_or("").trim();
        match key {
            "actorUserId" => actor_user_id = non_empty(val),
            "eventType" => event_type = non_empty(val),
            "limit" => limit_raw = non_empty(val),
            "npcId" => npc_id = non_empty(val),
            "researchSessionId" => research_session_id = non_empty(val),
            "status" => status = non_empty(val),
            "trigger" => trigger = non_empty(val),
            "workflowId" => workflow_id = non_empty(val),
            _ => {}
        }
    }
    let limit = limit_raw
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(180)
        .clamp(1, 500);
    Filters {
        actor_user_id,
        event_type,
        limit,
        npc_id,
        research_session_id,
        status,
        trigger,
        workflow_id,
    }
}

pub(crate) async fn handle_hive_servers_serverid_timeline_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let server_id = parse_path(request.path)?;
    Some(match request.method {
        "GET" => get_response(config, request, server_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    server_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user =
        match hive_access::authenticated_user(config, request, &HIVE_APP_SESSION_TARGETS, outbound)
            .await
        {
            Ok(u) => u,
            Err(()) => {
                return no_store_response(json_response(401, json!({ "error": "Unauthorized" })));
            }
        };
    match hive_access::resolve_hive_access(&config.contact_data, &user.id, outbound).await {
        Ok(a) if !a.has_access() => {
            return no_store_response(json_response(
                403,
                json!({ "error": "Hive access required" }),
            ));
        }
        Err(()) => {
            return no_store_response(json_response(
                500,
                json!({ "error": "Failed to resolve Hive access" }),
            ));
        }
        Ok(_) => {}
    }

    let f = parse_filters(request.path);
    let limit = f.limit;

    let mut items: Vec<Value> = Vec::new();
    items.extend(
        fetch_rows(
            &config.contact_data,
            "hive_world_events",
            &world_event_params(server_id, &f),
            outbound,
        )
        .await
        .iter()
        .map(map_event),
    );
    items.extend(group_npc_runs(
        fetch_rows(
            &config.contact_data,
            "hive_npc_runs",
            &npc_run_params(server_id, &f),
            outbound,
        )
        .await
        .into_iter()
        .map(|r| map_npc_run(&r))
        .collect(),
    ));
    items.extend(
        fetch_rows(
            &config.contact_data,
            "hive_workflow_runs",
            &workflow_run_params(server_id, &f),
            outbound,
        )
        .await
        .iter()
        .map(map_workflow_run),
    );
    items.extend(
        fetch_rows(
            &config.contact_data,
            "hive_simulation_ticks",
            &sim_tick_params(server_id, &f),
            outbound,
        )
        .await
        .iter()
        .map(map_simulation_tick),
    );
    items.extend(
        fetch_rows(
            &config.contact_data,
            "hive_research_session_events",
            &session_event_params(server_id, &f),
            outbound,
        )
        .await
        .iter()
        .map(map_session_event),
    );

    items.sort_by(|a, b| {
        b["createdAt"]
            .as_str()
            .unwrap_or("")
            .cmp(a["createdAt"].as_str().unwrap_or(""))
    });
    items.truncate(limit);

    no_store_response(json_response(200, json!({ "items": items })))
}

async fn fetch_rows(
    cd: &contact::ContactDataConfig,
    table: &str,
    params: &[(&str, String)],
    outbound: &impl OutboundHttpClient,
) -> Vec<Value> {
    let Some(url) = cd.rest_url(table, params) else {
        return vec![];
    };
    let Some(key) = cd.service_role_key() else {
        return vec![];
    };
    let bearer = format!("Bearer {key}");
    let Ok(resp) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key),
        )
        .await
    else {
        return vec![];
    };
    if !(200..300).contains(&resp.status) {
        return vec![];
    }
    resp.json::<Vec<Value>>().unwrap_or_default()
}

fn world_event_params<'a>(server_id: &str, f: &Filters<'_>) -> Vec<(&'a str, String)> {
    let mut p = vec![
        (
            "select",
            "id,actor_user_id,op_seq,revision,event_type,payload,research_session_id,created_at"
                .to_owned(),
        ),
        ("server_id", format!("eq.{server_id}")),
        ("order", "created_at.desc".to_owned()),
        ("limit", f.limit.to_string()),
    ];
    if let Some(v) = f.research_session_id {
        p.push(("research_session_id", format!("eq.{v}")));
    }
    if let Some(v) = f.event_type {
        p.push(("event_type", format!("eq.{v}")));
    }
    if let Some(v) = f.actor_user_id {
        p.push(("actor_user_id", format!("eq.{v}")));
    }
    p
}

fn npc_run_params<'a>(server_id: &str, f: &Filters<'_>) -> Vec<(&'a str, String)> {
    let cols = concat!(
        "id,server_id,npc_id,actor_user_id,prompt_mode,input_context,output_decision,",
        "interaction_id,target_npc_id,trigger,status,error,llm_provider,llm_model,",
        "llm_cost,input_tokens,output_tokens,reasoning_tokens,credits_deducted,",
        "credit_ws_id,credit_source,autonomous,research_session_id,created_at"
    );
    let mut p = vec![
        ("select", cols.to_owned()),
        ("server_id", format!("eq.{server_id}")),
        ("order", "created_at.desc".to_owned()),
        ("limit", f.limit.to_string()),
    ];
    if let Some(v) = f.research_session_id {
        p.push(("research_session_id", format!("eq.{v}")));
    }
    if let Some(v) = f.trigger {
        p.push(("trigger", format!("eq.{v}")));
    }
    if let Some(v) = f.status {
        p.push(("status", format!("eq.{v}")));
    }
    if let Some(v) = f.actor_user_id {
        p.push(("actor_user_id", format!("eq.{v}")));
    }
    if let Some(v) = f.npc_id {
        p.push(("or", format!("(npc_id.eq.{v},target_npc_id.eq.{v})")));
    }
    p
}

fn workflow_run_params<'a>(server_id: &str, f: &Filters<'_>) -> Vec<(&'a str, String)> {
    let cols = concat!(
        "id,workflow_id,server_id,actor_user_id,status,input,output,",
        "step_trace,error,started_at,finished_at,created_at,research_session_id"
    );
    let mut p = vec![
        ("select", cols.to_owned()),
        ("server_id", format!("eq.{server_id}")),
        ("order", "created_at.desc".to_owned()),
        ("limit", f.limit.to_string()),
    ];
    if let Some(v) = f.research_session_id {
        p.push(("research_session_id", format!("eq.{v}")));
    }
    if let Some(v) = f.status {
        p.push(("status", format!("eq.{v}")));
    }
    if let Some(v) = f.actor_user_id {
        p.push(("actor_user_id", format!("eq.{v}")));
    }
    if let Some(v) = f.workflow_id {
        p.push(("workflow_id", format!("eq.{v}")));
    }
    p
}

fn sim_tick_params<'a>(server_id: &str, f: &Filters<'_>) -> Vec<(&'a str, String)> {
    let mut p = vec![
        ("select", "id,server_id,research_session_id,started_at,finished_at,status,actions_count,llm_spend,summary,error".to_owned()),
        ("server_id", format!("eq.{server_id}")),
        ("order", "started_at.desc".to_owned()),
        ("limit", f.limit.to_string()),
    ];
    if let Some(v) = f.research_session_id {
        p.push(("research_session_id", format!("eq.{v}")));
    }
    if let Some(v) = f.status {
        p.push(("status", format!("eq.{v}")));
    }
    p
}

fn session_event_params<'a>(server_id: &str, f: &Filters<'_>) -> Vec<(&'a str, String)> {
    let mut p = vec![
        ("select", "id,session_id,server_id,actor_user_id,event_kind,source_type,source_id,payload,created_at".to_owned()),
        ("server_id", format!("eq.{server_id}")),
        ("order", "created_at.desc".to_owned()),
        ("limit", f.limit.to_string()),
    ];
    if let Some(v) = f.research_session_id {
        p.push(("session_id", format!("eq.{v}")));
    }
    if let Some(v) = f.event_type {
        p.push(("event_kind", format!("eq.{v}")));
    }
    if let Some(v) = f.actor_user_id {
        p.push(("actor_user_id", format!("eq.{v}")));
    }
    p
}

fn map_event(r: &Value) -> Value {
    let revision = r
        .get("op_seq")
        .and_then(Value::as_i64)
        .or_else(|| r.get("revision").and_then(Value::as_i64))
        .unwrap_or(0);
    json!({
        "actorUserId": r["actor_user_id"], "createdAt": r["created_at"],
        "eventType": r["event_type"], "id": r["id"], "kind": "event",
        "payload": r["payload"],
        "researchSessionId": r.get("research_session_id").unwrap_or(&Value::Null),
        "revision": revision,
    })
}

fn map_npc_run(r: &Value) -> Value {
    json!({
        "actorUserId": r["actor_user_id"],
        "autonomous": r.get("autonomous").and_then(Value::as_bool).unwrap_or(false),
        "creditSource": r["credit_source"], "creditWsId": r["credit_ws_id"],
        "creditsDeducted": r["credits_deducted"].as_f64().unwrap_or(0.0),
        "createdAt": r["created_at"], "error": r["error"], "id": r["id"],
        "inputContext": r["input_context"],
        "inputTokens": r["input_tokens"].as_i64().unwrap_or(0),
        "interactionId": r["interaction_id"], "kind": "run",
        "llmCost": r["llm_cost"].as_f64().unwrap_or(0.0),
        "llmModel": r["llm_model"], "llmProvider": r["llm_provider"],
        "npcId": r["npc_id"], "npcName": Value::Null, "outputDecision": r["output_decision"],
        "outputTokens": r["output_tokens"].as_i64().unwrap_or(0), "promptMode": r["prompt_mode"],
        "reasoningTokens": r["reasoning_tokens"].as_i64().unwrap_or(0),
        "researchSessionId": r.get("research_session_id").unwrap_or(&Value::Null),
        "status": r.get("status").and_then(Value::as_str).unwrap_or("completed"),
        "targetNpcId": r["target_npc_id"], "targetNpcName": Value::Null,
        "trigger": r.get("trigger").and_then(Value::as_str).unwrap_or("manual"),
    })
}

fn map_workflow_run(r: &Value) -> Value {
    let st = r.get("step_trace").cloned().unwrap_or_default();
    let step_trace = if st.is_array() {
        st
    } else {
        Value::Array(vec![])
    };
    json!({
        "actorUserId": r["actor_user_id"], "createdAt": r["created_at"],
        "error": r["error"], "finishedAt": r["finished_at"],
        "id": r["id"], "input": r["input"], "kind": "workflow_run", "output": r["output"],
        "researchSessionId": r.get("research_session_id").unwrap_or(&Value::Null),
        "serverId": r["server_id"], "startedAt": r["started_at"], "status": r["status"],
        "stepTrace": step_trace, "workflowId": r["workflow_id"], "workflowName": Value::Null,
    })
}

fn map_simulation_tick(r: &Value) -> Value {
    json!({
        "actionsCount": r["actions_count"], "createdAt": r["started_at"],
        "error": r["error"], "finishedAt": r["finished_at"],
        "id": r["id"], "kind": "simulation_tick",
        "llmSpend": r["llm_spend"].as_f64().unwrap_or(0.0),
        "researchSessionId": r.get("research_session_id").unwrap_or(&Value::Null),
        "serverId": r["server_id"], "startedAt": r["started_at"],
        "status": r["status"], "summary": r["summary"],
    })
}

fn map_session_event(r: &Value) -> Value {
    json!({
        "actorUserId": r["actor_user_id"], "createdAt": r["created_at"],
        "eventKind": r["event_kind"], "id": r["id"], "kind": "session_event",
        "payload": r["payload"],
        "researchSessionId": r.get("session_id").unwrap_or(&Value::Null),
        "serverId": r["server_id"], "sessionId": r["session_id"],
        "sourceId": r["source_id"], "sourceType": r["source_type"],
    })
}

/// Groups mapped NPC run items by `interactionId` (mirrors legacy
/// `groupNpcRuns`). Runs without an `interactionId` pass through as `run`
/// items; runs sharing an id are merged into one `interaction` item.
fn group_npc_runs(mapped_runs: Vec<Value>) -> Vec<Value> {
    use std::collections::HashMap;

    let mut grouped: HashMap<String, Vec<Value>> = HashMap::new();
    let mut standalone: Vec<Value> = Vec::new();
    for run in mapped_runs {
        match run["interactionId"].as_str().map(str::to_owned) {
            Some(id) if !id.is_empty() => grouped.entry(id).or_default().push(run),
            _ => standalone.push(run),
        }
    }

    let mut result: Vec<Value> = Vec::new();
    for (iid, mut group) in grouped {
        group.sort_by(|a, b| {
            a["createdAt"]
                .as_str()
                .unwrap_or("")
                .cmp(b["createdAt"].as_str().unwrap_or(""))
        });
        let latest_at = group
            .last()
            .and_then(|r| r["createdAt"].as_str())
            .unwrap_or("")
            .to_owned();
        let first = &group[0];
        let status = if group.iter().any(|r| r["status"].as_str() == Some("failed")) {
            "failed"
        } else if group
            .iter()
            .any(|r| r["status"].as_str() == Some("running"))
        {
            "running"
        } else if group
            .iter()
            .all(|r| r["status"].as_str() == Some("skipped"))
        {
            "skipped"
        } else {
            "completed"
        };
        let credits: f64 = group
            .iter()
            .map(|r| r["creditsDeducted"].as_f64().unwrap_or(0.0))
            .sum();
        let llm_cost: f64 = group
            .iter()
            .map(|r| r["llmCost"].as_f64().unwrap_or(0.0))
            .sum();
        let autonomous = group
            .iter()
            .any(|r| r["autonomous"].as_bool().unwrap_or(false));
        let (actor, csrc, cwid, model, prov, sess) = (
            first["actorUserId"].clone(),
            first["creditSource"].clone(),
            first["creditWsId"].clone(),
            first["llmModel"].clone(),
            first["llmProvider"].clone(),
            first["researchSessionId"].clone(),
        );
        let trig = first["trigger"].as_str().unwrap_or("manual").to_owned();
        result.push(json!({
            "actorUserId": actor, "autonomous": autonomous, "createdAt": latest_at,
            "creditSource": csrc, "creditWsId": cwid, "creditsDeducted": credits,
            "id": &*iid, "interactionId": &*iid, "kind": "interaction",
            "llmCost": llm_cost, "llmModel": model, "llmProvider": prov,
            "npcName": Value::Null, "researchSessionId": sess, "runs": group,
            "status": status, "targetNpcName": Value::Null, "trigger": trig,
        }));
    }
    result.extend(standalone);
    result
}

#[cfg(test)]
mod tests {
    use super::{group_npc_runs, parse_filters, parse_path};
    use serde_json::json;

    #[test]
    fn parse_path_matches_and_rejects() {
        assert_eq!(
            parse_path("/api/v1/hive/servers/srv-1/timeline"),
            Some("srv-1")
        );
        assert_eq!(
            parse_path("/api/v1/hive/servers/s/timeline?limit=50"),
            Some("s")
        );
        assert_eq!(parse_path("/api/v1/hive/servers/s/research-sessions"), None);
        assert_eq!(parse_path("/api/v1/hive/servers/s/timeline/extra"), None);
        assert_eq!(parse_path("/api/v1/hive/servers//timeline"), None);
        assert_eq!(parse_path("/api/v2/hive/servers/s/timeline"), None);
    }

    #[test]
    fn parse_filters_parses_all_params_and_clamps_limit() {
        let f = parse_filters(
            "?actorUserId=u1&eventType=e&limit=50&npcId=n1&researchSessionId=s1&status=completed&trigger=manual&workflowId=w1",
        );
        assert_eq!(
            (
                f.limit,
                f.actor_user_id,
                f.npc_id,
                f.research_session_id,
                f.status,
                f.trigger,
                f.workflow_id
            ),
            (
                50,
                Some("u1"),
                Some("n1"),
                Some("s1"),
                Some("completed"),
                Some("manual"),
                Some("w1")
            )
        );
        assert_eq!(parse_filters("").limit, 180);
        assert_eq!(parse_filters("?limit=9999").limit, 500);
        assert_eq!(parse_filters("?limit=0").limit, 1);
    }

    fn make_run(
        id: &str,
        iid: Option<&str>,
        ts: &str,
        status: &str,
        credits: f64,
    ) -> serde_json::Value {
        json!({
            "id": id, "interactionId": iid, "createdAt": ts, "status": status,
            "kind": "run",
            "creditsDeducted": credits, "llmCost": 0.0, "autonomous": false,
            "actorUserId": "u1", "creditSource": null, "creditWsId": null,
            "llmModel": null, "llmProvider": null, "researchSessionId": null, "trigger": "manual",
        })
    }

    #[test]
    fn group_npc_runs_groups_and_aggregates() {
        let runs = vec![
            make_run("r1", Some("i1"), "2024-01-01T00:00:00Z", "completed", 5.0),
            make_run("r2", Some("i1"), "2024-01-01T00:01:00Z", "failed", 3.0),
            make_run("r3", None, "2024-01-01T00:02:00Z", "completed", 1.0),
        ];
        let result = group_npc_runs(runs);
        assert_eq!(result.len(), 2);
        let i = result.iter().find(|v| v["kind"] == "interaction").unwrap();
        assert_eq!(i["id"], "i1");
        assert_eq!(i["status"], "failed");
        assert!((i["creditsDeducted"].as_f64().unwrap() - 8.0).abs() < 0.001);
        assert_eq!(i["runs"].as_array().unwrap().len(), 2);
        assert!(result.iter().any(|v| v["kind"] == "run"));
    }
}
