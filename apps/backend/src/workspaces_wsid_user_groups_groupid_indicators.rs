//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId/indicators`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route.ts`.
//! POST and PATCH are not ported; `None` is returned so those fall through to
//! the still-live Next.js route.
//!
//! Auth uses `workspace_permission_check::authorize_workspace_permission` with
//! `view_user_groups_scores`. Private-schema tables are queried with the
//! `Accept-Profile: private` header (equivalent to `.schema('private')`). All
//! reads use the service-role key to match `createAdminClient()`.

use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PRIVATE_SCHEMA: &str = "private";
const VIEW_PERMISSION: &str = "view_user_groups_scores";
const NOT_FOUND_ERROR: &str = "Not found";
const FORBIDDEN_MESSAGE: &str = "Insufficient permissions to view group indicators";
const FETCH_ERROR_MESSAGE: &str = "Error fetching group indicators";

fn indicators_segments(path: &str) -> Option<(&str, &str)> {
    let segs = path_segments(path);
    if segs.len() == 7
        && segs[0] == "api"
        && segs[1] == "v1"
        && segs[2] == "workspaces"
        && !segs[3].is_empty()
        && segs[4] == "user-groups"
        && !segs[5].is_empty()
        && segs[6] == "indicators"
    {
        Some((segs[3], segs[5]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
}

#[derive(Deserialize)]
struct GroupIndicatorRow {
    id: Option<String>,
    name: Option<Value>,
    factor: Option<Value>,
    unit: Option<Value>,
    is_weighted: Option<bool>,
}

#[derive(Deserialize)]
struct MetricCategoryLinkRow {
    metric_id: Option<String>,
    user_group_metric_categories: Option<Value>,
}

#[derive(Deserialize)]
struct UserIndicatorRow {
    user_id: Option<Value>,
    indicator_id: Option<Value>,
    value: Option<Value>,
}

#[derive(Deserialize)]
struct ManagerRow {
    user_id: Option<Value>,
}

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_indicators_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, group_id) = indicators_segments(request.path)?;
    Some(match request.method {
        "GET" => indicators_response(config, request, raw_ws_id, group_id, outbound).await,
        _ => return None,
    })
}

async fn indicators_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => return error_response(404, NOT_FOUND_ERROR),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    let ws_id = &authorization.ws_id;

    match group_exists_in_workspace(contact_data, outbound, ws_id, group_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "User group not found"),
        Err(()) => return message_response(500, FETCH_ERROR_MESSAGE),
    }

    let group_indicators = match fetch_group_indicators(contact_data, outbound, group_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FETCH_ERROR_MESSAGE),
    };

    let metric_ids: Vec<String> = group_indicators
        .iter()
        .filter_map(|r| r.id.clone())
        .collect();

    let category_links = if metric_ids.is_empty() {
        Vec::new()
    } else {
        match fetch_metric_category_links(contact_data, outbound, &metric_ids).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, "Error fetching indicator categories"),
        }
    };

    let categories_by_metric = build_categories_map(&category_links);

    let metric_categories = match fetch_all_metric_categories(contact_data, outbound, ws_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, "Error fetching metric categories"),
    };

    let user_indicators = match fetch_user_indicators(contact_data, outbound, group_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, "Error fetching user indicators"),
    };

    let managers = match fetch_managers(contact_data, outbound, group_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, "Error fetching group managers"),
    };

    let group_indicators_json: Vec<Value> = group_indicators
        .iter()
        .map(|row| {
            let id = row.id.as_deref().map(Value::from).unwrap_or(Value::Null);
            let categories = row
                .id
                .as_deref()
                .and_then(|id| categories_by_metric.get(id))
                .cloned()
                .unwrap_or_default();
            json!({
                "id": id,
                "name": row.name,
                "factor": row.factor,
                "unit": row.unit,
                "is_weighted": row.is_weighted,
                "categories": categories,
            })
        })
        .collect();

    let user_indicators_json: Vec<Value> = user_indicators
        .iter()
        .map(|row| json!({ "user_id": row.user_id, "indicator_id": row.indicator_id, "value": row.value }))
        .collect();

    let manager_ids: Vec<Value> = managers
        .iter()
        .map(|row| row.user_id.clone().unwrap_or(Value::Null))
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "groupIndicators": group_indicators_json,
            "metricCategories": metric_categories,
            "userIndicators": user_indicators_json,
            "managerUserIds": manager_ids,
        }),
    ))
}

async fn group_exists_in_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{group_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = get_service_role(contact_data, outbound, &url, false).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(!resp.json::<Vec<Value>>().map_err(|_| ())?.is_empty())
}

async fn fetch_group_indicators(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> Result<Vec<GroupIndicatorRow>, ()> {
    let url = contact_data
        .rest_url(
            "user_group_metrics",
            &[
                ("select", "id,name,factor,unit,is_weighted".to_owned()),
                ("group_id", format!("eq.{group_id}")),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = get_service_role(contact_data, outbound, &url, false).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<GroupIndicatorRow>>().map_err(|_| ())
}

async fn fetch_metric_category_links(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    metric_ids: &[String],
) -> Result<Vec<MetricCategoryLinkRow>, ()> {
    let id_list = metric_ids.join(",");
    let url = contact_data
        .rest_url(
            "user_group_metric_category_links",
            &[
                (
                    "select",
                    "metric_id,user_group_metric_categories(id,name,description)".to_owned(),
                ),
                ("metric_id", format!("in.({id_list})")),
            ],
        )
        .ok_or(())?;
    let resp = get_service_role(contact_data, outbound, &url, true).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<MetricCategoryLinkRow>>().map_err(|_| ())
}

async fn fetch_all_metric_categories(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "user_group_metric_categories",
            &[
                ("select", "id,name,description".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "name.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = get_service_role(contact_data, outbound, &url, true).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<Value>>().map_err(|_| ())
}

async fn fetch_user_indicators(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> Result<Vec<UserIndicatorRow>, ()> {
    let url = contact_data
        .rest_url(
            "user_indicators",
            &[
                (
                    "select",
                    "user_id,indicator_id,value,user_group_metrics!inner(group_id)".to_owned(),
                ),
                ("user_group_metrics.group_id", format!("eq.{group_id}")),
            ],
        )
        .ok_or(())?;
    let resp = get_service_role(contact_data, outbound, &url, false).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<UserIndicatorRow>>().map_err(|_| ())
}

async fn fetch_managers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> Result<Vec<ManagerRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups_users",
            &[
                ("select", "user_id".to_owned()),
                ("group_id", format!("eq.{group_id}")),
                ("role", "eq.TEACHER".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = get_service_role(contact_data, outbound, &url, false).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<ManagerRow>>().map_err(|_| ())
}

async fn get_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {key}");
    let req = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &bearer)
        .with_header("apikey", key);
    let req = if private_schema {
        req.with_header("Accept-Profile", PRIVATE_SCHEMA)
            .with_header("Content-Profile", PRIVATE_SCHEMA)
    } else {
        req
    };
    outbound.send(req).await.map_err(|_| ())
}

fn build_categories_map(links: &[MetricCategoryLinkRow]) -> HashMap<String, Vec<Value>> {
    let mut map: HashMap<String, Vec<Value>> = HashMap::new();
    for link in links {
        let Some(metric_id) = link.metric_id.as_deref() else {
            continue;
        };
        let cats: Vec<Value> = match &link.user_group_metric_categories {
            Some(Value::Array(arr)) => arr.clone(),
            Some(v) if !v.is_null() => vec![v.clone()],
            _ => Vec::new(),
        };
        if cats.is_empty() {
            continue;
        }
        map.entry(metric_id.to_owned()).or_default().extend(cats);
    }
    map
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_matches_exact() {
        assert_eq!(
            indicators_segments("/api/v1/workspaces/ws-uuid/user-groups/grp-uuid/indicators"),
            Some(("ws-uuid", "grp-uuid"))
        );
    }

    #[test]
    fn path_rejects_short_or_long_paths() {
        assert_eq!(
            indicators_segments("/api/v1/workspaces/ws/user-groups/grp"),
            None
        );
        assert_eq!(
            indicators_segments("/api/v1/workspaces/ws/user-groups/grp/indicators/extra"),
            None
        );
        assert_eq!(
            indicators_segments("/api/v1/workspaces/ws/user-groups/grp/managers"),
            None
        );
    }

    #[test]
    fn path_rejects_empty_dynamic_segments() {
        assert_eq!(
            indicators_segments("/api/v1/workspaces//user-groups/grp/indicators"),
            None
        );
        assert_eq!(
            indicators_segments("/api/v1/workspaces/ws/user-groups//indicators"),
            None
        );
    }

    #[test]
    fn path_accepts_personal_slug() {
        assert_eq!(
            indicators_segments("/api/v1/workspaces/personal/user-groups/grp/indicators"),
            Some(("personal", "grp"))
        );
    }

    #[test]
    fn categories_map_normalises_object_and_array() {
        let cat = json!({"id": "c1"});
        let links = vec![
            MetricCategoryLinkRow {
                metric_id: Some("m1".to_owned()),
                user_group_metric_categories: Some(cat.clone()),
            },
            MetricCategoryLinkRow {
                metric_id: Some("m2".to_owned()),
                user_group_metric_categories: Some(json!([cat.clone()])),
            },
            MetricCategoryLinkRow {
                metric_id: Some("m3".to_owned()),
                user_group_metric_categories: Some(Value::Null),
            },
        ];
        let map = build_categories_map(&links);
        assert_eq!(map.get("m1"), Some(&vec![cat.clone()]));
        assert_eq!(map.get("m2"), Some(&vec![cat]));
        assert!(!map.contains_key("m3"));
    }

    #[test]
    fn response_helpers_set_correct_keys() {
        let m = message_response(403, FORBIDDEN_MESSAGE);
        assert_eq!(m.status, 403);
        assert_eq!(m.body, json!({ "message": FORBIDDEN_MESSAGE }));

        let e = error_response(404, NOT_FOUND_ERROR);
        assert_eq!(e.status, 404);
        assert_eq!(e.body, json!({ "error": NOT_FOUND_ERROR }));
    }
}
