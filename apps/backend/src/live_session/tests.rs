use super::*;

// ── is_valid_uuid ────────────────────────────────────────────────────────

#[test]
fn valid_uuid_accepted() {
    assert!(is_valid_uuid("550e8400-e29b-41d4-a716-446655440000"));
    assert!(is_valid_uuid("00000000-0000-0000-0000-000000000000"));
}

#[test]
fn invalid_uuid_rejected() {
    assert!(!is_valid_uuid("not-a-uuid"));
    assert!(!is_valid_uuid("550e8400-e29b-41d4-a716-44665544000")); // 35 chars
    assert!(!is_valid_uuid("550e8400-e29b-41d4-a716-4466554400000")); // 37 chars
    assert!(!is_valid_uuid("550e8400xe29b-41d4-a716-446655440000")); // wrong separator
}

// ── validate_scope_key ───────────────────────────────────────────────────

#[test]
fn fixed_scope_keys_are_valid() {
    assert!(matches!(
        validate_scope_key(MIRA_LIVE_SCOPE_KEY),
        Some(ValidScopeKey::Fixed)
    ));
    assert!(matches!(
        validate_scope_key(WEB_ASSISTANT_LIVE_SCOPE_KEY),
        Some(ValidScopeKey::Fixed)
    ));
}

#[test]
fn assistant_chat_scope_with_valid_uuid_accepted() {
    let key = "assistant:550e8400-e29b-41d4-a716-446655440000";
    match validate_scope_key(key) {
        Some(ValidScopeKey::AssistantChat { chat_id }) => {
            assert_eq!(chat_id, "550e8400-e29b-41d4-a716-446655440000");
        }
        other => panic!("expected AssistantChat, got {other:?}"),
    }
}

#[test]
fn assistant_prefix_without_valid_uuid_rejected() {
    assert!(validate_scope_key("assistant:not-a-uuid").is_none());
    assert!(validate_scope_key("assistant:").is_none());
}

#[test]
fn empty_scope_key_rejected() {
    assert!(validate_scope_key("").is_none());
}

#[test]
fn scope_key_exceeding_max_length_rejected() {
    let long_key = "a".repeat(LIVE_SESSION_SCOPE_KEY_MAX_LENGTH + 1);
    assert!(validate_scope_key(&long_key).is_none());
}

#[test]
fn unknown_fixed_key_rejected() {
    assert!(validate_scope_key("mira:other").is_none());
    assert!(validate_scope_key("arbitrary:key").is_none());
}

// ── query_param ──────────────────────────────────────────────────────────

#[test]
fn query_param_extracted_from_url() {
    let url = "https://example.com/api/v1/live/session?wsId=abc123&scopeKey=mira%3Adefault";
    assert_eq!(query_param(Some(url), "wsId"), Some("abc123".to_owned()));
    assert_eq!(
        query_param(Some(url), "scopeKey"),
        Some("mira:default".to_owned())
    );
}

#[test]
fn query_param_absent_returns_none() {
    let url = "https://example.com/api/v1/live/session?wsId=abc";
    assert!(query_param(Some(url), "scopeKey").is_none());
}

#[test]
fn query_param_with_no_url_returns_none() {
    assert!(query_param(None, "wsId").is_none());
}

// ── path guard ───────────────────────────────────────────────────────────

#[test]
fn path_guard_exact_match_only() {
    assert_eq!(LIVE_SESSION_PATH, "/api/v1/live/session");
    // Ensure sub-paths would not accidentally match an `==` comparison.
    assert!("/api/v1/live/session/extra" != LIVE_SESSION_PATH);
    assert!("/api/v1/live" != LIVE_SESSION_PATH);
}

#[test]
fn canonical_protocol_scope_keeps_chat_ownership_validation() {
    assert!(matches!(
        validate_scope_key("assistant-canonical-v1:550e8400-e29b-41d4-a716-446655440000"),
        Some(ValidScopeKey::AssistantChat { .. })
    ));
    assert!(validate_scope_key("assistant-canonical-v1:not-a-uuid").is_none());
}
