use super::*;
use serde::de::DeserializeOwned;

const PAGE_SIZE: usize = 1000;
const MAX_PAGES: usize = 200;

#[derive(Default)]
pub(super) struct QueueContext {
    pub(super) current_keys: BTreeSet<String>,
    pub(super) tags: BTreeMap<String, Vec<String>>,
}

#[derive(Deserialize)]
struct MembershipRow {
    group_id: String,
    user_id: String,
}

#[derive(Deserialize)]
struct TagRow {
    group_id: String,
    tag: Option<TagName>,
}

#[derive(Deserialize)]
struct TagName {
    name: String,
}

async fn read_all<T: DeserializeOwned>(
    contact: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    mut params: Vec<(&str, String)>,
) -> Result<Vec<T>, ()> {
    params.push(("limit", PAGE_SIZE.to_string()));
    let mut rows = Vec::new();
    for page in 0..MAX_PAGES {
        let mut page_params = params.clone();
        page_params.push(("offset", (page * PAGE_SIZE).to_string()));
        let url = contact.rest_url(table, &page_params).ok_or(())?;
        let response = send_service_role_request(contact, outbound, &url, None).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        let batch: Vec<T> = response.json().map_err(|_| ())?;
        let done = batch.len() < PAGE_SIZE;
        rows.extend(batch);
        if done {
            return Ok(rows);
        }
    }
    Err(())
}

pub(super) async fn load_queue_context(
    contact: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &TutoringQueueQuery,
    policy: &QueuePolicy,
) -> Result<QueueContext, ()> {
    let mut params = vec![
        ("select", "group_id,user_id,group:workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(id,ws_id),user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id,archived)".to_owned()),
        ("group.ws_id", format!("eq.{ws_id}")),
        ("user.archived", "eq.false".to_owned()),
        ("or", "(role.is.null,role.neq.TEACHER)".to_owned()),
        ("order", "group_id.asc,user_id.asc".to_owned()),
    ];
    if let Some(group_id) = &query.group_id {
        params.push(("group_id", format!("eq.{group_id}")));
    }
    if let Some(user_id) = &query.student_user_id {
        params.push(("user_id", format!("eq.{user_id}")));
    }
    let members: Vec<MembershipRow> =
        read_all(contact, outbound, "workspace_user_groups_users", params).await?;
    let mut context = QueueContext {
        current_keys: members
            .into_iter()
            .map(|row| format!("{}:{}", row.group_id, row.user_id))
            .collect(),
        ..QueueContext::default()
    };
    if policy::has_tag_exclusions(policy) {
        let rows: Vec<TagRow> = read_all(contact, outbound, "workspace_user_group_tag_groups", vec![
            ("select", "group_id,tag_id,tag:workspace_user_group_tags!public_workspace_user_group_tag_groups_tag_id_fkey!inner(name,ws_id)".to_owned()),
            ("tag.ws_id", format!("eq.{ws_id}")),
            ("order", "group_id.asc,tag_id.asc".to_owned()),
        ]).await?;
        for row in rows {
            if let Some(tag) = row.tag.filter(|tag| !tag.name.is_empty()) {
                context.tags.entry(row.group_id).or_default().push(tag.name);
            }
        }
    }
    Ok(context)
}
