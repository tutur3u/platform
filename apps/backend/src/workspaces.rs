//! Port of `apps/web/src/app/api/v1/workspaces/route.ts`.
//!
//! `GET /api/v1/workspaces` returns the authenticated user's workspace
//! summaries (member workspaces + guest task-board workspaces), optionally
//! filtered/limited by the `q` and `limit` query parameters. This mirrors
//! `fetchWorkspaceSummaries` from `@tuturuuu/ui/lib/workspace-actions` and the
//! `searchIntent` fuzzy matcher from `@tuturuuu/utils/search`.
//!
//! Auth note: the legacy route runs the workspaces / task_board_shares reads
//! with the Supabase service-role (admin) client and the users /
//! user_private_details reads with the caller (RLS) client. Here we use the
//! service-role key for every read but constrain each query by the
//! authenticated user's id, so the result set is identical to the RLS-scoped
//! reads in the legacy implementation.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACES_PATH: &str = "/api/v1/workspaces";
const PRIVATE_SCHEMA: &str = "private";
const MAX_WORKSPACE_QUERY_LENGTH: usize = 120;
const MAX_WORKSPACE_SEARCH_LIMIT: i64 = 100;
const DEFAULT_WORKSPACE_SEARCH_LIMIT: usize = 50;
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

// ---------------------------------------------------------------------------
// Supabase row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SubscriptionProductInline {
    tier: Option<String>,
}

/// `workspace_subscription_products` can deserialize either as an object or an
/// array depending on the PostgREST embed cardinality.
#[derive(Deserialize)]
#[serde(untagged)]
enum SubscriptionProductInlineField {
    Object(SubscriptionProductInline),
    Array(Vec<SubscriptionProductInline>),
}

#[derive(Deserialize)]
struct WorkspaceSubscriptionRow {
    created_at: Option<String>,
    status: Option<String>,
    product_id: Option<String>,
    workspace_subscription_products: Option<SubscriptionProductInlineField>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    id: String,
    name: Option<String>,
    personal: Option<bool>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    creator_id: Option<String>,
    #[serde(default)]
    workspace_subscriptions: Option<Vec<WorkspaceSubscriptionRow>>,
}

#[derive(Deserialize)]
struct PublicProfileRow {
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct PrivateDetailsRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct ProductTierRow {
    id: Option<String>,
    tier: Option<String>,
}

#[derive(Deserialize)]
struct GuestWorkspaceRow {
    id: Option<String>,
    name: Option<String>,
    personal: Option<bool>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    creator_id: Option<String>,
    #[serde(default)]
    workspace_subscriptions: Option<Vec<WorkspaceSubscriptionRow>>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum GuestWorkspaceField {
    Object(Box<GuestWorkspaceRow>),
    Array(Vec<GuestWorkspaceRow>),
}

#[derive(Deserialize)]
struct GuestBoardRow {
    id: Option<String>,
    ws_id: Option<String>,
    workspaces: Option<GuestWorkspaceField>,
}

#[derive(Deserialize)]
struct GuestShareRow {
    board_id: Option<String>,
    permission: Option<String>,
    workspace_boards: Option<GuestBoardRow>,
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/// Matches `InternalApiWorkspaceSummary`. Optional fields are only serialized
/// when present, mirroring the legacy object literals (member summaries omit
/// the guest_* fields entirely).
#[derive(Clone, Serialize)]
struct WorkspaceSummary {
    id: String,
    name: Option<String>,
    personal: Option<bool>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    created_by_me: bool,
    tier: Option<String>,
    access_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    guest_products: Option<Vec<&'static str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    guest_board_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    guest_highest_permission: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    guest_landing_path: Option<String>,
}

// ---------------------------------------------------------------------------
// Route entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != WORKSPACES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => workspaces_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspaces_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let query = parse_workspace_search_params(request.url);

    match build_workspace_summaries(&config.contact_data, outbound, &user_id, &query).await {
        Ok(summaries) => no_store_response(json_response(200, summaries)),
        Err(()) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Core fetch + assembly (mirrors fetchWorkspaceSummaries)
// ---------------------------------------------------------------------------

async fn build_workspace_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    query: &WorkspaceSearchParams,
) -> Result<Vec<Value>, ()> {
    // 1. Member workspaces (admin client + workspace_members!inner filter).
    // On query error the legacy code returns [] (not an error).
    let workspaces = match fetch_member_workspaces(contact_data, outbound, user_id).await {
        Ok(workspaces) => workspaces,
        Err(()) => return Ok(Vec::new()),
    };

    // 2. Resolve display label / avatar for personal workspaces.
    let public_profile = fetch_public_profile(contact_data, outbound, user_id)
        .await
        .unwrap_or(None);
    let private_details = fetch_private_details(contact_data, outbound, user_id)
        .await
        .unwrap_or(None);

    let display_label: Option<String> = public_profile
        .as_ref()
        .and_then(|profile| non_empty(profile.display_name.as_deref()))
        .or_else(|| {
            public_profile
                .as_ref()
                .and_then(|profile| non_empty(profile.handle.as_deref()))
        })
        .or_else(|| {
            private_details
                .as_ref()
                .and_then(|details| non_empty(details.email.as_deref()))
        });

    let user_avatar_url: Option<String> = public_profile
        .as_ref()
        .and_then(|profile| non_empty(profile.avatar_url.as_deref()));

    let member_workspace_ids: HashSet<String> = workspaces.iter().map(|ws| ws.id.clone()).collect();

    // 3. Guest task-board shares (by user id + by normalized email).
    let mut guest_share_rows: Vec<GuestShareRow> = Vec::new();
    if let Ok(rows) = fetch_guest_shares_by_user(contact_data, outbound, user_id).await {
        guest_share_rows.extend(rows);
    }
    let normalized_email = private_details
        .as_ref()
        .and_then(|details| normalize_task_board_share_email(details.email.as_deref()));
    if let Some(ref email) = normalized_email
        && let Ok(rows) = fetch_guest_shares_by_email(contact_data, outbound, email).await
    {
        guest_share_rows.extend(rows);
    }

    // 4. Collect subscription product ids across member + guest workspaces.
    let mut product_ids: HashSet<String> = HashSet::new();
    for ws in &workspaces {
        collect_subscription_product_ids(ws.workspace_subscriptions.as_deref(), &mut product_ids);
    }
    for share in &guest_share_rows {
        if let Some(ws) = guest_share_workspace(share) {
            collect_subscription_product_ids(
                ws.workspace_subscriptions.as_deref(),
                &mut product_ids,
            );
        }
    }
    let product_tiers = fetch_subscription_product_tier_map(contact_data, outbound, &product_ids)
        .await
        .unwrap_or_default();

    // 5. Build guest workspace summaries.
    let guest_summaries = build_guest_summaries(
        &guest_share_rows,
        &member_workspace_ids,
        &product_tiers,
        display_label.as_deref(),
        user_avatar_url.as_deref(),
        user_id,
    );

    // 6. Build member summaries (personal name/avatar override).
    let member_summaries: Vec<WorkspaceSummary> = workspaces
        .iter()
        .map(|ws| {
            let is_personal = ws.personal.unwrap_or(false);
            let name = if is_personal {
                display_label
                    .clone()
                    .or_else(|| ws.name.clone())
                    .or_else(|| Some("Personal".to_owned()))
            } else {
                ws.name.clone()
            };
            let avatar_url = if is_personal {
                user_avatar_url.clone().or_else(|| ws.avatar_url.clone())
            } else {
                ws.avatar_url.clone()
            };
            WorkspaceSummary {
                id: ws.id.clone(),
                name,
                personal: ws.personal,
                avatar_url,
                logo_url: ws.logo_url.clone(),
                created_by_me: ws.creator_id.as_deref() == Some(user_id),
                tier: resolve_workspace_tier(ws.workspace_subscriptions.as_deref(), &product_tiers),
                access_type: "member",
                guest_products: None,
                guest_board_count: None,
                guest_highest_permission: None,
                guest_landing_path: None,
            }
        })
        .collect();

    let mut summaries: Vec<WorkspaceSummary> = member_summaries;
    summaries.extend(guest_summaries);

    Ok(apply_workspace_summary_search(summaries, query))
}

// ---------------------------------------------------------------------------
// Guest summary assembly
// ---------------------------------------------------------------------------

struct GuestAccumulator {
    summary: WorkspaceSummary,
    guest_board_ids: Vec<String>,
}

fn build_guest_summaries(
    guest_share_rows: &[GuestShareRow],
    member_workspace_ids: &HashSet<String>,
    product_tiers: &HashMap<String, Option<String>>,
    display_label: Option<&str>,
    user_avatar_url: Option<&str>,
    user_id: &str,
) -> Vec<WorkspaceSummary> {
    // Preserve first-seen workspace order (legacy uses a Map).
    let mut order: Vec<String> = Vec::new();
    let mut by_id: HashMap<String, GuestAccumulator> = HashMap::new();

    for share in guest_share_rows {
        let board = match &share.workspace_boards {
            Some(board) => board,
            None => continue,
        };
        let workspace = guest_share_workspace(share);

        let workspace_id = workspace
            .and_then(|ws| ws.id.clone())
            .or_else(|| board.ws_id.clone());
        let board_id = share.board_id.clone().or_else(|| board.id.clone());

        let (Some(workspace_id), Some(board_id), Some(permission)) =
            (workspace_id, board_id, share.permission.clone())
        else {
            continue;
        };

        if member_workspace_ids.contains(&workspace_id) {
            continue;
        }

        let entry = by_id.entry(workspace_id.clone());
        let accumulator = match entry {
            std::collections::hash_map::Entry::Occupied(occupied) => occupied.into_mut(),
            std::collections::hash_map::Entry::Vacant(vacant) => {
                order.push(workspace_id.clone());
                let is_personal = workspace.and_then(|ws| ws.personal).unwrap_or(false);
                let ws_name = workspace.and_then(|ws| ws.name.clone());
                let ws_avatar = workspace.and_then(|ws| ws.avatar_url.clone());
                let ws_logo = workspace.and_then(|ws| ws.logo_url.clone());
                let ws_creator = workspace.and_then(|ws| ws.creator_id.clone());
                let tier = resolve_workspace_tier(
                    workspace.and_then(|ws| ws.workspace_subscriptions.as_deref()),
                    product_tiers,
                );

                let name = if is_personal {
                    non_empty(display_label)
                        .or_else(|| ws_name.clone())
                        .or_else(|| Some("Personal".to_owned()))
                } else {
                    ws_name.clone().or_else(|| Some("Untitled".to_owned()))
                };
                let avatar_url = if is_personal {
                    non_empty(user_avatar_url).or_else(|| ws_avatar.clone())
                } else {
                    ws_avatar.clone()
                };

                vacant.insert(GuestAccumulator {
                    summary: WorkspaceSummary {
                        id: workspace_id.clone(),
                        name,
                        personal: Some(is_personal),
                        avatar_url,
                        logo_url: ws_logo,
                        created_by_me: ws_creator.as_deref() == Some(user_id),
                        tier,
                        access_type: "guest",
                        guest_products: Some(vec!["tasks"]),
                        guest_board_count: Some(0),
                        guest_highest_permission: None,
                        guest_landing_path: None,
                    },
                    guest_board_ids: Vec::new(),
                })
            }
        };

        if !accumulator.guest_board_ids.contains(&board_id) {
            accumulator.guest_board_ids.push(board_id);
        }

        let board_count = accumulator.guest_board_ids.len();
        accumulator.summary.guest_board_count = Some(board_count);
        accumulator.summary.guest_highest_permission = strongest_task_board_guest_permission(&[
            accumulator.summary.guest_highest_permission.clone(),
            Some(permission),
        ]);
        accumulator.summary.guest_landing_path = Some(if board_count == 1 {
            format!("/tasks/boards/{}", accumulator.guest_board_ids[0])
        } else {
            "/tasks/boards".to_owned()
        });
    }

    order
        .into_iter()
        .filter_map(|id| by_id.remove(&id).map(|acc| acc.summary))
        .collect()
}

fn guest_share_workspace(share: &GuestShareRow) -> Option<&GuestWorkspaceRow> {
    match share.workspace_boards.as_ref()?.workspaces.as_ref()? {
        GuestWorkspaceField::Object(ws) => Some(ws.as_ref()),
        GuestWorkspaceField::Array(list) => list.first(),
    }
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

fn normalize_workspace_tier(tier: Option<&str>) -> Option<String> {
    match tier {
        Some("FREE") | Some("PLUS") | Some("PRO") | Some("ENTERPRISE") => {
            tier.map(ToOwned::to_owned)
        }
        _ => None,
    }
}

fn collect_subscription_product_ids(
    subscriptions: Option<&[WorkspaceSubscriptionRow]>,
    product_ids: &mut HashSet<String>,
) {
    for subscription in subscriptions.unwrap_or(&[]) {
        if let Some(product_id) = non_empty(subscription.product_id.as_deref()) {
            product_ids.insert(product_id);
        }
    }
}

fn resolve_workspace_tier(
    subscriptions: Option<&[WorkspaceSubscriptionRow]>,
    product_tiers: &HashMap<String, Option<String>>,
) -> Option<String> {
    let mut active: Vec<&WorkspaceSubscriptionRow> = subscriptions
        .unwrap_or(&[])
        .iter()
        .filter(|subscription| subscription.status.as_deref() == Some("active"))
        .collect();
    // Sort by created_at descending (string ISO timestamps sort correctly;
    // missing timestamps sort last, matching `new Date(undefined ?? 0)`).
    active.sort_by(|a, b| {
        let a_key = a.created_at.as_deref().unwrap_or("");
        let b_key = b.created_at.as_deref().unwrap_or("");
        b_key.cmp(a_key)
    });

    for subscription in active {
        if let Some(product_id) = subscription.product_id.as_deref()
            && let Some(tier) = product_tiers.get(product_id)
            && tier.is_some()
        {
            return tier.clone();
        }

        match subscription.workspace_subscription_products.as_ref() {
            Some(SubscriptionProductInlineField::Object(product)) => {
                if let Some(tier) = product.tier.as_deref() {
                    return normalize_workspace_tier(Some(tier));
                }
            }
            Some(SubscriptionProductInlineField::Array(products)) => {
                if let Some(tier) = products
                    .iter()
                    .find_map(|entry| non_empty(entry.tier.as_deref()))
                {
                    return normalize_workspace_tier(Some(&tier));
                }
            }
            None => {}
        }
    }

    None
}

// ---------------------------------------------------------------------------
// board-access helpers (ported)
// ---------------------------------------------------------------------------

fn normalize_task_board_share_email(email: Option<&str>) -> Option<String> {
    let normalized = email?.trim().to_lowercase();
    non_empty(Some(&normalized))
}

fn strongest_task_board_guest_permission(permissions: &[Option<String>]) -> Option<String> {
    if permissions
        .iter()
        .any(|permission| permission.as_deref() == Some("edit"))
    {
        return Some("edit".to_owned());
    }
    if permissions
        .iter()
        .any(|permission| permission.as_deref() == Some("view"))
    {
        return Some("view".to_owned());
    }
    None
}

// ---------------------------------------------------------------------------
// Search params + search application
// ---------------------------------------------------------------------------

struct WorkspaceSearchParams {
    limit: Option<i64>,
    query: Option<String>,
}

fn parse_workspace_search_params(request_url: Option<&str>) -> WorkspaceSearchParams {
    let mut params = WorkspaceSearchParams {
        limit: None,
        query: None,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return params;
    };

    let mut saw_q = false;
    let mut saw_limit = false;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "q" if !saw_q => {
                saw_q = true;
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    // q.slice(0, MAX_WORKSPACE_QUERY_LENGTH) over chars.
                    params.query = Some(trimmed.chars().take(MAX_WORKSPACE_QUERY_LENGTH).collect());
                }
            }
            "limit" if !saw_limit => {
                saw_limit = true;
                // Number.parseInt(raw, 10) then clamp to [1, MAX].
                if let Some(parsed) = parse_int_prefix(value.as_ref()) {
                    let clamped = MAX_WORKSPACE_SEARCH_LIMIT.min(1.max(parsed));
                    params.limit = Some(clamped);
                }
            }
            _ => {}
        }
    }

    params
}

/// Emulates JavaScript `Number.parseInt(value, 10)`: parse leading optional
/// sign + digits, ignore trailing garbage. Returns None when there is no
/// leading integer (NaN).
fn parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.chars().peekable();
    let mut digits = String::new();

    if let Some(&sign) = chars.peek()
        && (sign == '+' || sign == '-')
    {
        digits.push(sign);
        chars.next();
    }

    while let Some(&character) = chars.peek() {
        if character.is_ascii_digit() {
            digits.push(character);
            chars.next();
        } else {
            break;
        }
    }

    if digits.is_empty() || digits == "+" || digits == "-" {
        return None;
    }

    digits.parse::<i64>().ok()
}

fn normalize_workspace_search_limit(limit: Option<i64>) -> Option<usize> {
    let limit = limit?;
    // Math.min(MAX, Math.max(1, Math.trunc(limit)))
    let clamped = MAX_WORKSPACE_SEARCH_LIMIT.min(1.max(limit));
    Some(clamped.max(0) as usize)
}

fn apply_workspace_summary_search(
    summaries: Vec<WorkspaceSummary>,
    params: &WorkspaceSearchParams,
) -> Vec<Value> {
    let normalized_limit = normalize_workspace_search_limit(params.limit);
    let trimmed_query = params.query.as_deref().map(str::trim).unwrap_or("");

    let selected: Vec<WorkspaceSummary> = if !trimmed_query.is_empty() {
        let candidates: Vec<SearchCandidate> = summaries
            .iter()
            .enumerate()
            .map(|(index, summary)| workspace_summary_search_candidate(summary, index))
            .collect();
        let limit = normalized_limit.unwrap_or(DEFAULT_WORKSPACE_SEARCH_LIMIT);
        let matched = search_intent(&candidates, trimmed_query, limit);
        matched
            .into_iter()
            .map(|index| summaries[index].clone())
            .collect()
    } else if let Some(limit) = normalized_limit {
        summaries.into_iter().take(limit).collect()
    } else {
        summaries
    };

    selected
        .iter()
        .map(|summary| serde_json::to_value(summary).unwrap_or(Value::Null))
        .collect()
}

// ---------------------------------------------------------------------------
// searchIntent port
// ---------------------------------------------------------------------------

/// A search candidate carrying the summary index it maps back to. `texts` are
/// the deduplicated trimmed strings searched (title, subtitle, aliases,
/// keywords).
struct SearchCandidate {
    index: usize,
    texts: Vec<String>,
}

fn workspace_summary_search_candidate(summary: &WorkspaceSummary, index: usize) -> SearchCandidate {
    let access_type = summary.access_type;
    let title = summary
        .name
        .clone()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| summary.id.clone());
    let subtitle = summary.id.clone();

    let aliases = [
        summary.id.clone(),
        if summary.personal.unwrap_or(false) {
            "personal".to_owned()
        } else {
            String::new()
        },
        if access_type == "guest" {
            "guest".to_owned()
        } else {
            String::new()
        },
        summary.guest_landing_path.clone().unwrap_or_default(),
    ];
    let keywords = [
        if summary.personal.unwrap_or(false) {
            "personal".to_owned()
        } else {
            String::new()
        },
        if access_type == "guest" {
            "guest".to_owned()
        } else {
            String::new()
        },
        if summary.created_by_me {
            "created by me".to_owned()
        } else {
            String::new()
        },
    ];

    // getCandidateTexts: [title, subtitle, ...aliases, ...keywords], trim,
    // filter empty, dedupe preserving order.
    let mut texts: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let push = |value: &str, texts: &mut Vec<String>, seen: &mut HashSet<String>| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return;
        }
        if seen.insert(trimmed.to_owned()) {
            texts.push(trimmed.to_owned());
        }
    };
    push(&title, &mut texts, &mut seen);
    push(&subtitle, &mut texts, &mut seen);
    for alias in &aliases {
        push(alias, &mut texts, &mut seen);
    }
    for keyword in &keywords {
        push(keyword, &mut texts, &mut seen);
    }

    SearchCandidate { index, texts }
}

struct NormalizedText {
    compact: String,
    original: String,
    text: String,
    words: Vec<String>,
}

fn normalize_intent_text(value: &str) -> String {
    // JS: NFD normalize -> strip combining marks (̀-ͯ) -> lowercase
    // -> đ->d -> replace [^a-z0-9]+ with a single space -> trim/collapse.
    //
    // Rust std has no NFD normalizer and we must not add a dependency, so any
    // non-ASCII character (including precomposed accented Latin and Vietnamese
    // letters) collapses to a space here instead of decomposing to its base
    // letter. For ASCII inputs (the common case for workspace ids/names) this
    // matches JS exactly. See the structured-output notes for the divergence.
    let lowered = value.to_lowercase().replace('đ', "d");

    let mut out = String::new();
    let mut prev_space = false;
    for ch in lowered.chars() {
        if ch.is_ascii_lowercase() || ch.is_ascii_digit() {
            out.push(ch);
            prev_space = false;
        } else if !prev_space {
            out.push(' ');
            prev_space = true;
        }
    }

    out.trim().to_owned()
}

fn normalize(value: &str) -> NormalizedText {
    let text = normalize_intent_text(value);
    let words: Vec<String> = if text.is_empty() {
        Vec::new()
    } else {
        text.split(' ').map(ToOwned::to_owned).collect()
    };
    let compact = words.join("");

    NormalizedText {
        compact,
        original: value.to_owned(),
        text,
        words,
    }
}

fn get_intent_acronym(value: &str) -> String {
    normalize_intent_text(value)
        .split(' ')
        .filter(|word| !word.is_empty())
        .filter_map(|word| word.chars().next())
        .collect()
}

fn has_ordered_characters(text: &str, query: &str) -> bool {
    let query_chars: Vec<char> = query.chars().collect();
    let mut query_index = 0;
    for ch in text.chars() {
        if query_index >= query_chars.len() {
            break;
        }
        if ch == query_chars[query_index] {
            query_index += 1;
        }
    }
    query_index == query_chars.len()
}

fn ordered_character_score(text: &str, query: &str) -> i64 {
    let text_chars: Vec<char> = text.chars().collect();
    let query_chars: Vec<char> = query.chars().collect();
    let mut query_index = 0usize;
    let mut first_match: i64 = -1;
    let mut last_match: i64 = -1;
    let mut streak = 0i64;
    let mut longest_streak = 0i64;

    for (i, &ch) in text_chars.iter().enumerate() {
        if query_index >= query_chars.len() {
            break;
        }
        if ch == query_chars[query_index] {
            if first_match == -1 {
                first_match = i as i64;
            }
            last_match = i as i64;
            query_index += 1;
            streak += 1;
            longest_streak = longest_streak.max(streak);
        } else {
            streak = 0;
        }
    }

    if query_index != query_chars.len() || first_match == -1 || last_match == -1 {
        return 0;
    }

    let span = (last_match - first_match + 1).max(1);
    let density = query_chars.len() as f64 / span as f64;
    let prefix_bonus = if first_match == 0 {
        28
    } else {
        (18 - first_match).max(0)
    };
    let streak_bonus = (longest_streak * 8).min(40);

    (320.0 + density * 110.0 + prefix_bonus as f64 + streak_bonus as f64).round() as i64
}

fn bounded_levenshtein(a: &str, b: &str, max_distance: i64) -> i64 {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len() as i64;
    let b_len = b_chars.len() as i64;

    if (a_len - b_len).abs() > max_distance {
        return max_distance + 1;
    }
    if a_chars == b_chars {
        return 0;
    }
    if a_chars.is_empty() {
        return b_len;
    }
    if b_chars.is_empty() {
        return a_len;
    }

    let mut previous: Vec<i64> = (0..=b_chars.len() as i64).collect();
    let mut current: Vec<i64> = vec![0; b_chars.len() + 1];

    for i in 1..=a_chars.len() {
        current[0] = i as i64;
        let mut row_min = current[0];
        for j in 1..=b_chars.len() {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            let deletion = previous[j] + 1;
            let insertion = current[j - 1] + 1;
            let substitution = previous[j - 1] + cost;
            current[j] = deletion.min(insertion).min(substitution);
            row_min = row_min.min(current[j]);
        }
        if row_min > max_distance {
            return max_distance + 1;
        }
        std::mem::swap(&mut previous, &mut current);
    }

    previous[b_chars.len()]
}

fn get_typo_limit(query_length: usize) -> i64 {
    if query_length < 4 {
        0
    } else if query_length < 8 {
        1
    } else {
        2
    }
}

const SHORT_QUERY_MAX_LENGTH: usize = 2;
const TYPO_DISTANCE_MAX_LENGTH: usize = 32;

fn score_text(text: &str, query: &NormalizedText) -> Option<i64> {
    let target = normalize(text);

    if query.text.is_empty() || query.compact.is_empty() || target.text.is_empty() {
        return None;
    }

    let is_short_query = query.compact.chars().count() <= SHORT_QUERY_MAX_LENGTH;
    let acronym = get_intent_acronym(&target.original);

    if target.text == query.text {
        return Some(10_000);
    }
    if target.compact == query.compact {
        return Some(9_700);
    }
    if target.text.starts_with(&query.text) {
        let diff = (target.text.chars().count() as i64 - query.text.chars().count() as i64).max(0);
        return Some(9_200 - diff.min(300));
    }
    if target.compact.starts_with(&query.compact) {
        let diff =
            (target.compact.chars().count() as i64 - query.compact.chars().count() as i64).max(0);
        return Some(8_900 - diff.min(300));
    }
    if acronym.starts_with(&query.compact) && !query.compact.is_empty() {
        let diff = (acronym.chars().count() as i64 - query.compact.chars().count() as i64).max(0);
        return Some(8_300 - diff.min(200));
    }

    if is_short_query {
        return None;
    }

    if target.text.contains(&query.text) || target.compact.contains(&query.compact) {
        let compact_index = char_index_of(&target.compact, &query.compact);
        let word_start = target
            .words
            .iter()
            .any(|word| word.starts_with(&query.text));
        let base = if word_start { 7_400 } else { 6_400 };
        return Some(base - compact_index.max(0));
    }

    if query.words.len() > 1
        && query.words.iter().all(|word| {
            target
                .words
                .iter()
                .any(|target_word| target_word.starts_with(word))
        })
    {
        return Some(7_700 - (target.words.len() as i64 * 20).min(500));
    }

    if has_ordered_characters(&target.compact, &query.compact) {
        return Some(ordered_character_score(&target.compact, &query.compact));
    }

    let typo_limit = get_typo_limit(query.compact.chars().count());
    if typo_limit > 0
        && target.compact.chars().count() <= TYPO_DISTANCE_MAX_LENGTH
        && query.compact.chars().count() <= TYPO_DISTANCE_MAX_LENGTH
    {
        let mut candidates: Vec<&str> = vec![target.compact.as_str()];
        candidates.extend(target.words.iter().map(String::as_str));
        let mut best_distance = typo_limit + 1;
        for candidate in candidates {
            if (candidate.chars().count() as i64 - query.compact.chars().count() as i64).abs()
                > typo_limit
            {
                continue;
            }
            best_distance =
                best_distance.min(bounded_levenshtein(candidate, &query.compact, typo_limit));
        }
        if best_distance <= typo_limit {
            return Some(6_900 - best_distance * 350);
        }
    }

    None
}

/// Returns the char index of `needle` in `haystack`, or -1 (mirrors JS
/// `String.indexOf`).
fn char_index_of(haystack: &str, needle: &str) -> i64 {
    if needle.is_empty() {
        return 0;
    }
    match haystack.find(needle) {
        Some(byte_index) => haystack[..byte_index].chars().count() as i64,
        None => -1,
    }
}

fn score_intent_candidate(candidate: &SearchCandidate, query: &NormalizedText) -> Option<i64> {
    if query.text.is_empty() {
        return Some(0);
    }
    let mut best: Option<i64> = None;
    for text in &candidate.texts {
        if let Some(score) = score_text(text, query)
            && best.is_none_or(|current| score > current)
        {
            best = Some(score);
        }
    }
    best
}

/// Runs the searchIntent ranking and returns the matching summary indices in
/// ranked order, capped at `limit`. `min_score` is 1 (the default).
fn search_intent(candidates: &[SearchCandidate], query: &str, limit: usize) -> Vec<usize> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return candidates
            .iter()
            .take(limit)
            .map(|candidate| candidate.index)
            .collect();
    }

    let normalized_query = normalize(trimmed);
    let mut scored: Vec<(i64, usize, usize)> = Vec::new();
    for (position, candidate) in candidates.iter().enumerate() {
        if let Some(score) = score_intent_candidate(candidate, &normalized_query)
            && score >= 1
        {
            scored.push((score, position, candidate.index));
        }
    }

    // sort by score desc, then by original position asc.
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));

    scored
        .into_iter()
        .take(limit)
        .map(|(_, _, index)| index)
        .collect()
}

// ---------------------------------------------------------------------------
// Supabase reads (service role)
// ---------------------------------------------------------------------------

async fn fetch_member_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id, name, personal, avatar_url, logo_url, created_at, creator_id, \
                 workspace_members!inner(user_id), \
                 workspace_subscriptions!left(created_at, status, product_id)"
                    .to_owned(),
            ),
            ("workspace_members.user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<WorkspaceRow>>().map_err(|_| ())
}

async fn fetch_public_profile(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<PublicProfileRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "users",
        &[
            ("select", "display_name, handle, avatar_url".to_owned()),
            ("id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<PublicProfileRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_private_details(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<PrivateDetailsRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "user_private_details",
        &[
            ("select", "email".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<PrivateDetailsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

const GUEST_SHARE_SELECT: &str = "board_id, permission, \
     workspace_boards!inner(id, ws_id, deleted_at, \
     workspaces!inner(id, name, personal, avatar_url, logo_url, creator_id, \
     workspace_subscriptions!left(created_at, status, product_id)))";

async fn fetch_guest_shares_by_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<GuestShareRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            ("select", GUEST_SHARE_SELECT.to_owned()),
            ("shared_with_user_id", format!("eq.{user_id}")),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<GuestShareRow>>().map_err(|_| ())
}

async fn fetch_guest_shares_by_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    email: &str,
) -> Result<Vec<GuestShareRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            ("select", GUEST_SHARE_SELECT.to_owned()),
            ("shared_with_email", format!("eq.{email}")),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<GuestShareRow>>().map_err(|_| ())
}

async fn fetch_subscription_product_tier_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_ids: &HashSet<String>,
) -> Result<HashMap<String, Option<String>>, ()> {
    let mut map: HashMap<String, Option<String>> = HashMap::new();
    if product_ids.is_empty() {
        return Ok(map);
    }

    let in_list = product_ids.iter().cloned().collect::<Vec<_>>().join(",");
    let Some(url) = contact_data.rest_url(
        "workspace_subscription_products",
        &[
            ("select", "id, tier".to_owned()),
            ("id", format!("in.({in_list})")),
        ],
    ) else {
        return Err(());
    };
    // workspace_subscription_products lives in the `private` schema.
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Ok(map);
    }

    for product in response.json::<Vec<ProductTierRow>>().map_err(|_| ())? {
        if let Some(id) = product.id {
            map.insert(id, normalize_workspace_tier(product.tier.as_deref()));
        }
    }

    Ok(map)
}

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
