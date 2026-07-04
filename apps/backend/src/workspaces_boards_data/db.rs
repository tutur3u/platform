use super::*;

// ---------- Boards fetch ----------

#[allow(clippy::too_many_arguments)]
pub(super) async fn fetch_boards(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    q: Option<&str>,
    page: i64,
    page_size: i64,
    restrict_board_ids: Option<&[String]>,
) -> Result<(Vec<Map<String, Value>>, Option<i64>), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        // Legacy orders by name asc, then created_at desc.
        ("order", "name.asc,created_at.desc".to_owned()),
    ];

    if let Some(query) = q
        && !query.is_empty()
    {
        // PostgREST ilike wildcard is `*`; legacy uses `%${q}%`.
        params.push(("name", format!("ilike.*{}*", escape_like_value(query))));
    }

    if let Some(ids) = restrict_board_ids {
        let joined = ids.join(",");
        params.push(("id", format!("in.({joined})")));
    }

    let Some(url) = contact_data.rest_url("workspace_boards", &params) else {
        return Err(());
    };

    // Pagination range (range(start, end).limit(pageSize)); legacy: start = (page-1)*size.
    let start = (page - 1).max(0) * page_size;
    let end = start + page_size - 1;
    let range = format!("{start}-{end}");

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !is_success(response.status) {
        return Err(());
    }

    let count = total_count_from_content_range(&response);
    let boards = response.json::<Vec<Map<String, Value>>>().map_err(|_| ())?;

    Ok((boards, count))
}

pub(super) async fn fetch_task_lists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_ids: &[String],
) -> Result<Vec<TaskListRow>, ()> {
    if board_ids.is_empty() {
        return Ok(Vec::new());
    }

    let joined = board_ids.join(",");
    let Some(url) = contact_data.rest_url(
        "task_lists",
        &[
            (
                "select",
                "id,name,status,color,position,archived,board_id".to_owned(),
            ),
            ("board_id", format!("in.({joined})")),
            ("deleted", "eq.false".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<TaskListRow>>().map_err(|_| ())
}

pub(super) async fn fetch_tasks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    list_ids: &[String],
) -> Result<Vec<TaskRow>, ()> {
    if list_ids.is_empty() {
        return Ok(Vec::new());
    }

    let joined = list_ids.join(",");
    let Some(url) = contact_data.rest_url(
        "tasks",
        &[
            (
                "select",
                "id,name,description,closed_at,priority,start_date,end_date,created_at,list_id"
                    .to_owned(),
            ),
            ("list_id", format!("in.({joined})")),
            ("deleted_at", "is.null".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    response.json::<Vec<TaskRow>>().map_err(|_| ())
}
