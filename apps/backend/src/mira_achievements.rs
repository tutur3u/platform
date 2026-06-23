use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MIRA_ACHIEVEMENTS_PATH: &str = "/api/v1/mira/achievements";
const PRIVATE_SCHEMA: &str = "private";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const ACHIEVEMENTS_ERROR_MESSAGE: &str = "Failed to get achievements";

#[derive(Deserialize)]
struct UserAchievementRow {
    achievement_id: Option<String>,
    unlocked_at: Option<Value>,
}

pub(crate) async fn handle_mira_achievements_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != MIRA_ACHIEVEMENTS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => mira_achievements_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn mira_achievements_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Get all achievements from the private schema (service role / admin client).
    let achievements = match fetch_achievements(&config.contact_data, outbound).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, ACHIEVEMENTS_ERROR_MESSAGE),
    };

    // Get the user's unlocked achievements (public schema, RLS via caller token).
    // The legacy route logs but does not fail when this read errors; it falls
    // back to an empty list.
    let user_achievements =
        fetch_user_achievements(&config.contact_data, outbound, &user_id, &access_token)
            .await
            .unwrap_or_default();

    no_store_response(json_response(
        200,
        build_achievements_payload(achievements, user_achievements),
    ))
}

fn build_achievements_payload(
    achievements: Vec<Value>,
    user_achievements: Vec<UserAchievementRow>,
) -> Value {
    // Map of achievement_id -> unlocked_at (preserving JS Map semantics).
    let unlocked: Vec<(String, Value)> = user_achievements
        .iter()
        .filter_map(|ua| {
            ua.achievement_id
                .as_ref()
                .map(|id| (id.clone(), ua.unlocked_at.clone().unwrap_or(Value::Null)))
        })
        .collect();

    let unlocked_at_for = |id: &str| -> Option<Value> {
        unlocked
            .iter()
            .find(|(aid, _)| aid == id)
            .map(|(_, value)| value.clone())
    };
    let is_unlocked = |id: &str| -> bool { unlocked.iter().any(|(aid, _)| aid == id) };

    // Merge achievements with unlock status.
    let mut achievements_with_status: Vec<Value> = Vec::with_capacity(achievements.len());
    for achievement in &achievements {
        let mut object = match achievement {
            Value::Object(map) => map.clone(),
            _ => Map::new(),
        };

        let id = object
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();

        object.insert("is_unlocked".to_owned(), Value::Bool(is_unlocked(&id)));
        object.insert(
            "unlocked_at".to_owned(),
            unlocked_at_for(&id).unwrap_or(Value::Null),
        );

        achievements_with_status.push(Value::Object(object));
    }

    // Group by category, preserving first-seen ordering of categories.
    let mut grouped = Map::new();
    let mut category_order: Vec<String> = Vec::new();
    for achievement in &achievements_with_status {
        let category = achievement
            .get("category")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();

        if !grouped.contains_key(&category) {
            grouped.insert(category.clone(), Value::Array(Vec::new()));
            category_order.push(category.clone());
        }

        if let Some(Value::Array(bucket)) = grouped.get_mut(&category) {
            bucket.push(achievement.clone());
        }
    }

    // Stats.
    let total_achievements = achievements.len() as i64;
    let unlocked_count = user_achievements.len() as i64;

    let total_xp_earned: i64 = user_achievements
        .iter()
        .map(|ua| {
            let Some(target_id) = ua.achievement_id.as_ref() else {
                return 0;
            };
            achievements
                .iter()
                .find(|row| row.get("id").and_then(Value::as_str) == Some(target_id.as_str()))
                .and_then(|row| row.get("xp_reward"))
                .and_then(Value::as_i64)
                .unwrap_or(0)
        })
        .sum();

    let completion_percentage = if total_achievements > 0 {
        // Mirror JS Math.round((unlocked / total) * 100).
        ((unlocked_count as f64 / total_achievements as f64) * 100.0).round() as i64
    } else {
        0
    };

    json!({
        "achievements": achievements_with_status,
        "grouped": Value::Object(grouped),
        "stats": {
            "total": total_achievements,
            "unlocked": unlocked_count,
            "total_xp_earned": total_xp_earned,
            "completion_percentage": completion_percentage,
        },
    })
}

async fn fetch_achievements(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    // Legacy: privateCatalog.from('mira_achievements').select('*')
    //   .order('category').order('sort_order')
    let Some(url) = contact_data.rest_url(
        "mira_achievements",
        &[
            ("select", "*".to_owned()),
            ("order", "category,sort_order".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn fetch_user_achievements(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Vec<UserAchievementRow>, ()> {
    // Legacy: supabase.from('mira_user_achievements')
    //   .select('achievement_id, unlocked_at').eq('user_id', user.id)
    let Some(url) = contact_data.rest_url(
        "mira_user_achievements",
        &[
            ("select", "achievement_id,unlocked_at".to_owned()),
            ("user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<UserAchievementRow>>().map_err(|_| ())
}

async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
