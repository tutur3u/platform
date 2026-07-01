use super::*;

pub(super) async fn build_announcements_payload(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ListQuery,
) -> Result<Value, ()> {
    // Optional contactId pre-filter: announcement ids the contact received.
    let contact_filter_ids = match &query.contact_id {
        Some(contact_id) => {
            Some(fetch_recipient_announcement_ids(contact_data, outbound, contact_id).await?)
        }
        None => None,
    };

    let (announcements, count) = fetch_announcements(
        contact_data,
        outbound,
        ws_id,
        query,
        contact_filter_ids.as_deref(),
    )
    .await?;

    let announcement_ids: Vec<String> = announcements
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    // Recipients (with embedded contacts) + attachments for the page.
    let (recipients_by_announcement, contacts_by_id) =
        fetch_recipients(contact_data, outbound, &announcement_ids).await?;
    let attachments_by_announcement =
        fetch_attachments(contact_data, outbound, &announcement_ids).await?;

    // Serialize contacts, attaching verification status.
    let unique_contact_ids: Vec<String> = contacts_by_id.keys().cloned().collect();
    let statuses =
        contact_verification_statuses(contact_data, outbound, &unique_contact_ids).await?;
    let mut serialized_by_id: BTreeMap<String, Value> = BTreeMap::new();
    for (id, raw_contact) in &contacts_by_id {
        let status = statuses
            .get(id)
            .map(String::as_str)
            .unwrap_or("needs_verification");
        serialized_by_id.insert(id.clone(), serialize_contact(raw_contact, status));
    }

    // Group lookup (PUBLIC schema), mirrors attachTopicAnnouncementGroups.
    let group_ids = distinct_group_ids(&announcements);
    let groups = fetch_groups(contact_data, outbound, &group_ids).await?;

    let data: Vec<Value> = announcements
        .into_iter()
        .map(|row| {
            let announcement_id = row
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_default();

            let attachments: Vec<Value> = attachments_by_announcement
                .get(&announcement_id)
                .map(|rows| rows.iter().map(serialize_attachment).collect())
                .unwrap_or_default();

            let contacts: Vec<Value> = recipients_by_announcement
                .get(&announcement_id)
                .map(|ids| {
                    ids.iter()
                        .filter_map(|id| serialized_by_id.get(id).cloned())
                        .collect()
                })
                .unwrap_or_default();

            let group = resolve_group(&row, &groups);

            map_announcement_row(row, attachments, contacts, group)
        })
        .collect();

    Ok(json!({
        "count": count,
        "data": data,
        "page": query.page,
        "pageSize": query.page_size,
        "totalPages": total_pages(count, query.page_size),
    }))
}

pub(super) async fn fetch_recipient_announcement_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    contact_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "topic_announcement_recipients",
        &[
            ("select", "announcement_id".to_owned()),
            ("contact_id", format!("eq.{contact_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RecipientIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.announcement_id)
        .collect())
}

pub(super) async fn fetch_announcements(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ListQuery,
    contact_filter_ids: Option<&[String]>,
) -> Result<(Vec<Map<String, Value>>, i64), ()> {
    let mut params: Vec<(&str, String)> =
        vec![("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))];
    if let Some(filter) = status_filter(&query.status) {
        params.push(filter);
    }
    if !query.q.is_empty() {
        let q = &query.q;
        params.push((
            "or",
            format!("(title.ilike.%{q}%,topic.ilike.%{q}%,class_label.ilike.%{q}%)"),
        ));
    }
    if let Some(ids) = contact_filter_ids {
        params.push(("id", format!("in.({})", ids.join(","))));
    }
    params.push(("order", "created_at.desc".to_owned()));
    params.push(("offset", query.offset().to_string()));
    params.push(("limit", query.page_size.to_string()));

    let Some(url) = contact_data.rest_url("topic_announcements", &params) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;
    if !is_success(response.status) {
        return Err(());
    }

    let count = parse_content_range_count(response.header("Content-Range")).unwrap_or(0);
    let rows: Vec<Value> = response.json().map_err(|_| ())?;
    let announcements = rows
        .into_iter()
        .filter_map(|value| match value {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .collect();

    Ok((announcements, count))
}

#[allow(clippy::type_complexity)]
pub(super) async fn fetch_recipients(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    announcement_ids: &[String],
) -> Result<
    (
        BTreeMap<String, Vec<String>>,
        BTreeMap<String, Map<String, Value>>,
    ),
    (),
> {
    if announcement_ids.is_empty() {
        return Ok((BTreeMap::new(), BTreeMap::new()));
    }

    let Some(url) = contact_data.rest_url(
        "topic_announcement_recipients",
        &[
            (
                "select",
                "announcement_id,contact:topic_announcement_contacts(*)".to_owned(),
            ),
            (
                "announcement_id",
                format!("in.({})", announcement_ids.join(",")),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows: Vec<Value> = response.json().map_err(|_| ())?;
    let mut by_announcement: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut contacts_by_id: BTreeMap<String, Map<String, Value>> = BTreeMap::new();

    for row in rows {
        let Some(announcement_id) = row.get("announcement_id").and_then(Value::as_str) else {
            continue;
        };
        let Some(Value::Object(contact)) = row.get("contact") else {
            continue;
        };
        let Some(contact_id) = contact.get("id").and_then(Value::as_str) else {
            continue;
        };

        by_announcement
            .entry(announcement_id.to_owned())
            .or_default()
            .push(contact_id.to_owned());
        contacts_by_id
            .entry(contact_id.to_owned())
            .or_insert_with(|| contact.clone());
    }

    Ok((by_announcement, contacts_by_id))
}

pub(super) async fn fetch_attachments(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    announcement_ids: &[String],
) -> Result<BTreeMap<String, Vec<Map<String, Value>>>, ()> {
    if announcement_ids.is_empty() {
        return Ok(BTreeMap::new());
    }

    let Some(url) = contact_data.rest_url(
        "topic_announcement_attachments",
        &[
            (
                "select",
                "id,content_type,created_at,file_name,size_bytes,storage_path,storage_provider,announcement_id"
                    .to_owned(),
            ),
            ("announcement_id", format!("in.({})", announcement_ids.join(","))),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows: Vec<Value> = response.json().map_err(|_| ())?;
    let mut by_announcement: BTreeMap<String, Vec<Map<String, Value>>> = BTreeMap::new();
    for row in rows {
        let Value::Object(map) = row else { continue };
        let Some(announcement_id) = map.get("announcement_id").and_then(Value::as_str) else {
            continue;
        };
        by_announcement
            .entry(announcement_id.to_owned())
            .or_default()
            .push(map);
    }

    Ok(by_announcement)
}

/// Mirrors `getContactVerificationStatuses`. Returns `contact_id -> status`.
pub(super) async fn contact_verification_statuses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    contact_ids: &[String],
) -> Result<BTreeMap<String, String>, ()> {
    let mut statuses: BTreeMap<String, String> = BTreeMap::new();
    for id in contact_ids {
        statuses.insert(id.clone(), "needs_verification".to_owned());
    }
    if contact_ids.is_empty() {
        return Ok(statuses);
    }

    let now = now_iso_timestamp();
    let Some(url) = contact_data.rest_url(
        "topic_announcement_contact_verifications",
        &[
            ("select", "contact_id,status,expires_at".to_owned()),
            ("contact_id", format!("in.({})", contact_ids.join(","))),
            ("status", "in.(pending,verified)".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    for row in response.json::<Vec<VerificationRow>>().map_err(|_| ())? {
        let Some(contact_id) = row.contact_id else {
            continue;
        };
        match row.status.as_deref() {
            Some("verified") => {
                statuses.insert(contact_id, "verified".to_owned());
            }
            Some("pending") => {
                let still_needs =
                    statuses.get(&contact_id).map(String::as_str) == Some("needs_verification");
                let not_expired = row
                    .expires_at
                    .as_deref()
                    .is_some_and(|expires_at| expires_at > now.as_str());
                if still_needs && not_expired {
                    statuses.insert(contact_id, "pending".to_owned());
                }
            }
            _ => {}
        }
    }

    // Per-contact RPC override -> linked_confirmed_account.
    for contact_id in contact_ids {
        if contact_has_linked_verified_email(contact_data, outbound, contact_id).await? {
            statuses.insert(contact_id.clone(), "linked_confirmed_account".to_owned());
        }
    }

    Ok(statuses)
}

pub(super) async fn contact_has_linked_verified_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    contact_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rpc_url(LINKED_VERIFIED_RPC) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({ "p_contact_id": contact_id }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(js_truthy(&response.json::<Value>().map_err(|_| ())?))
}

pub(super) async fn fetch_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_ids: &[String],
) -> Result<Vec<(String, String)>, ()> {
    if group_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_list = format!("({})", group_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name".to_owned()),
            ("id", format!("in.{in_list}")),
        ],
    ) else {
        return Err(());
    };
    // PUBLIC schema (legacy uses getPublicSchemaClient for the group lookup).
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceGroupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|group| match (group.id, group.name) {
            (Some(id), Some(name)) => Some((id, name)),
            _ => None,
        })
        .collect())
}
