use super::*;

// ---------------------------------------------------------------------------
// Subject resolution (port of access.ts::resolveTulearnSubject).
// ---------------------------------------------------------------------------

pub(super) enum TulearnError {
    /// Maps to TulearnAccessError (403/404).
    Access { status: u16, message: &'static str },
    /// Any unexpected failure -> 500.
    Internal,
}

pub(super) struct TulearnSubject {
    pub(super) role: &'static str,
    pub(super) read_only: bool,
    pub(super) ws_id: String,
    pub(super) student_platform_user_id: String,
    pub(super) student_workspace_user_id: String,
    pub(super) student_name: Option<String>,
}

pub(super) async fn resolve_tulearn_subject(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
    student_id: Option<&str>,
) -> Result<TulearnSubject, TulearnError> {
    let ws_id = normalize_workspace_id(contact_data, outbound, raw_ws_id, user_id, access_token)
        .await
        .map_err(|()| TulearnError::Internal)?;

    if !has_education_enabled(contact_data, outbound, &ws_id)
        .await
        .map_err(|()| TulearnError::Internal)?
    {
        return Err(TulearnError::Access {
            status: 404,
            message: TULEARN_DISABLED_MESSAGE,
        });
    }

    let self_student = resolve_student_for_platform_user(contact_data, outbound, &ws_id, user_id)
        .await
        .map_err(|()| TulearnError::Internal)?;

    if student_id.is_none()
        && let Some(self_student) = self_student
    {
        return Ok(TulearnSubject {
            role: "student",
            read_only: false,
            ws_id,
            student_platform_user_id: user_id.to_owned(),
            student_workspace_user_id: self_student.workspace_user_id,
            student_name: self_student.name,
        });
    }

    // Parent link lookup.
    let link = parent_student_link(contact_data, outbound, &ws_id, user_id, student_id)
        .await
        .map_err(|()| TulearnError::Internal)?;
    let Some(link) = link else {
        return Err(TulearnError::Access {
            status: 403,
            message: NO_LEARNER_ACCESS_MESSAGE,
        });
    };

    let student_name = workspace_user_display_name(
        contact_data,
        outbound,
        &ws_id,
        &link.student_workspace_user_id,
    )
    .await
    .map_err(|()| TulearnError::Internal)?;

    Ok(TulearnSubject {
        role: "parent",
        read_only: true,
        ws_id,
        student_platform_user_id: link.student_platform_user_id,
        student_workspace_user_id: link.student_workspace_user_id,
        student_name,
    })
}

struct SelfStudent {
    workspace_user_id: String,
    name: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceUserRow {
    full_name: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
}

fn to_display_name(
    display_name: Option<&str>,
    full_name: Option<&str>,
    email: Option<&str>,
) -> Option<String> {
    // Mirrors helpers.ts::toDisplayName: display_name || full_name || email || null.
    [display_name, full_name, email]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

#[derive(Deserialize)]
struct LinkedUserRow {
    virtual_user_id: Option<String>,
    workspace_users: Option<Value>,
}

async fn resolve_student_for_platform_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    platform_user_id: &str,
) -> Result<Option<SelfStudent>, ()> {
    let Some(url) = contact_data.rest_url(
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
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<LinkedUserRow> = response.json().map_err(|_| ())?;
    let Some(row) = rows.into_iter().next() else {
        return Ok(None);
    };

    let Some(virtual_user_id) = row.virtual_user_id.filter(|id| !id.trim().is_empty()) else {
        return Ok(None);
    };
    // PostgREST may return an embedded one-to-one as object or single-element array.
    let workspace_user = first_object(row.workspace_users.as_ref());
    let Some(workspace_user) = workspace_user else {
        return Ok(None);
    };

    let name = to_display_name(
        workspace_user.get("display_name").and_then(Value::as_str),
        workspace_user.get("full_name").and_then(Value::as_str),
        workspace_user.get("email").and_then(Value::as_str),
    );

    Ok(Some(SelfStudent {
        workspace_user_id: virtual_user_id,
        name,
    }))
}

struct ParentLink {
    student_platform_user_id: String,
    student_workspace_user_id: String,
}

#[derive(Deserialize)]
struct ParentLinkRow {
    student_platform_user_id: Option<String>,
    student_workspace_user_id: Option<String>,
}

async fn parent_student_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    parent_user_id: &str,
    student_id: Option<&str>,
) -> Result<Option<ParentLink>, ()> {
    let mut params = vec![
        (
            "select",
            "student_platform_user_id,student_workspace_user_id".to_owned(),
        ),
        ("ws_id", format!("eq.{ws_id}")),
        ("parent_user_id", format!("eq.{parent_user_id}")),
        ("status", "eq.active".to_owned()),
    ];
    if let Some(student_id) = student_id {
        params.push(("student_workspace_user_id", format!("eq.{student_id}")));
    }
    params.push(("order", "created_at.asc".to_owned()));
    params.push(("limit", "1".to_owned()));

    let Some(url) = contact_data.rest_url("tulearn_parent_student_links", &params) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<ParentLinkRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().next().and_then(|row| {
        match (row.student_platform_user_id, row.student_workspace_user_id) {
            (Some(platform), Some(workspace)) => Some(ParentLink {
                student_platform_user_id: platform,
                student_workspace_user_id: workspace,
            }),
            _ => None,
        }
    }))
}

async fn workspace_user_display_name(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    workspace_user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_users",
        &[
            (
                "select",
                "id,full_name,display_name,email,avatar_url".to_owned(),
            ),
            ("id", format!("eq.{workspace_user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<WorkspaceUserRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().next().and_then(|row| {
        to_display_name(
            row.display_name.as_deref(),
            row.full_name.as_deref(),
            row.email.as_deref(),
        )
    }))
}

async fn has_education_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{ENABLE_EDUCATION_SECRET}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    #[derive(Deserialize)]
    struct SecretRow {
        value: Option<String>,
    }
    let rows: Vec<SecretRow> = response.json().map_err(|_| ())?;
    Ok(rows
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .map(|value| value.trim().to_lowercase() == "true")
        .unwrap_or(false))
}
