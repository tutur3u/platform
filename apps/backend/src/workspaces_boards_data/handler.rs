use super::*;

pub(super) async fn boards_data_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // ----- Auth -----
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(auth_user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = auth_user
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let user_email = auth_user.email.clone();

    // ----- Query params (q, page, pageSize) -----
    let query = parse_query(request.url);

    // ----- Normalize workspace id (personal/internal/handle) -----
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // ----- Membership check (lookup failure -> 500) -----
    let membership = match verify_workspace_member(contact_data, outbound, &ws_id, &user_id).await {
        Ok(membership) => membership,
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    };

    // ----- Member permission gate -----
    if membership {
        match load_manage_projects_permission(contact_data, outbound, &ws_id, &user_id).await {
            // getPermissions returned null -> "Workspace not found" (404).
            Ok(None) => return error_response(404, WORKSPACE_NOT_FOUND_MESSAGE),
            // Has permissions object but lacks manage_projects -> 403.
            Ok(Some(false)) => return error_response(403, NO_PERMISSION_MESSAGE),
            Ok(Some(true)) => {}
            Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    }

    // ----- Guest share resolution (non-members only) -----
    let guest_shares: Vec<GuestShare> = if membership {
        Vec::new()
    } else {
        match load_guest_shares(
            contact_data,
            outbound,
            &ws_id,
            &user_id,
            user_email.as_deref(),
        )
        .await
        {
            Ok(shares) => shares,
            Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    };

    // Highest permission + de-duplicated board ids across all shares.
    let guest_board_ids: Vec<String> = {
        let mut set: BTreeSet<String> = BTreeSet::new();
        let mut ordered: Vec<String> = Vec::new();
        for share in &guest_shares {
            if set.insert(share.board_id.clone()) {
                ordered.push(share.board_id.clone());
            }
        }
        ordered
    };
    let guest_highest_permission = highest_permission(&guest_shares);
    // Per-board: highest permission for that board (default "view").
    let mut guest_board_permission: BTreeMap<String, String> = BTreeMap::new();
    for share in &guest_shares {
        let entry = guest_board_permission
            .entry(share.board_id.clone())
            .or_insert_with(|| share.permission.clone());
        if permission_rank(&share.permission) > permission_rank(entry) {
            *entry = share.permission.clone();
        }
    }

    if !membership && guest_board_ids.is_empty() {
        return error_response(403, NO_ACCESS_MESSAGE);
    }

    // ----- Fetch boards (paginated, with count) -----
    let restrict_board_ids: Option<&[String]> = if membership {
        None
    } else {
        Some(&guest_board_ids)
    };

    let (boards, count) = match fetch_boards(
        contact_data,
        outbound,
        &ws_id,
        query.q.as_deref(),
        query.page,
        query.page_size,
        restrict_board_ids,
    )
    .await
    {
        Ok(result) => result,
        Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    let access_type = if membership {
        ACCESS_TYPE_MEMBER
    } else {
        ACCESS_TYPE_GUEST
    };

    // Empty boards -> { data: [], count: 0 } (legacy returns count: 0 here).
    if boards.is_empty() {
        return no_store_response(json_response(200, json!({ "data": [], "count": 0 })));
    }

    // ----- Fetch task_lists + tasks -----
    let board_ids: Vec<String> = boards.iter().filter_map(board_id).collect();

    let task_lists = match fetch_task_lists(contact_data, outbound, &board_ids).await {
        Ok(lists) => lists,
        Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    let list_ids: Vec<String> = task_lists.iter().map(|list| list.id.clone()).collect();
    let tasks = match fetch_tasks(contact_data, outbound, &list_ids).await {
        Ok(tasks) => tasks,
        Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    // ----- Group data by board -----
    let data: Vec<Value> = boards
        .into_iter()
        .map(|mut board| {
            let this_board_id = board
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_default();

            // access_type
            board.insert(
                "access_type".to_owned(),
                Value::String(access_type.to_owned()),
            );

            // guest_permission
            let guest_permission = if membership {
                Value::Null
            } else {
                Value::String(
                    guest_board_permission
                        .get(&this_board_id)
                        .cloned()
                        .unwrap_or_else(|| "view".to_owned()),
                )
            };
            board.insert("guest_permission".to_owned(), guest_permission);

            // task_lists (with nested tasks)
            let lists_for_board: Vec<Value> = task_lists
                .iter()
                .filter(|list| list.board_id.as_deref() == Some(this_board_id.as_str()))
                .map(|list| {
                    let tasks_for_list: Vec<Value> = tasks
                        .iter()
                        .filter(|task| task.list_id.as_deref() == Some(list.id.as_str()))
                        .map(task_to_value)
                        .collect();
                    task_list_to_value(list, tasks_for_list)
                })
                .collect();
            board.insert("task_lists".to_owned(), Value::Array(lists_for_board));

            Value::Object(board)
        })
        .collect();

    let guest_highest = if membership {
        Value::Null
    } else {
        match guest_highest_permission {
            Some(permission) => Value::String(permission),
            None => Value::Null,
        }
    };

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "count": count,
            "access_type": access_type,
            "guest_highest_permission": guest_highest,
        }),
    ))
}
