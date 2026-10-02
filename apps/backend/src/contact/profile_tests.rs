use super::*;

#[test]
fn normalizes_shared_usernames_and_preserves_explicit_clears() {
    let parsed = profile_patch_updates(Some(
        r#"{"handle":"  Synthetic_Name  ","banner_url":null,"bio":null}"#,
    ))
    .unwrap();
    assert_eq!(parsed["handle"], "synthetic_name");
    assert!(parsed["banner_url"].is_null());
    assert!(parsed["bio"].is_null());
}

#[test]
fn rejects_unsafe_image_urls_and_invalid_usernames() {
    for body in [
        r#"{"banner_url":"https://"}"#,
        r#"{"banner_url":"javascript:alert(1)"}"#,
        r#"{"avatar_url":"http://example.test/image.png"}"#,
        r#"{"handle":"_invalid"}"#,
        r#"{"handle":"xy"}"#,
        r#"{"handle":"four"}"#,
        r#"{"handle":"google"}"#,
        r#"{"handle":"apple"}"#,
        r#"{"handle":"microsoft"}"#,
        r#"{"handle":"g_o_o_g_l_e"}"#,
        r#"{"handle":"apple123"}"#,
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
