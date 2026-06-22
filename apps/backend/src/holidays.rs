use serde::Serialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const HOLIDAYS_PATH: &str = "/api/v1/internal/holidays";
const HOLIDAYS_ITEM_PATH_PREFIX: &str = "/api/v1/internal/holidays/";
const HOLIDAYS_TABLE: &str = "vietnamese_holidays";
const WORKSPACE_MEMBERS_TABLE: &str = "workspace_members";
const HOLIDAYS_ERROR_MESSAGE: &str = "Error fetching holidays";
const HOLIDAY_CREATE_ERROR_MESSAGE: &str = "Error creating holiday";
const HOLIDAY_UPDATE_ERROR_MESSAGE: &str = "Error updating holiday";
const HOLIDAY_DELETE_ERROR_MESSAGE: &str = "Error deleting holiday";
const HOLIDAY_NOT_FOUND_MESSAGE: &str = "Holiday not found";
const HOLIDAY_NO_UPDATES_MESSAGE: &str = "No updates provided";
const HOLIDAY_DUPLICATE_MESSAGE: &str = "A holiday already exists for this date";
const ADMIN_ACCESS_REQUIRED_MESSAGE: &str = "Admin access required";
const INVALID_INPUT_MESSAGE: &str = "Invalid input";
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Clone, Debug, Eq, PartialEq)]
struct CreateHolidayInput {
    date: String,
    name: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct UpdateHolidayInput {
    date: Option<String>,
    name: Option<String>,
}

impl UpdateHolidayInput {
    fn has_updates(&self) -> bool {
        self.date.is_some() || self.name.is_some()
    }

    fn request_body(&self) -> Result<String, ()> {
        let mut body = Map::new();

        if let Some(date) = &self.date {
            body.insert("date".to_owned(), Value::String(date.clone()));
        }

        if let Some(name) = &self.name {
            body.insert("name".to_owned(), Value::String(name.clone()));
        }

        serde_json::to_string(&Value::Object(body)).map_err(|_| ())
    }
}

#[derive(Serialize)]
struct CreateHolidayRequest<'a> {
    date: &'a str,
    name: &'a str,
}

pub(crate) async fn handle_holidays_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path == HOLIDAYS_PATH {
        return Some(match request.method {
            "GET" => holidays_response(&config.contact_data, request, outbound).await,
            "POST" => create_holiday_response(&config.contact_data, request, outbound).await,
            method => method_not_allowed(method, "GET, POST"),
        });
    }

    let holiday_id = holiday_item_id(request.path)?;

    Some(match request.method {
        "PUT" => update_holiday_response(&config.contact_data, request, holiday_id, outbound).await,
        "DELETE" => {
            delete_holiday_response(&config.contact_data, request, holiday_id, outbound).await
        }
        method => method_not_allowed(method, "PUT, DELETE"),
    })
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!((method, path), ("POST", HOLIDAYS_PATH))
        || (method == "PUT" && holiday_item_id(path).is_some())
}

async fn holidays_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return holidays_error_response();
    }

    let mut params = vec![("select", "*".to_owned()), ("order", "date.asc".to_owned())];

    if let Some(year) = holiday_year_filter(request) {
        params.push(("year", format!("eq.{year}")));
    }

    let Some(url) = contact_data.rest_url(HOLIDAYS_TABLE, &params) else {
        return holidays_error_response();
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return holidays_error_response();
    };

    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await;

    let Ok(response) = response else {
        return holidays_error_response();
    };

    if !(200..300).contains(&response.status) {
        return holidays_error_response();
    }

    let Ok(body) = response.json::<serde_json::Value>() else {
        return holidays_error_response();
    };

    no_store_response(json_response(200, body))
}

async fn create_holiday_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = request_holidays_admin_access(contact_data, request, outbound).await
    else {
        return admin_access_required_response();
    };

    let input = match create_holiday_input_from_body(request.body_text) {
        Ok(input) => input,
        Err(response) => return response,
    };

    if holiday_exists_for_date(contact_data, &access_token, &input.date, outbound).await {
        return no_store_response(json_response(
            409,
            json!({
                "message": HOLIDAY_DUPLICATE_MESSAGE,
            }),
        ));
    }

    let Some(url) = contact_data.rest_url(HOLIDAYS_TABLE, &[("select", "*".to_owned())]) else {
        return create_holiday_error_response();
    };
    let Ok(body) = serde_json::to_string(&CreateHolidayRequest {
        date: &input.date,
        name: &input.name,
    }) else {
        return create_holiday_error_response();
    };
    let Ok(response) = send_holidays_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        POSTGREST_SINGLE_JSON,
        &access_token,
        Some("return=representation"),
        Some(&body),
    )
    .await
    else {
        return create_holiday_error_response();
    };

    if !(200..300).contains(&response.status) {
        return create_holiday_error_response();
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(201, body)),
        Err(_) => create_holiday_error_response(),
    }
}

async fn update_holiday_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    holiday_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = request_holidays_admin_access(contact_data, request, outbound).await
    else {
        return admin_access_required_response();
    };

    let input = match update_holiday_input_from_body(request.body_text) {
        Ok(input) => input,
        Err(response) => return response,
    };

    if !input.has_updates() {
        return no_store_response(json_response(
            400,
            json!({
                "message": HOLIDAY_NO_UPDATES_MESSAGE,
            }),
        ));
    }

    if !holiday_exists_for_id(contact_data, &access_token, holiday_id, outbound).await {
        return no_store_response(json_response(
            404,
            json!({
                "message": HOLIDAY_NOT_FOUND_MESSAGE,
            }),
        ));
    }

    if let Some(date) = &input.date {
        if holiday_conflict_exists_for_date(contact_data, &access_token, date, holiday_id, outbound)
            .await
        {
            return no_store_response(json_response(
                409,
                json!({
                    "message": HOLIDAY_DUPLICATE_MESSAGE,
                }),
            ));
        }
    }

    let Some(url) = contact_data.rest_url(
        HOLIDAYS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{holiday_id}")),
        ],
    ) else {
        return update_holiday_error_response();
    };
    let Ok(body) = input.request_body() else {
        return update_holiday_error_response();
    };
    let Ok(response) = send_holidays_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        POSTGREST_SINGLE_JSON,
        &access_token,
        Some("return=representation"),
        Some(&body),
    )
    .await
    else {
        return update_holiday_error_response();
    };

    if !(200..300).contains(&response.status) {
        return update_holiday_error_response();
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => update_holiday_error_response(),
    }
}

async fn delete_holiday_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    holiday_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = request_holidays_admin_access(contact_data, request, outbound).await
    else {
        return admin_access_required_response();
    };

    let Some(url) = contact_data.rest_url(HOLIDAYS_TABLE, &[("id", format!("eq.{holiday_id}"))])
    else {
        return delete_holiday_error_response();
    };
    let Ok(response) = send_holidays_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Delete,
        &url,
        APPLICATION_JSON,
        &access_token,
        None,
        None,
    )
    .await
    else {
        return delete_holiday_error_response();
    };

    if !(200..300).contains(&response.status) {
        return delete_holiday_error_response();
    }

    no_store_response(json_response(
        200,
        json!({
            "message": "Holiday deleted",
        }),
    ))
}

async fn request_holidays_admin_access(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return None;
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return None;
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return None;
    };

    has_root_workspace_membership(contact_data, &access_token, &user_id, outbound)
        .await
        .then_some(access_token)
}

async fn has_root_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_MEMBERS_TABLE,
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };
    let Ok(response) = send_holidays_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        POSTGREST_SINGLE_JSON,
        access_token,
        None,
        None,
    )
    .await
    else {
        return false;
    };

    if !(200..300).contains(&response.status) {
        return false;
    }

    response
        .json::<Value>()
        .ok()
        .and_then(|body| body.get("type").and_then(Value::as_str).map(str::to_owned))
        .is_some_and(|membership_type| membership_type == "MEMBER")
}

async fn holiday_exists_for_id(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    holiday_id: &str,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(url) = contact_data.rest_url(
        HOLIDAYS_TABLE,
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{holiday_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };
    let Ok(response) = send_holidays_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        POSTGREST_SINGLE_JSON,
        access_token,
        None,
        None,
    )
    .await
    else {
        return false;
    };

    if !(200..300).contains(&response.status) {
        return false;
    }

    response
        .json::<Value>()
        .ok()
        .and_then(|body| body.get("id").and_then(Value::as_str).map(str::to_owned))
        .is_some()
}

async fn holiday_exists_for_date(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    date: &str,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(url) = contact_data.rest_url(
        HOLIDAYS_TABLE,
        &[
            ("select", "id".to_owned()),
            ("date", format!("eq.{date}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };
    let Ok(response) = send_holidays_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        POSTGREST_SINGLE_JSON,
        access_token,
        None,
        None,
    )
    .await
    else {
        return false;
    };

    if !(200..300).contains(&response.status) {
        return false;
    }

    response
        .json::<Value>()
        .ok()
        .and_then(|body| body.get("id").and_then(Value::as_str).map(str::to_owned))
        .is_some()
}

async fn holiday_conflict_exists_for_date(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    date: &str,
    holiday_id: &str,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(url) = contact_data.rest_url(
        HOLIDAYS_TABLE,
        &[
            ("select", "id".to_owned()),
            ("date", format!("eq.{date}")),
            ("id", format!("neq.{holiday_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };
    let Ok(response) = send_holidays_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        POSTGREST_SINGLE_JSON,
        access_token,
        None,
        None,
    )
    .await
    else {
        return false;
    };

    if !(200..300).contains(&response.status) {
        return false;
    }

    response
        .json::<Value>()
        .ok()
        .and_then(|body| body.get("id").and_then(Value::as_str).map(str::to_owned))
        .is_some()
}

async fn send_holidays_authenticated_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    accept: &str,
    access_token: &str,
    prefer: Option<&str>,
    body: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", accept)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }

    if let Some(body) = body {
        request = request
            .with_header("Content-Type", APPLICATION_JSON)
            .with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn create_holiday_input_from_body(
    body_text: Option<&str>,
) -> Result<CreateHolidayInput, BackendResponse> {
    let Ok(value) = serde_json::from_str::<Value>(body_text.unwrap_or_default()) else {
        return Err(invalid_input_response(json!({
            "body": ["Expected a JSON object"],
        })));
    };
    let Some(object) = value.as_object() else {
        return Err(invalid_input_response(json!({
            "body": ["Expected a JSON object"],
        })));
    };
    let mut field_errors = Map::new();

    let date = match object.get("date").and_then(Value::as_str) {
        Some(date) if legacy_date_string(date) => Some(date.to_owned()),
        Some(_) => {
            field_errors.insert(
                "date".to_owned(),
                json!(["Expected date formatted as YYYY-MM-DD"]),
            );
            None
        }
        None => {
            field_errors.insert("date".to_owned(), json!(["Expected string"]));
            None
        }
    };
    let name = match object.get("name").and_then(Value::as_str) {
        Some(name) if !name.is_empty() && name.chars().count() <= 100 => Some(name.to_owned()),
        Some(name) if name.is_empty() => {
            field_errors.insert("name".to_owned(), json!(["Expected at least 1 character"]));
            None
        }
        Some(_) => {
            field_errors.insert(
                "name".to_owned(),
                json!(["Expected at most 100 characters"]),
            );
            None
        }
        None => {
            field_errors.insert("name".to_owned(), json!(["Expected string"]));
            None
        }
    };

    match (date, name, field_errors.is_empty()) {
        (Some(date), Some(name), true) => Ok(CreateHolidayInput { date, name }),
        _ => Err(invalid_input_response(Value::Object(field_errors))),
    }
}

fn update_holiday_input_from_body(
    body_text: Option<&str>,
) -> Result<UpdateHolidayInput, BackendResponse> {
    let Ok(value) = serde_json::from_str::<Value>(body_text.unwrap_or_default()) else {
        return Err(invalid_input_response(json!({
            "body": ["Expected a JSON object"],
        })));
    };
    let Some(object) = value.as_object() else {
        return Err(invalid_input_response(json!({
            "body": ["Expected a JSON object"],
        })));
    };
    let mut field_errors = Map::new();

    let date = match object.get("date") {
        Some(Value::String(date)) if legacy_date_string(date) => Some(date.to_owned()),
        Some(Value::String(_)) => {
            field_errors.insert(
                "date".to_owned(),
                json!(["Expected date formatted as YYYY-MM-DD"]),
            );
            None
        }
        Some(_) => {
            field_errors.insert("date".to_owned(), json!(["Expected string"]));
            None
        }
        None => None,
    };
    let name = match object.get("name") {
        Some(Value::String(name)) if !name.is_empty() && name.chars().count() <= 100 => {
            Some(name.to_owned())
        }
        Some(Value::String(name)) if name.is_empty() => {
            field_errors.insert("name".to_owned(), json!(["Expected at least 1 character"]));
            None
        }
        Some(Value::String(_)) => {
            field_errors.insert(
                "name".to_owned(),
                json!(["Expected at most 100 characters"]),
            );
            None
        }
        Some(_) => {
            field_errors.insert("name".to_owned(), json!(["Expected string"]));
            None
        }
        None => None,
    };

    if field_errors.is_empty() {
        Ok(UpdateHolidayInput { date, name })
    } else {
        Err(invalid_input_response(Value::Object(field_errors)))
    }
}

fn holiday_item_id(path: &str) -> Option<&str> {
    let holiday_id = path.strip_prefix(HOLIDAYS_ITEM_PATH_PREFIX)?;

    (!holiday_id.is_empty() && !holiday_id.contains('/') && holiday_id != "bulk")
        .then_some(holiday_id)
}

fn holiday_year_filter(request: BackendRequest<'_>) -> Option<i64> {
    let url = url::Url::parse(request.url?).ok()?;
    let raw_year = url
        .query_pairs()
        .find_map(|(key, value)| (key == "year").then(|| value.into_owned()))?;
    let year = parse_js_parse_int_prefix(&raw_year)?;

    (year != 0).then_some(year)
}

fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|year| sign * year)
}

fn legacy_date_string(value: &str) -> bool {
    let bytes = value.as_bytes();

    bytes.len() == 10
        && bytes[0].is_ascii_digit()
        && bytes[1].is_ascii_digit()
        && bytes[2].is_ascii_digit()
        && bytes[3].is_ascii_digit()
        && bytes[4] == b'-'
        && bytes[5].is_ascii_digit()
        && bytes[6].is_ascii_digit()
        && bytes[7] == b'-'
        && bytes[8].is_ascii_digit()
        && bytes[9].is_ascii_digit()
}

fn holidays_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": HOLIDAYS_ERROR_MESSAGE,
        }),
    ))
}

fn create_holiday_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": HOLIDAY_CREATE_ERROR_MESSAGE,
        }),
    ))
}

fn update_holiday_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": HOLIDAY_UPDATE_ERROR_MESSAGE,
        }),
    ))
}

fn delete_holiday_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": HOLIDAY_DELETE_ERROR_MESSAGE,
        }),
    ))
}

fn admin_access_required_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({
            "message": ADMIN_ACCESS_REQUIRED_MESSAGE,
        }),
    ))
}

fn invalid_input_response(field_errors: Value) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "message": INVALID_INPUT_MESSAGE,
            "errors": {
                "fieldErrors": field_errors,
                "formErrors": [],
            },
        }),
    ))
}
