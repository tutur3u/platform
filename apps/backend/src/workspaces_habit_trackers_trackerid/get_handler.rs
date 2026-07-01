use super::*;

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(clippy::enum_variant_names)]
pub(super) enum Scope {
    SelfScope,
    Team,
    Member,
}

pub(super) struct DetailQuery {
    pub(super) scope: Scope,
    pub(super) user_id: Option<String>,
}

pub(super) async fn get_detail_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    tracker_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<BackendResponse, HabitError> {
    // assertValidTrackerId(trackerId) runs before auth in the legacy route.
    if !is_uuid(tracker_id) {
        return Err(HabitError::new(400, MSG_INVALID_TRACKER_ID));
    }

    let contact_data = &config.contact_data;

    // 1. Authenticate the caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(HabitError::new(401, MSG_UNAUTHORIZED));
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return Err(HabitError::new(401, MSG_UNAUTHORIZED));
    };

    // 2. Parse the query string (scope / userId). Invalid input maps to the
    //    legacy zod-failure path: a 500 "Internal server error".
    let query = parse_query(request.url).map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;

    // 3. normalizeWorkspaceId(wsId, supabase)
    let resolved_ws_id =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
            .map_err(|()| HabitError::new(500, MSG_MEMBERSHIP_LOOKUP_FAILED))?;

    // 4. verifyWorkspaceMembership -> requires MEMBER, else 403 / 500.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return Err(HabitError::new(403, MSG_ACCESS_DENIED)),
        Err(()) => return Err(HabitError::new(500, MSG_MEMBERSHIP_LOOKUP_FAILED)),
    }

    // 5. isHabitsEnabled -> 404 "Not found" when disabled.
    if !habits_workspace_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false)
    {
        return Err(HabitError::new(404, MSG_NOT_FOUND));
    }

    // 6. Build the detail response.
    build_detail_response(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        tracker_id,
        &query,
    )
    .await
    .map(|value| no_store_response(json_response(200, value)))
}

pub(super) fn parse_query(request_url: Option<&str>) -> Result<DetailQuery, ()> {
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
                    if !is_uuid(value) {
                        // Invalid uuid: legacy zod parse fails.
                        return Err(());
                    }
                    user_id = Some(value.to_owned());
                }
                _ => {}
            }
        }
    }

    Ok(DetailQuery { scope, user_id })
}
