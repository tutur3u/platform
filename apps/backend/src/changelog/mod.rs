use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const CHANGELOG_LIST_PATH: &str = "/api/v1/infrastructure/changelog";
const CHANGELOG_SLUG_PATH_PREFIX: &str = "/api/v1/infrastructure/changelog/slug/";
const CHANGELOG_DETAIL_PATH_PREFIX: &str = "/api/v1/infrastructure/changelog/";
const CHANGELOG_ENTRIES_TABLE: &str = "changelog_entries";
const CHANGELOG_DUPLICATE_SLUG_MESSAGE: &str = "A changelog entry with this slug already exists";
const CHANGELOG_CREATE_ERROR_MESSAGE: &str = "Error creating changelog entry";
const CHANGELOG_UPDATE_ERROR_MESSAGE: &str = "Error updating changelog entry";
const CHANGELOG_DELETE_ERROR_MESSAGE: &str = "Error deleting changelog entry";
const CHANGELOG_PUBLISH_ERROR_MESSAGE: &str = "Error updating changelog publish status";
const CHANGELOG_DELETE_SUCCESS_MESSAGE: &str = "Changelog entry deleted successfully";
const CHANGELOG_INVALID_REQUEST_MESSAGE: &str = "Invalid request data";
const CHANGELOG_LIST_ERROR_MESSAGE: &str = "Error fetching changelog entries";
const CHANGELOG_ENTRY_NOT_FOUND_MESSAGE: &str = "Changelog entry not found";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_CHANGELOG_PERMISSION: &str = "manage_changelog";
const MAX_COLOR_LENGTH: usize = 50;
const MAX_NAME_LENGTH: usize = 255;
const MAX_SEARCH_LENGTH: usize = 500;
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const POSTGREST_DUPLICATE_KEY_CODE: &str = "23505";
const POSTGREST_SINGULAR_RESPONSE_ERROR_CODE: &str = "PGRST116";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";

mod auth;
mod db;
mod handlers;
mod helpers;
mod payload;
mod routing;
mod types;

use auth::*;
use db::*;
use handlers::*;
use helpers::*;
use payload::*;
use routing::*;
use types::*;

pub(crate) async fn handle_changelog_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = changelog_route(request.path)?;

    Some(match (request.method, route) {
        ("GET", ChangelogRoute::Detail { id }) => {
            changelog_detail_response(&config.contact_data, request, id, outbound).await
        }
        ("GET", ChangelogRoute::List) => {
            changelog_list_response(&config.contact_data, request, outbound).await
        }
        ("GET", ChangelogRoute::Slug { slug }) => {
            changelog_slug_response(&config.contact_data, slug, outbound).await
        }
        ("POST", ChangelogRoute::List) => {
            changelog_create_response(&config.contact_data, request, outbound).await
        }
        ("PUT", ChangelogRoute::Detail { id }) => {
            changelog_update_response(&config.contact_data, request, id, outbound).await
        }
        ("DELETE", ChangelogRoute::Detail { id }) => {
            changelog_delete_response(&config.contact_data, request, id, outbound).await
        }
        ("POST", ChangelogRoute::Publish { id }) => {
            changelog_publish_response(&config.contact_data, request, id, outbound).await
        }
        (method, ChangelogRoute::Detail { .. }) => method_not_allowed(method, "GET, PUT, DELETE"),
        (method, ChangelogRoute::List) => method_not_allowed(method, "GET, POST"),
        (method, ChangelogRoute::Publish { .. }) => method_not_allowed(method, "POST"),
        (method, ChangelogRoute::Slug { .. }) => method_not_allowed(method, "GET"),
    })
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!(
        (method, changelog_route(path)),
        ("POST", Some(ChangelogRoute::List))
            | ("PUT", Some(ChangelogRoute::Detail { .. }))
            | ("POST", Some(ChangelogRoute::Publish { .. }))
    )
}
