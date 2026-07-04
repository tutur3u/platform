use super::*;

// ---------------------------------------------------------------------------
// GET query model
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub(super) struct ListQuery {
    pub(super) scope: Scope,
    pub(super) user_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(clippy::enum_variant_names)]
pub(super) enum Scope {
    SelfScope,
    Team,
    Member,
}

impl Scope {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::SelfScope => "self",
            Self::Team => "team",
            Self::Member => "member",
        }
    }
}

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

pub(super) async fn handle_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Authenticate the caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, SIGN_IN_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, SIGN_IN_MESSAGE);
    };

    // 2. Parse the query string (scope / userId). Invalid input maps to the
    //    legacy zod-failure path: a 500 "Internal server error".
    let query = match parse_query(request.url) {
        Ok(query) => query,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    // 3. Normalize the workspace id.
    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    };

    // 4. Verify workspace membership (MEMBER required).
    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // 5. Require the habits feature flag.
    match habits_workspace_enabled(&config.contact_data, outbound, &resolved_ws_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(404, NOT_FOUND_MESSAGE),
        Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
    }

    // 6. Build the list response.
    match build_list_response(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &query,
    )
    .await
    {
        Ok(value) => no_store_response(json_response(200, value)),
        Err(()) => error_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

pub(super) fn parse_query(request_url: Option<&str>) -> Result<ListQuery, ()> {
    let mut scope = Scope::SelfScope;
    let mut user_id: Option<String> = None;

    if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "scope" => {
                    let value = value.trim();
                    if value.is_empty() {
                        continue;
                    }
                    scope = match value {
                        "self" => Scope::SelfScope,
                        "team" => Scope::Team,
                        "member" => Scope::Member,
                        // Invalid scope: legacy zod parse fails.
                        _ => return Err(()),
                    };
                }
                "userId" => {
                    let value = value.trim();
                    if value.is_empty() {
                        continue;
                    }
                    if !is_uuid_literal(value) {
                        // Invalid uuid: legacy zod parse fails.
                        return Err(());
                    }
                    user_id = Some(value.to_owned());
                }
                _ => {}
            }
        }
    }

    Ok(ListQuery { scope, user_id })
}

// ---------------------------------------------------------------------------
// Data fetching + response assembly
// ---------------------------------------------------------------------------

pub(super) async fn build_list_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    viewer_id: &str,
    query: &ListQuery,
) -> Result<Value, ()> {
    let trackers = list_habit_trackers(contact_data, outbound, ws_id).await?;
    let members = list_habit_tracker_members(contact_data, outbound, ws_id).await?;

    let scope_user_id = resolve_scope_user_id(&members, viewer_id, query);

    let tracker_ids: Vec<String> = trackers.iter().map(|tracker| tracker.id.clone()).collect();
    let entries = list_tracker_entries(contact_data, outbound, ws_id, &tracker_ids).await?;
    let actions = list_tracker_streak_actions(contact_data, outbound, ws_id, &tracker_ids).await?;
    let latest_stats = get_latest_tracker_stats(
        contact_data,
        outbound,
        ws_id,
        scope_user_id.as_deref(),
        &tracker_ids,
    )
    .await?;

    let trackers_json: Vec<Value> = trackers
        .iter()
        .map(|tracker| {
            let tracker_entries: Vec<&HabitEntry> = entries
                .iter()
                .filter(|entry| entry.tracker_id == tracker.id)
                .collect();
            let tracker_actions: Vec<&StreakAction> = actions
                .iter()
                .filter(|action| action.tracker_id == tracker.id)
                .collect();
            build_tracker_card_summary(
                tracker,
                &members,
                &tracker_entries,
                &tracker_actions,
                query.scope,
                scope_user_id.as_deref(),
                latest_stats.get(&tracker.id),
            )
        })
        .collect();

    let members_json: Vec<Value> = members.iter().map(member_json).collect();

    Ok(json!({
        "trackers": trackers_json,
        "members": members_json,
        "scope": query.scope.as_str(),
        "scopeUserId": scope_user_id,
        "viewerUserId": viewer_id,
    }))
}

pub(super) fn resolve_scope_user_id(
    members: &[Member],
    viewer_id: &str,
    query: &ListQuery,
) -> Option<String> {
    match query.scope {
        Scope::Team => None,
        Scope::Member => {
            if let Some(requested) = query.user_id.as_deref()
                && members.iter().any(|member| member.user_id == requested)
            {
                return Some(requested.to_owned());
            }
            Some(viewer_id.to_owned())
        }
        Scope::SelfScope => Some(viewer_id.to_owned()),
    }
}
