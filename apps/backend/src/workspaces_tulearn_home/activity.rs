use super::*;

// ---------------------------------------------------------------------------
// Assignments (port of activity.ts::getLearnerAssignments).
// Reads from the `private` PostgREST schema via Accept-Profile.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PostRow {
    id: Option<String>,
    title: Option<String>,
    content: Option<String>,
    created_at: Option<String>,
    group_id: Option<String>,
    workspace_user_groups: Option<Value>,
}

#[derive(Deserialize)]
struct PostCheckRow {
    post_id: Option<String>,
    is_completed: Option<bool>,
    approval_status: Option<String>,
}

pub(super) async fn get_learner_assignments(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Value, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if course_ids.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }
    let in_filter = in_list(&course_ids);

    // Posts (private schema).
    let Some(posts_url) = contact_data.rest_url(
        "user_group_posts",
        &[
            (
                "select",
                "id,title,content,created_at,group_id,workspace_user_groups!inner(id,name,ws_id)"
                    .to_owned(),
            ),
            ("group_id", format!("in.{in_filter}")),
            ("workspace_user_groups.ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "12".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let posts_resp = service_role_get(contact_data, outbound, &posts_url, Some("private")).await?;
    if !(200..300).contains(&posts_resp.status) {
        return Err(());
    }
    let posts: Vec<PostRow> = posts_resp.json().map_err(|_| ())?;

    // Post checks for this workspace user (private schema).
    let Some(checks_url) = contact_data.rest_url(
        "user_group_post_checks",
        &[
            ("select", "post_id,is_completed,approval_status".to_owned()),
            ("user_id", format!("eq.{student_workspace_user_id}")),
        ],
    ) else {
        return Err(());
    };
    let checks_resp =
        service_role_get(contact_data, outbound, &checks_url, Some("private")).await?;
    if !(200..300).contains(&checks_resp.status) {
        return Err(());
    }
    let checks: Vec<PostCheckRow> = checks_resp.json().map_err(|_| ())?;

    let mut checks_by_post: std::collections::HashMap<String, (bool, Option<String>)> =
        std::collections::HashMap::new();
    for check in checks {
        if let Some(post_id) = check.post_id {
            checks_by_post.insert(
                post_id,
                (check.is_completed.unwrap_or(false), check.approval_status),
            );
        }
    }

    let mut out = Vec::with_capacity(posts.len());
    for post in posts {
        let Some(id) = post.id else { continue };
        let course = first_object(post.workspace_user_groups.as_ref());
        let course_name = course
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str);
        let (is_completed, approval_status) =
            checks_by_post.get(&id).cloned().unwrap_or((false, None));

        out.push(json!({
            "id": id,
            "title": post.title,
            "content": post.content,
            "created_at": post.created_at,
            "course": {
                "id": post.group_id,
                "name": course_name,
            },
            "is_completed": is_completed,
            "approval_status": approval_status,
        }));
    }

    Ok(Value::Array(out))
}

// ---------------------------------------------------------------------------
// Marks (port of activity.ts::getLearnerMarks).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MarkRow {
    indicator_id: Option<String>,
    value: Option<f64>,
    created_at: Option<String>,
    user_group_metrics: Option<Value>,
}

pub(super) async fn get_learner_marks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Value, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if course_ids.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }
    let in_filter = in_list(&course_ids);

    let select = "indicator_id,value,created_at,user_group_metrics!inner(id,name,unit,group_id,ws_id,workspace_user_groups(id,name))";
    let Some(url) = contact_data.rest_url(
        "user_indicators",
        &[
            ("select", select.to_owned()),
            ("user_id", format!("eq.{student_workspace_user_id}")),
            ("user_group_metrics.ws_id", format!("eq.{ws_id}")),
            ("user_group_metrics.group_id", format!("in.{in_filter}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "24".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<MarkRow> = response.json().map_err(|_| ())?;

    let mut out = Vec::with_capacity(rows.len());
    for mark in rows {
        let metric = first_object(mark.user_group_metrics.as_ref());
        let metric_id = metric
            .and_then(|value| value.get("id"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .or_else(|| mark.indicator_id.clone());
        let metric_name = metric
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str);
        let metric_unit = metric
            .and_then(|value| value.get("unit"))
            .and_then(Value::as_str);

        let course = metric.and_then(|value| first_object(value.get("workspace_user_groups")));
        let course_json = course
            .map(|course| {
                json!({
                    "id": course.get("id").and_then(Value::as_str),
                    "name": course.get("name").and_then(Value::as_str),
                })
            })
            .unwrap_or(Value::Null);

        let indicator_id = mark.indicator_id.clone().unwrap_or_default();
        out.push(json!({
            "id": format!("{indicator_id}:{student_workspace_user_id}"),
            "value": mark.value,
            "created_at": mark.created_at,
            "metric": {
                "id": metric_id,
                "name": metric_name,
                "unit": metric_unit,
            },
            "course": course_json,
        }));
    }

    Ok(Value::Array(out))
}
