use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    email_blacklist_write::{email_blacklist_create_response, email_blacklist_update_response},
    infrastructure_root_auth::{
        RootWorkspaceReadAuthError, authorize_root_workspace_read, send_caller_token_get,
        send_caller_token_request,
    },
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundResponse},
};

pub(crate) const EMAIL_BLACKLIST_PATH: &str = "/api/v1/infrastructure/email-blacklist";

pub(crate) const EMAIL_BLACKLIST_TABLE: &str = "email_blacklist";
pub(crate) const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const POSTGREST_SINGULAR_RESPONSE_ERROR_CODE: &str = "PGRST116";

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum EmailBlacklistRoute {
    Collection,
    Entry { entry_id: String },
}

pub(crate) async fn handle_email_blacklist_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = email_blacklist_route(request.path)?;

    match (&route, request.method) {
        (_, "GET") => Some(email_blacklist_get_response(config, request, outbound, route).await),
        (EmailBlacklistRoute::Collection, "POST") => {
            Some(email_blacklist_create_response(config, request, outbound).await)
        }
        (EmailBlacklistRoute::Entry { entry_id }, "PUT") => {
            Some(email_blacklist_update_response(config, request, outbound, entry_id).await)
        }
        (EmailBlacklistRoute::Entry { entry_id }, "DELETE") => {
            Some(email_blacklist_delete_response(config, request, outbound, entry_id).await)
        }
        _ => None,
    }
}

async fn email_blacklist_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    route: EmailBlacklistRoute,
) -> BackendResponse {
    let auth = authorize_email_blacklist_read(config, request, outbound).await;
    let access_token = match (auth, &route) {
        (Ok(access_token), _) => access_token,
        (Err(RootWorkspaceReadAuthError::Unauthorized), _) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        (Err(RootWorkspaceReadAuthError::Forbidden), EmailBlacklistRoute::Collection) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
        (Err(RootWorkspaceReadAuthError::Forbidden), EmailBlacklistRoute::Entry { .. }) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
    };

    match route {
        EmailBlacklistRoute::Collection => {
            email_blacklist_collection_response(&config.contact_data, outbound, &access_token).await
        }
        EmailBlacklistRoute::Entry { entry_id } => {
            email_blacklist_entry_response(&config.contact_data, outbound, &access_token, &entry_id)
                .await
        }
    }
}

pub(crate) async fn authorize_email_blacklist_read(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<String, RootWorkspaceReadAuthError> {
    authorize_root_workspace_read(config, request, outbound).await
}

async fn email_blacklist_delete_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    entry_id: &str,
) -> BackendResponse {
    let access_token = match authorize_email_blacklist_read(config, request, outbound).await {
        Ok(access_token) => access_token,
        Err(RootWorkspaceReadAuthError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(RootWorkspaceReadAuthError::Forbidden) => {
            return no_store_response(json_response(403, json!({ "message": "Unauthorized" })));
        }
    };

    if !email_blacklist_entry_exists(&config.contact_data, outbound, &access_token, entry_id).await
    {
        return no_store_response(json_response(
            404,
            json!({ "message": "Email blacklist entry not found" }),
        ));
    }

    if delete_email_blacklist_entry(&config.contact_data, outbound, &access_token, entry_id)
        .await
        .is_err()
    {
        return no_store_response(json_response(
            500,
            json!({ "message": "Error deleting email blacklist entry" }),
        ));
    }

    no_store_response(json_response(
        200,
        json!({ "message": "Entry deleted successfully" }),
    ))
}

async fn email_blacklist_collection_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
) -> BackendResponse {
    let Some(url) = contact_data.rest_url(
        EMAIL_BLACKLIST_TABLE,
        &[
            ("select", "*".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return email_blacklist_error_response("Error fetching email blacklist entries");
    };
    let response =
        match send_caller_token_get(contact_data, outbound, &url, access_token, APPLICATION_JSON)
            .await
        {
            Ok(response) => response,
            Err(()) => {
                return email_blacklist_error_response("Error fetching email blacklist entries");
            }
        };

    if !is_success_status(response.status) {
        return email_blacklist_error_response("Error fetching email blacklist entries");
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => email_blacklist_error_response("Error fetching email blacklist entries"),
    }
}

async fn email_blacklist_entry_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    entry_id: &str,
) -> BackendResponse {
    let Some(url) = contact_data.rest_url(
        EMAIL_BLACKLIST_TABLE,
        &[("select", "*".to_owned()), ("id", format!("eq.{entry_id}"))],
    ) else {
        return email_blacklist_entry_error_response(500);
    };
    let response = match send_caller_token_get(
        contact_data,
        outbound,
        &url,
        access_token,
        POSTGREST_SINGLE_JSON,
    )
    .await
    {
        Ok(response) => response,
        Err(()) => return email_blacklist_entry_error_response(500),
    };

    if !is_success_status(response.status) {
        return email_blacklist_entry_error_response(if is_postgrest_single_not_found(&response) {
            404
        } else {
            500
        });
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => email_blacklist_entry_error_response(500),
    }
}

pub(crate) async fn email_blacklist_entry_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    entry_id: &str,
) -> bool {
    let Some(url) = contact_data.rest_url(
        EMAIL_BLACKLIST_TABLE,
        &[("select", "*".to_owned()), ("id", format!("eq.{entry_id}"))],
    ) else {
        return false;
    };
    let response = match send_caller_token_get(
        contact_data,
        outbound,
        &url,
        access_token,
        POSTGREST_SINGLE_JSON,
    )
    .await
    {
        Ok(response) => response,
        Err(()) => return false,
    };

    is_success_status(response.status) && response.json::<Value>().is_ok()
}

async fn delete_email_blacklist_entry(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    entry_id: &str,
) -> Result<(), ()> {
    let Some(url) =
        contact_data.rest_url(EMAIL_BLACKLIST_TABLE, &[("id", format!("eq.{entry_id}"))])
    else {
        return Err(());
    };
    let response = send_caller_token_request(
        contact_data,
        outbound,
        OutboundMethod::Delete,
        &url,
        access_token,
        APPLICATION_JSON,
    )
    .await?;

    is_success_status(response.status).then_some(()).ok_or(())
}

pub(crate) fn email_blacklist_route(path: &str) -> Option<EmailBlacklistRoute> {
    if path == EMAIL_BLACKLIST_PATH {
        return Some(EmailBlacklistRoute::Collection);
    }

    let entry_id = path.strip_prefix(EMAIL_BLACKLIST_PATH)?.strip_prefix('/')?;
    if entry_id.is_empty() || entry_id.contains('/') {
        return None;
    }

    Some(EmailBlacklistRoute::Entry {
        entry_id: entry_id.to_owned(),
    })
}

fn email_blacklist_error_response(message: &'static str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}

fn email_blacklist_entry_error_response(status: u16) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({ "message": "Error fetching email blacklist entry" }),
    ))
}

pub(crate) fn is_postgrest_single_not_found(response: &OutboundResponse) -> bool {
    response
        .json::<Value>()
        .ok()
        .and_then(|body| body.get("code").and_then(Value::as_str).map(str::to_owned))
        .as_deref()
        == Some(POSTGREST_SINGULAR_RESPONSE_ERROR_CODE)
}

pub(crate) fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}
