use super::search::{SearchCandidate, search_intent};
use super::*;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

// ---------------------------------------------------------------------------
// Search params type
// ---------------------------------------------------------------------------

pub(super) struct WorkspaceSearchParams {
    pub(super) limit: Option<i64>,
    pub(super) query: Option<String>,
}

// ---------------------------------------------------------------------------
// Guest summary assembly
// ---------------------------------------------------------------------------

struct GuestAccumulator {
    summary: WorkspaceSummary,
    guest_board_ids: Vec<String>,
}

pub(super) fn build_guest_summaries(
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

pub(super) fn guest_share_workspace(share: &GuestShareRow) -> Option<&GuestWorkspaceRow> {
    match share.workspace_boards.as_ref()?.workspaces.as_ref()? {
        GuestWorkspaceField::Object(ws) => Some(ws.as_ref()),
        GuestWorkspaceField::Array(list) => list.first(),
    }
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

pub(super) fn normalize_workspace_tier(tier: Option<&str>) -> Option<String> {
    match tier {
        Some("FREE") | Some("PLUS") | Some("PRO") | Some("ENTERPRISE") => {
            tier.map(ToOwned::to_owned)
        }
        _ => None,
    }
}

pub(super) fn collect_subscription_product_ids(
    subscriptions: Option<&[WorkspaceSubscriptionRow]>,
    product_ids: &mut HashSet<String>,
) {
    for subscription in subscriptions.unwrap_or(&[]) {
        if let Some(product_id) = non_empty(subscription.product_id.as_deref()) {
            product_ids.insert(product_id);
        }
    }
}

pub(super) fn resolve_workspace_tier(
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
// Board-access helpers (ported)
// ---------------------------------------------------------------------------

pub(super) fn normalize_task_board_share_email(email: Option<&str>) -> Option<String> {
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

pub(super) fn parse_workspace_search_params(request_url: Option<&str>) -> WorkspaceSearchParams {
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

pub(super) fn apply_workspace_summary_search(
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
