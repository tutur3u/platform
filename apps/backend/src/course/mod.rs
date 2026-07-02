//! Handler for `/api/v1/course`.
//!
//! Ported from the legacy Next.js route at
//! `apps/web/src/app/api/v1/course/route.ts`. This is a STATIC path matched by
//! exact `(method, path)` equality. It supports a single `GET` method with two
//! mutually exclusive modes selected by query params:
//!
//!   * `?courseId=<uuid>[&studentId=<uuid>]` -> detailed content for one course
//!   * `?wsId=<workspace>[&studentId=<uuid>]` -> list of courses for a workspace
//!
//! All `sbAdmin` (service-role / `createAdminClient`) reads in the legacy route
//! are reproduced here via service-role REST requests. The two
//! `sessionSupabase` (RLS) reads in the guest-permission fallback are reproduced
//! via caller-token REST requests so RLS still applies, exactly like the legacy
//! behavior.
//!
//! This module is fully self-contained: every helper it needs is defined as a
//! file-local fn. No shared helpers were added to other modules.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

mod db;
mod handlers;
mod helpers;
mod subject;

use db::*;
use handlers::*;
use helpers::*;
use subject::*;

const COURSE_PATH: &str = "/api/v1/course";
pub(super) const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
pub(super) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(super) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
pub(super) const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
pub(super) const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal Server Error";

// ─── Entry point ─────────────────────────────────────────────────────────────

pub(crate) async fn handle_course_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != COURSE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => course_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}
