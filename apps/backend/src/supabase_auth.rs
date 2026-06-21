use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::Deserialize;
use std::collections::BTreeMap;

use crate::{
    APPLICATION_JSON, BackendRequest, contact,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const SUPABASE_AUTH_COOKIE_BASE64_PREFIX: &str = "base64-";
const SUPABASE_AUTH_USER_PATH: &str = "user";

#[derive(Clone, Debug, Default)]
struct SupabaseAuthCookieGroup {
    base: Option<String>,
    chunks: BTreeMap<usize, String>,
    duplicate: bool,
}

#[derive(Deserialize)]
struct SupabaseCookieSession {
    access_token: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub(crate) struct SupabaseAuthUser {
    pub(crate) email: Option<String>,
    pub(crate) id: Option<String>,
}

pub(crate) fn request_access_token(request: BackendRequest<'_>) -> Option<String> {
    request
        .cookie
        .and_then(supabase_access_token_from_cookie_header)
}

pub(crate) async fn fetch_supabase_auth_user(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<SupabaseAuthUser> {
    let user_url = contact_data.auth_url(SUPABASE_AUTH_USER_PATH)?;
    let service_role_key = contact_data.service_role_key()?;
    let authorization = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &user_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    response.json::<SupabaseAuthUser>().ok()
}

pub(crate) fn is_valid_tuturuuu_email(email: Option<&str>) -> bool {
    let Some(email) = email else {
        return false;
    };
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };

    !local.is_empty()
        && !local.chars().any(char::is_whitespace)
        && matches!(domain, "tuturuuu.com" | "xwf.tuturuuu.com")
}

fn supabase_access_token_from_cookie_header(cookie_header: &str) -> Option<String> {
    let groups = supabase_auth_cookie_groups(cookie_header);

    groups
        .values()
        .filter_map(supabase_auth_cookie_value)
        .find_map(|value| access_token_from_supabase_cookie_value(&value))
}

fn supabase_auth_cookie_groups(cookie_header: &str) -> BTreeMap<String, SupabaseAuthCookieGroup> {
    let mut groups = BTreeMap::<String, SupabaseAuthCookieGroup>::new();

    for (name, value) in cookie_header
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
    {
        let Some((storage_key, chunk_index)) = supabase_auth_cookie_name_parts(name.trim()) else {
            continue;
        };
        let group = groups.entry(storage_key).or_default();

        match chunk_index {
            Some(index) => {
                if group
                    .chunks
                    .insert(index, value.trim().to_owned())
                    .is_some()
                {
                    group.duplicate = true;
                }
            }
            None => {
                if group.base.is_some() {
                    group.duplicate = true;
                }
                group.base = Some(value.trim().to_owned());
            }
        }
    }

    groups
}

fn supabase_auth_cookie_name_parts(name: &str) -> Option<(String, Option<usize>)> {
    if !name.starts_with("sb-") {
        return None;
    }

    if name.ends_with("-auth-token") {
        return Some((name.to_owned(), None));
    }

    let (storage_key, suffix) = name.rsplit_once('.')?;

    if !storage_key.ends_with("-auth-token") {
        return None;
    }

    suffix
        .parse::<usize>()
        .ok()
        .map(|index| (storage_key.to_owned(), Some(index)))
}

fn supabase_auth_cookie_value(group: &SupabaseAuthCookieGroup) -> Option<String> {
    if group.duplicate {
        return None;
    }

    match (&group.base, group.chunks.is_empty()) {
        (Some(base), true) => return Some(base.clone()),
        (Some(_), false) => return None,
        (None, true) => return None,
        (None, false) => {}
    }

    let mut value = String::new();
    for index in 0..group.chunks.len() {
        value.push_str(group.chunks.get(&index)?);
    }

    Some(value)
}

fn access_token_from_supabase_cookie_value(cookie_value: &str) -> Option<String> {
    let session =
        if let Some(base64_body) = cookie_value.strip_prefix(SUPABASE_AUTH_COOKIE_BASE64_PREFIX) {
            let mut padded = base64_body.to_owned();
            while padded.len() % 4 != 0 {
                padded.push('=');
            }
            let decoded = URL_SAFE.decode(padded.as_bytes()).ok()?;
            serde_json::from_slice::<SupabaseCookieSession>(&decoded).ok()?
        } else if cookie_value.starts_with('{') {
            serde_json::from_str::<SupabaseCookieSession>(cookie_value).ok()?
        } else {
            return None;
        };

    session
        .access_token
        .filter(|token| !token.trim().is_empty())
}
