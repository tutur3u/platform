use super::*;

// ─── Types ────────────────────────────────────────────────────────────────────

pub(super) struct TulearnSubject {
    pub(super) ws_id: String,
    pub(super) student_platform_user_id: String,
    pub(super) student_workspace_user_id: String,
}

pub(super) enum SubjectError {
    /// TulearnAccessError: 403 or 404 with `{ message }`.
    Access {
        status: u16,
        message: String,
    },
    Internal,
}

#[derive(Deserialize)]
pub(super) struct LinkedUserWorkspaceUser {
    id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct LinkedUserRow {
    virtual_user_id: Option<String>,
    workspace_users: Option<LinkedUserWorkspaceUser>,
}

pub(super) struct SelfStudent {
    pub(super) workspace_user_id: String,
}

#[derive(Deserialize)]
pub(super) struct ParentLinkRow {
    student_platform_user_id: Option<String>,
    student_workspace_user_id: Option<String>,
}

pub(super) enum GuestError {
    /// Throws a CourseRouteError with this code -> 500 `{ code, error }`.
    Code(&'static str),
}

#[derive(Deserialize)]
pub(super) struct WorkspaceIdRow {
    id: Option<String>,
}

// ─── Tulearn subject resolution (port of resolveTulearnSubject) ───────────────

pub(super) async fn resolve_tulearn_subject(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    student_id: Option<&str>,
    user_id: &str,
    access_token: &str,
) -> Result<TulearnSubject, SubjectError> {
    let normalized_ws_id =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, user_id, access_token)
            .await
            .map_err(|_| SubjectError::Internal)?;

    match education_enabled(contact_data, outbound, &normalized_ws_id).await {
        Ok(true) => {}
        Ok(false) => {
            return Err(SubjectError::Access {
                status: 404,
                message: "Tulearn is not enabled for this workspace".to_owned(),
            });
        }
        Err(()) => return Err(SubjectError::Internal),
    }

    let self_student =
        resolve_student_for_platform_user(contact_data, outbound, user_id, &normalized_ws_id)
            .await
            .map_err(|_| SubjectError::Internal)?;

    if student_id.is_none()
        && let Some(self_student) = &self_student
    {
        return Ok(TulearnSubject {
            ws_id: normalized_ws_id,
            student_platform_user_id: user_id.to_owned(),
            student_workspace_user_id: self_student.workspace_user_id.clone(),
        });
    }

    // Parent link lookup.
    let link = fetch_parent_student_link(
        contact_data,
        outbound,
        &normalized_ws_id,
        user_id,
        student_id,
    )
    .await
    .map_err(|_| SubjectError::Internal)?;

    let Some(link) = link else {
        return Err(SubjectError::Access {
            status: 403,
            message: "You don't have access to this learner".to_owned(),
        });
    };

    let (Some(student_platform_user_id), Some(student_workspace_user_id)) = (
        link.student_platform_user_id,
        link.student_workspace_user_id,
    ) else {
        return Err(SubjectError::Access {
            status: 403,
            message: "You don't have access to this learner".to_owned(),
        });
    };

    Ok(TulearnSubject {
        ws_id: normalized_ws_id,
        student_platform_user_id,
        student_workspace_user_id,
    })
}

pub(super) async fn fetch_parent_student_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    parent_user_id: &str,
    student_id: Option<&str>,
) -> Result<Option<ParentLinkRow>, ()> {
    let mut params = vec![
        (
            "select",
            "student_platform_user_id,student_workspace_user_id".to_owned(),
        ),
        ("ws_id", format!("eq.{ws_id}")),
        ("parent_user_id", format!("eq.{parent_user_id}")),
        ("status", "eq.active".to_owned()),
        ("order", "created_at.asc".to_owned()),
        ("limit", "1".to_owned()),
    ];
    if let Some(student_id) = student_id {
        params.push(("student_workspace_user_id", format!("eq.{student_id}")));
    }

    let url = contact_data
        .rest_url("tulearn_parent_student_links", &params)
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ParentLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

pub(super) async fn resolve_student_for_platform_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    platform_user_id: &str,
    ws_id: &str,
) -> Result<Option<SelfStudent>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_linked_users",
            &[
                (
                    "select",
                    "virtual_user_id,workspace_users!inner(id,full_name,display_name,email,avatar_url,ws_id)"
                        .to_owned(),
                ),
                ("platform_user_id", format!("eq.{platform_user_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let Some(row) = response
        .json::<Vec<LinkedUserRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
    else {
        return Ok(None);
    };

    let has_workspace_user = row
        .workspace_users
        .as_ref()
        .and_then(|wu| wu.id.as_ref())
        .is_some();

    match (row.virtual_user_id, has_workspace_user) {
        (Some(virtual_user_id), true) => Ok(Some(SelfStudent {
            workspace_user_id: virtual_user_id,
        })),
        _ => Ok(None),
    }
}

pub(super) async fn education_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    #[derive(Deserialize)]
    struct SecretRow {
        value: Option<String>,
    }

    Ok(response
        .json::<Vec<SecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("true")))
}

// ─── Guest course permission fallback (caller session / RLS) ─────────────────

pub(super) async fn guest_has_course_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    group_id: &str,
    access_token: &str,
) -> Result<bool, GuestError> {
    // 1) Lookup the workspace guest row for this user (caller session / RLS).
    let guest_url = contact_data
        .rest_url(
            "workspace_guests",
            &[
                ("select", "id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(GuestError::Code("workspace_guest_lookup_failed"))?;
    let response = send_caller_request(contact_data, outbound, &guest_url, access_token)
        .await
        .map_err(|_| GuestError::Code("workspace_guest_lookup_failed"))?;
    if !(200..300).contains(&response.status) {
        return Err(GuestError::Code("workspace_guest_lookup_failed"));
    }

    #[derive(Deserialize)]
    struct GuestRow {
        id: Option<String>,
    }

    let Some(guest_id) = response
        .json::<Vec<GuestRow>>()
        .map_err(|_| GuestError::Code("workspace_guest_lookup_failed"))?
        .into_iter()
        .next()
        .and_then(|row| row.id)
    else {
        return Ok(false);
    };

    // 2) Lookup matching guest permissions (caller session / RLS).
    // .or(`resource_id.is.null,resource_id.eq.${groupId}`)
    let or_filter = format!("(resource_id.is.null,resource_id.eq.{group_id})");
    let perm_url = contact_data
        .rest_url(
            "workspace_guest_permissions",
            &[
                ("select", "enable,resource_id".to_owned()),
                ("guest_id", format!("eq.{guest_id}")),
                ("permission", "eq.course:view".to_owned()),
                ("or", or_filter),
            ],
        )
        .ok_or(GuestError::Code("workspace_guest_permission_lookup_failed"))?;
    let response = send_caller_request(contact_data, outbound, &perm_url, access_token)
        .await
        .map_err(|_| GuestError::Code("workspace_guest_permission_lookup_failed"))?;
    if !(200..300).contains(&response.status) {
        return Err(GuestError::Code("workspace_guest_permission_lookup_failed"));
    }

    #[derive(Deserialize)]
    struct PermissionRow {
        enable: Option<bool>,
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| GuestError::Code("workspace_guest_permission_lookup_failed"))?
        .into_iter()
        .any(|row| row.enable.unwrap_or(false)))
}

// ─── Workspace id normalization (port of normalizeWorkspaceId) ───────────────

pub(super) async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let trimmed = raw_ws_id.trim();

    if trimmed.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if is_uuid_literal(trimmed) {
        return Ok(trimmed.to_owned());
    }

    // Treat as a workspace handle; resolve to its id. Falls back to the raw
    // identifier when no handle match is found.
    let handle = trimmed.to_lowercase();
    if let Some(workspace_id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
        return Ok(workspace_id);
    }

    Ok(trimmed.to_owned())
}

pub(super) async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                (
                    "select",
                    "id,workspace_members!inner(user_id,type)".to_owned(),
                ),
                ("personal", "eq.true".to_owned()),
                ("workspace_members.user_id", format!("eq.{user_id}")),
                ("workspace_members.type", "eq.MEMBER".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

pub(super) async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}
