use super::*;

pub(super) async fn clean_retired_banners(
    config: &ContactDataConfig,
    actor: &str,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(origin) = url_origin(&config.supabase_url) else {
        return false;
    };
    let Some(expire_url) = config.rpc_url("expire_profile_banner_operations") else {
        return false;
    };
    let expired_body = json!({"p_user_id":actor,"p_storage_origin":origin}).to_string();
    match send_contact_data_request(
        config,
        outbound,
        OutboundMethod::Post,
        &expire_url,
        Some(&expired_body),
        None,
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => (),
        _ => return false,
    }
    let Some(url) = config.rpc_url("pending_profile_banner_retirements") else {
        return false;
    };
    let body = json!({"p_user_id":actor}).to_string();
    let Ok(response) = send_contact_data_request(
        config,
        outbound,
        OutboundMethod::Post,
        &url,
        Some(&body),
        None,
    )
    .await
    else {
        return false;
    };
    if !is_success_status(response.status) {
        return false;
    }
    let Ok(rows) = serde_json::from_str::<Vec<serde_json::Value>>(&response.body_text) else {
        return false;
    };
    let mut complete = rows.len() < 20;
    for row in rows {
        let Some(public_url) = row["public_url"].as_str() else {
            complete = false;
            continue;
        };
        let Some(path) = owned_banner_path(public_url, actor, &origin) else {
            complete = false;
            continue;
        };
        if row["file_path"].as_str() != Some(path) {
            complete = false;
            continue;
        }
        let deleted = row["delete_ready"].as_bool() == Some(true);
        let storage_url = if deleted {
            format!("{origin}/storage/v1/object/banners")
        } else {
            format!("{origin}/storage/v1/object/banners/{path}")
        };
        let Some(key) = config.service_role_key() else {
            return false;
        };
        let auth = format!("Bearer {key}");
        let delete_body = json!({"prefixes":[path]}).to_string();
        // A non-sensitive inert slot blocks outstanding non-upsert upload tokens.
        let request = OutboundRequest::new(
            if deleted {
                OutboundMethod::Delete
            } else {
                OutboundMethod::Post
            },
            &storage_url,
        )
        .with_header("Authorization", &auth)
        .with_header("apikey", key)
        .with_header(
            "Content-Type",
            if deleted {
                APPLICATION_JSON
            } else {
                "image/png"
            },
        )
        .with_header("x-upsert", "true")
        .with_header("Cache-Control", "max-age=0")
        .with_body(if deleted { &delete_body } else { "retired" });
        let Ok(removed) = outbound.send(request).await else {
            complete = false;
            continue;
        };
        if !is_success_status(removed.status) {
            complete = false;
            continue;
        }
        let Some(mark_url) = config.rpc_url("complete_profile_banner_retirement") else {
            return false;
        };
        let mark =
            json!({"p_user_id":actor,"p_public_url":public_url,"p_deleted":deleted}).to_string();
        match send_contact_data_request(
            config,
            outbound,
            OutboundMethod::Post,
            &mark_url,
            Some(&mark),
            None,
        )
        .await
        {
            Ok(response) if is_success_status(response.status) => (),
            _ => complete = false,
        }
    }
    complete
}

fn owned_banner_path<'a>(value: &'a str, actor: &str, origin: &str) -> Option<&'a str> {
    let prefix = format!("{origin}/storage/v1/object/public/banners/{actor}/");
    let file = value.strip_prefix(&prefix)?;
    let (stem, ext) = file.rsplit_once('.')?;
    if !matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp") {
        return None;
    }
    let timestamp = stem.len() == 13 && stem.bytes().all(|b| b.is_ascii_digit());
    let uuid = stem.len() == 36
        && stem.bytes().enumerate().all(|(i, b)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
            }
        });
    if !timestamp && !uuid {
        return None;
    }
    value.strip_prefix(&format!("{origin}/storage/v1/object/public/banners/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ownership_is_exact_and_never_foreign_external_or_encoded() {
        let actor = "00000000-0000-4000-8000-000000000001";
        let origin = "https://synthetic.example.test";
        let path = format!("{origin}/storage/v1/object/public/banners/{actor}/1234567890123.png");
        assert!(owned_banner_path(&path, actor, origin).is_some());
        for bad in [
            format!("{path}?token=x"),
            format!("{path}/extra"),
            path.replace(origin, "https://other.example.test"),
            path.replace(actor, "00000000-0000-4000-8000-000000000002"),
        ] {
            assert!(owned_banner_path(&bad, actor, origin).is_none());
        }
    }
}

pub(super) fn canonical_profile_banner_patch(
    updates: &serde_json::Value,
    actor: &str,
    config: &ContactDataConfig,
) -> bool {
    let Some(value) = updates.get("banner_url").and_then(|v| v.as_str()) else {
        return true;
    };
    let Some(origin) = url_origin(&config.supabase_url) else {
        return false;
    };
    let Ok(parsed) = url::Url::parse(value) else {
        return false;
    };
    if parsed.origin().ascii_serialization() != origin {
        return true;
    }
    let raw = parsed.path().as_bytes();
    let mut bytes = Vec::new();
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' && i + 2 < raw.len() {
            let Ok(hex) = std::str::from_utf8(&raw[i + 1..i + 3]) else {
                return false;
            };
            let Ok(byte) = u8::from_str_radix(hex, 16) else {
                return false;
            };
            bytes.push(byte);
            i += 3;
        } else {
            bytes.push(raw[i]);
            i += 1;
        }
    }
    let Ok(decoded) = String::from_utf8(bytes) else {
        return false;
    };
    let mut parts = Vec::new();
    for part in decoded.split('/') {
        if part == ".." {
            parts.pop();
        } else if !part.is_empty() && part != "." {
            parts.push(part);
        }
    }
    let path = format!("/{}", parts.join("/"));
    if !path.starts_with(&format!("/storage/v1/object/public/banners/{actor}/")) {
        return true;
    }
    owned_banner_path(value, actor, &origin).is_some()
}
