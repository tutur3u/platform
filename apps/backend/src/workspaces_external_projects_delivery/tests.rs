use super::*;

#[test]
fn asset_urls_use_the_same_revision_key_as_next_delivery() {
    let asset = build_delivery_asset(
        "workspace-one",
        &json!({
            "id": "asset-one",
            "updated_at": "2026-07-17T01:02:03.456Z",
            "source_url": "https://itch.io/intentional-external.png"
        }),
    );

    assert_eq!(asset["assetRevision"], "20260717010203456");
    assert_eq!(
        asset["assetUrl"],
        "/api/v1/workspaces/workspace-one/external-projects/assets/asset-one?v=20260717010203456"
    );
}

#[test]
fn public_collections_only_emit_relations_with_a_delivered_target() {
    let collections = vec![
        json!({ "id": "characters", "slug": "characters" }),
        json!({ "id": "worlds", "slug": "worlds" }),
    ];
    let entries = vec![
        json!({ "id": "hero", "collection_id": "characters", "status": "published" }),
        json!({ "id": "earth", "collection_id": "worlds", "status": "published" }),
    ];
    let relations = vec![
        json!({
            "id": "published-relation",
            "from_entry_id": "hero",
            "to_entry_id": "earth",
            "relation_definition_id": "world-definition"
        }),
        json!({
            "id": "draft-relation",
            "from_entry_id": "hero",
            "to_entry_id": "draft-world",
            "relation_definition_id": "world-definition"
        }),
    ];
    let definitions = vec![json!({
        "id": "world-definition",
        "key": "world"
    })];

    let payload = build_collections_payload(
        "workspace-one",
        &collections,
        &entries,
        &[],
        &[],
        &relations,
        &definitions,
    );
    let character_relations = payload[0]["entries"][0]["relations"]
        .as_array()
        .expect("relations array");

    assert_eq!(character_relations.len(), 1);
    assert_eq!(character_relations[0]["id"], "published-relation");
    assert_eq!(character_relations[0]["key"], "world");
}

#[test]
fn public_delivery_headers_match_the_next_cache_contract() {
    let response = public_delivery_response(
        json!({
            "collections": [{
                "entries": [{ "assets": [{ "id": "asset-one" }] }]
            }],
            "revision": "20260717010203456"
        }),
        "workspace-one",
        None,
    );

    assert_eq!(response.cache_control, Some(PUBLIC_DELIVERY_CACHE_CONTROL));
    assert!(
        response
            .headers
            .contains(&("etag", "W/\"20260717010203456\"".to_owned()))
    );
    assert!(response.headers.contains(&(
        "vercel-cdn-cache-control",
        "max-age=86400, stale-while-revalidate=43200".to_owned()
    )));
    assert!(response.headers.contains(&(
        "vercel-cache-tag",
        "external-project-workspace-workspace-one,external-project-asset-asset-one".to_owned()
    )));
}

#[test]
fn public_delivery_returns_not_modified_for_weak_or_listed_etags() {
    let response = public_delivery_response(
        json!({ "collections": [], "revision": "revision-one" }),
        "workspace-one",
        Some("\"other\", \"revision-one\""),
    );

    assert_eq!(response.status, 304);
    assert!(response.body_empty);
    assert_eq!(response.cache_control, Some(PUBLIC_DELIVERY_CACHE_CONTROL));
}
