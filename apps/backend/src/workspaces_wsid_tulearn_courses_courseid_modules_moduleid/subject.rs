use super::*;

// ---------------------------------------------------------------------------
// Subject resolution (mirrors resolveTulearnSubject from service.ts / access.ts)
// ---------------------------------------------------------------------------

pub(super) enum TulearnError {
    NotEnabled,
    Forbidden,
    Internal,
}

pub(super) struct TulearnSubject {
    pub(super) ws_id: String,
    pub(super) student_platform_user_id: String,
    pub(super) student_workspace_user_id: String,
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
        return Err(TulearnError::NotEnabled);
    }

    let student_id = student_id.filter(|id| !id.is_empty());

    // Self-student path (caller is themselves the learner).
    if student_id.is_none()
        && let Some(workspace_user_id) =
            resolve_self_student(contact_data, outbound, &ws_id, user_id)
                .await
                .map_err(|()| TulearnError::Internal)?
    {
        return Ok(TulearnSubject {
            ws_id,
            student_platform_user_id: user_id.to_owned(),
            student_workspace_user_id: workspace_user_id,
        });
    }

    // Parent link path.
    let link = parent_student_link(contact_data, outbound, &ws_id, user_id, student_id)
        .await
        .map_err(|()| TulearnError::Internal)?;

    let Some(link) = link else {
        return Err(TulearnError::Forbidden);
    };

    Ok(TulearnSubject {
        ws_id,
        student_platform_user_id: link.student_platform_user_id,
        student_workspace_user_id: link.student_workspace_user_id,
    })
}

#[derive(Deserialize)]
struct LinkedUserRow {
    virtual_user_id: Option<String>,
}

async fn resolve_self_student(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    platform_user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            (
                "select",
                "virtual_user_id,workspace_users!inner(id,ws_id)".to_owned(),
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
    Ok(rows
        .into_iter()
        .next()
        .and_then(|row| row.virtual_user_id)
        .filter(|id| !id.trim().is_empty()))
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
        .map(|v| v.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false))
}
