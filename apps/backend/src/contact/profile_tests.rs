use super::*;

#[test]
fn retains_original_usernames_until_actor_scoped_comparison_and_preserves_clears() {
    let parsed = profile_patch_updates(Some(
        r#"{"handle":"  Synthetic_Name  ","banner_url":null,"bio":null}"#,
    ))
    .unwrap();
    assert_eq!(parsed["handle"], "  Synthetic_Name  ");
    assert!(parsed["banner_url"].is_null());
    assert!(parsed["bio"].is_null());
}

#[test]
fn rejects_unsafe_image_urls_and_non_string_usernames() {
    for body in [
        r#"{"banner_url":"https://"}"#,
        r#"{"banner_url":"javascript:alert(1)"}"#,
        r#"{"avatar_url":"http://example.test/image.png"}"#,
        r#"{"handle":123}"#,
    ] {
        assert!(profile_patch_updates(Some(body)).is_err());
    }
}

#[test]
fn excludes_private_fields_and_forged_actors() {
    assert!(
        profile_patch_updates(Some(
            r#"{"id":"another-user","email":"private@example.test"}"#
        ))
        .is_err()
    );
    let parsed = profile_patch_updates(Some(
        r#"{"display_name":"Synthetic creator","id":"another-user"}"#,
    ))
    .unwrap();
    assert_eq!(parsed, json!({ "display_name": "Synthetic creator" }));
}

#[test]
fn distinctive_names_can_contain_brand_fragments() {
    assert!(profile_patch_updates(Some(r#"{"handle":"pineapple"}"#)).is_ok());
}

#[test]
fn preserves_legacy_handles_for_locked_sql_noop_comparison() {
    for handle in ["old", "google", "Legacy_Name"] {
        let body = json!({ "handle": handle }).to_string();
        assert_eq!(
            profile_patch_updates(Some(&body)).unwrap()["handle"],
            handle
        );
    }
    let body = json!({ "handle": "x".repeat(101) }).to_string();
    assert!(profile_patch_updates(Some(&body)).is_err());
}
