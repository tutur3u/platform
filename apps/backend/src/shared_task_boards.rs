use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const SHARED_TASK_BOARDS_PATH_PREFIX: &str = "/api/v1/shared/task-boards/";
const PRIVATE_CACHE_CONTROL: &str = "private, no-store";
const PUBLIC_TASK_BOARD_TASK_LIMIT: usize = 1000;

const NOT_FOUND_MESSAGE: &str = "Public board not found";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

// ---------------------------------------------------------------------------
// Supabase row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PublicLinkRow {
    board_id: Option<String>,
}

#[derive(Deserialize)]
struct BoardRow {
    id: String,
    name: Option<String>,
    icon: Option<String>,
    ticket_prefix: Option<String>,
    created_at: Option<String>,
    archived_at: Option<String>,
    deleted_at: Option<String>,
}

#[derive(Deserialize)]
struct ListRow {
    id: String,
    name: Option<String>,
    status: Option<String>,
    color: Option<String>,
    position: Option<f64>,
    created_at: Option<String>,
    archived: Option<bool>,
    deleted: Option<bool>,
}

#[derive(Deserialize)]
struct TaskRow {
    id: String,
    list_id: Option<String>,
    name: Option<String>,
    display_number: Option<i64>,
    priority: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    created_at: Option<String>,
    completed_at: Option<String>,
    closed_at: Option<String>,
    estimation_points: Option<f64>,
    sort_key: Option<f64>,
}

#[derive(Clone, Deserialize, Serialize)]
struct Label {
    id: String,
    name: String,
    color: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct Project {
    id: String,
    name: String,
    status: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
struct Assignee {
    id: String,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
}

// PostgREST embedded relations may serialize as a single object or an array
// depending on the relationship cardinality, so accept either form.
#[derive(Deserialize)]
#[serde(untagged)]
enum Joined<T> {
    One(T),
    Many(Vec<T>),
}

impl<T> Joined<T> {
    fn into_first(self) -> Option<T> {
        match self {
            Joined::One(value) => Some(value),
            Joined::Many(values) => values.into_iter().next(),
        }
    }
}

#[derive(Deserialize)]
struct LabelJoinRow {
    task_id: Option<String>,
    workspace_task_labels: Option<Joined<Label>>,
}

#[derive(Deserialize)]
struct ProjectJoinRow {
    task_id: Option<String>,
    task_projects: Option<Joined<Project>>,
}

#[derive(Deserialize)]
struct AssigneeJoinRow {
    task_id: Option<String>,
    users: Option<Joined<Assignee>>,
}

// ---------------------------------------------------------------------------
// Response payload types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct PublicBoard {
    id: String,
    name: Option<String>,
    icon: Option<String>,
    ticket_prefix: Option<String>,
    created_at: Option<String>,
}

#[derive(Serialize)]
struct PublicList {
    id: String,
    name: Option<String>,
    status: Option<String>,
    color: Option<String>,
    position: Option<f64>,
    created_at: Option<String>,
}

#[derive(Serialize)]
struct PublicTask {
    id: String,
    list_id: String,
    name: Option<String>,
    display_number: Option<i64>,
    priority: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    created_at: Option<String>,
    completed_at: Option<String>,
    closed_at: Option<String>,
    estimation_points: Option<f64>,
    sort_key: Option<f64>,
    labels: Vec<Label>,
    projects: Vec<Project>,
    assignees: Vec<Assignee>,
}

#[derive(Serialize)]
struct PublicTaskBoardPayload {
    board: PublicBoard,
    #[serde(rename = "generatedAt")]
    generated_at: String,
    lists: Vec<PublicList>,
    tasks: Vec<PublicTask>,
    truncated: bool,
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

pub(crate) async fn handle_shared_task_boards_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let code = shared_task_boards_code(request.path)?;

    Some(match request.method {
        "GET" => shared_task_boards_response(config, code, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

fn shared_task_boards_code(path: &str) -> Option<&str> {
    let code = path.strip_prefix(SHARED_TASK_BOARDS_PATH_PREFIX)?;

    (!code.is_empty() && !code.contains('/')).then_some(code)
}

async fn shared_task_boards_response(
    config: &BackendConfig,
    raw_code: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let normalized_code = raw_code.trim().to_lowercase();
    if normalized_code.is_empty() {
        return error_response(404, NOT_FOUND_MESSAGE);
    }

    match load_public_task_board(&config.contact_data, outbound, &normalized_code).await {
        Ok(Some(payload)) => private_response(json_response(200, payload)),
        Ok(None) => error_response(404, NOT_FOUND_MESSAGE),
        Err(()) => error_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Data loading (mirrors loadPublicTaskBoard)
// ---------------------------------------------------------------------------

async fn load_public_task_board(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    code: &str,
) -> Result<Option<PublicTaskBoardPayload>, ()> {
    // 1. Resolve the board id from the public link.
    let Some(url) = contact_data.rest_url(
        "task_board_public_links",
        &[
            ("select", "board_id".to_owned()),
            ("code", format!("eq.{code}")),
            ("enabled", "eq.true".to_owned()),
            ("disabled_at", "is.null".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let board_id = response
        .json::<Vec<PublicLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.board_id);
    let Some(board_id) = board_id.filter(|id| !id.is_empty()) else {
        return Ok(None);
    };

    // 2. Fetch the board.
    let Some(url) = contact_data.rest_url(
        "workspace_boards",
        &[
            (
                "select",
                "id,name,icon,ticket_prefix,created_at,archived_at,deleted_at".to_owned(),
            ),
            ("id", format!("eq.{board_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let board = response
        .json::<Vec<BoardRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next();
    let Some(board) = board else {
        return Ok(None);
    };
    if board.deleted_at.is_some() || board.archived_at.is_some() {
        return Ok(None);
    }

    // 3. Fetch lists for the board.
    let Some(url) = contact_data.rest_url(
        "task_lists",
        &[
            (
                "select",
                "id,name,status,color,position,created_at,archived,deleted".to_owned(),
            ),
            ("board_id", format!("eq.{}", board.id)),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let lists = response.json::<Vec<ListRow>>().map_err(|_| ())?;

    let active_list_ids: Vec<String> = lists
        .iter()
        .filter(|list| !list.deleted.unwrap_or(false) && !list.archived.unwrap_or(false))
        .map(|list| list.id.clone())
        .collect();

    if active_list_ids.is_empty() {
        return Ok(Some(build_payload(board, lists, Vec::new(), false)));
    }

    // 4. Fetch tasks across active lists.
    let in_filter = format!("in.({})", active_list_ids.join(","));
    let limit = PUBLIC_TASK_BOARD_TASK_LIMIT + 1;
    let Some(url) = contact_data.rest_url(
        "tasks",
        &[
            (
                "select",
                "id,list_id,name,display_number,priority,start_date,end_date,created_at,completed_at,closed_at,estimation_points,sort_key"
                    .to_owned(),
            ),
            ("list_id", in_filter),
            ("deleted_at", "is.null".to_owned()),
            ("order", "sort_key.asc.nullslast,created_at.asc".to_owned()),
            ("limit", limit.to_string()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let mut fetched_tasks = response.json::<Vec<TaskRow>>().map_err(|_| ())?;

    let truncated = fetched_tasks.len() > PUBLIC_TASK_BOARD_TASK_LIMIT;
    fetched_tasks.truncate(PUBLIC_TASK_BOARD_TASK_LIMIT);

    let task_ids: Vec<String> = fetched_tasks.iter().map(|task| task.id.clone()).collect();
    if task_ids.is_empty() {
        return Ok(Some(build_payload(board, lists, Vec::new(), truncated)));
    }

    // 5. Fetch joined relations.
    let task_in_filter = format!("in.({})", task_ids.join(","));

    let labels = fetch_label_joins(contact_data, outbound, &task_in_filter).await?;
    let projects = fetch_project_joins(contact_data, outbound, &task_in_filter).await?;
    let assignees = fetch_assignee_joins(contact_data, outbound, &task_in_filter).await?;

    let tasks = build_tasks(fetched_tasks, &active_list_ids, labels, projects, assignees);

    Ok(Some(build_payload(board, lists, tasks, truncated)))
}

async fn fetch_label_joins(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_in_filter: &str,
) -> Result<Vec<LabelJoinRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_labels",
        &[
            (
                "select",
                "task_id,workspace_task_labels(id,name,color)".to_owned(),
            ),
            ("task_id", task_in_filter.to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<LabelJoinRow>>().map_err(|_| ())
}

async fn fetch_project_joins(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_in_filter: &str,
) -> Result<Vec<ProjectJoinRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_project_tasks",
        &[
            ("select", "task_id,task_projects(id,name,status)".to_owned()),
            ("task_id", task_in_filter.to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<ProjectJoinRow>>().map_err(|_| ())
}

async fn fetch_assignee_joins(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_in_filter: &str,
) -> Result<Vec<AssigneeJoinRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_assignees",
        &[
            (
                "select",
                "task_id,users(id,display_name,handle,avatar_url)".to_owned(),
            ),
            ("task_id", task_in_filter.to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<AssigneeJoinRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Payload building (mirrors buildPublicTaskBoardPayload)
// ---------------------------------------------------------------------------

fn build_payload(
    board: BoardRow,
    lists: Vec<ListRow>,
    tasks: Vec<PublicTask>,
    truncated: bool,
) -> PublicTaskBoardPayload {
    let mut public_lists: Vec<&ListRow> = lists
        .iter()
        .filter(|list| !list.deleted.unwrap_or(false) && !list.archived.unwrap_or(false))
        .collect();
    public_lists.sort_by(|a, b| {
        let position_a = a.position.unwrap_or(0.0);
        let position_b = b.position.unwrap_or(0.0);
        match position_a.partial_cmp(&position_b) {
            Some(std::cmp::Ordering::Equal) | None => created_at_sort_key(a.created_at.as_deref())
                .cmp(&created_at_sort_key(b.created_at.as_deref())),
            Some(ordering) => ordering,
        }
    });

    let lists = public_lists
        .into_iter()
        .map(|list| PublicList {
            id: list.id.clone(),
            name: list.name.clone(),
            status: list.status.clone(),
            color: list.color.clone(),
            position: list.position,
            created_at: list.created_at.clone(),
        })
        .collect();

    PublicTaskBoardPayload {
        board: PublicBoard {
            id: board.id,
            name: board.name,
            icon: board.icon,
            ticket_prefix: board.ticket_prefix,
            created_at: board.created_at,
        },
        generated_at: now_iso8601(),
        lists,
        tasks,
        truncated,
    }
}

fn build_tasks(
    task_rows: Vec<TaskRow>,
    active_list_ids: &[String],
    labels: Vec<LabelJoinRow>,
    projects: Vec<ProjectJoinRow>,
    assignees: Vec<AssigneeJoinRow>,
) -> Vec<PublicTask> {
    let mut labels_by_task: std::collections::HashMap<String, Vec<Label>> =
        std::collections::HashMap::new();
    for row in labels {
        if let (Some(task_id), Some(item)) = (
            row.task_id,
            row.workspace_task_labels.and_then(Joined::into_first),
        ) {
            labels_by_task.entry(task_id).or_default().push(item);
        }
    }

    let mut projects_by_task: std::collections::HashMap<String, Vec<Project>> =
        std::collections::HashMap::new();
    for row in projects {
        if let (Some(task_id), Some(item)) =
            (row.task_id, row.task_projects.and_then(Joined::into_first))
        {
            projects_by_task.entry(task_id).or_default().push(item);
        }
    }

    let mut assignees_by_task: std::collections::HashMap<String, Vec<Assignee>> =
        std::collections::HashMap::new();
    for row in assignees {
        if let (Some(task_id), Some(item)) = (row.task_id, row.users.and_then(Joined::into_first)) {
            assignees_by_task.entry(task_id).or_default().push(item);
        }
    }

    task_rows
        .into_iter()
        .filter(|task| {
            task.list_id
                .as_deref()
                .is_some_and(|list_id| active_list_ids.iter().any(|id| id == list_id))
        })
        .map(|task| {
            let task_labels = labels_by_task.get(&task.id).cloned().unwrap_or_default();
            let task_projects = projects_by_task.get(&task.id).cloned().unwrap_or_default();
            let task_assignees = assignees_by_task.get(&task.id).cloned().unwrap_or_default();
            PublicTask {
                list_id: task.list_id.clone().unwrap_or_default(),
                id: task.id,
                name: task.name,
                display_number: task.display_number,
                priority: task.priority,
                start_date: task.start_date,
                end_date: task.end_date,
                created_at: task.created_at,
                completed_at: task.completed_at,
                closed_at: task.closed_at,
                estimation_points: task.estimation_points,
                sort_key: task.sort_key,
                labels: task_labels,
                projects: task_projects,
                assignees: task_assignees,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn created_at_sort_key(created_at: Option<&str>) -> String {
    // Lexicographic comparison of ISO-8601 strings matches chronological order.
    // Missing timestamps sort first, matching `new Date(0)` in the legacy code.
    created_at.unwrap_or("").to_owned()
}

fn now_iso8601() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    let days = now / 86_400;
    let secs_of_day = now % 86_400;
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;

    let (year, month, day) = civil_from_days(days as i64);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

// Howard Hinnant's days-from-civil algorithm, inverted.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn private_response(mut response: BackendResponse) -> BackendResponse {
    response.cache_control = Some(PRIVATE_CACHE_CONTROL);
    response
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}
