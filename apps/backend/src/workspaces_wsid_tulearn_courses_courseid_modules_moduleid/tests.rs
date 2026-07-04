use super::*;

// --- Path extraction ---

#[test]
fn test_extract_route_params_valid() {
    let path = "/api/v1/workspaces/ws-123/tulearn/courses/course-abc/modules/mod-xyz";
    let params = extract_route_params(path).expect("should match");
    assert_eq!(params.raw_ws_id, "ws-123");
    assert_eq!(params.course_id, "course-abc");
    assert_eq!(params.module_id, "mod-xyz");
}

#[test]
fn test_extract_route_params_trailing_slash() {
    // trim_matches('/') removes the trailing slash before splitting, so the
    // path still produces 9 segments and matches correctly.
    let path = "/api/v1/workspaces/ws-123/tulearn/courses/course-abc/modules/mod-xyz/";
    let params = extract_route_params(path).expect("should match after trim");
    assert_eq!(params.raw_ws_id, "ws-123");
    assert_eq!(params.module_id, "mod-xyz");
}

#[test]
fn test_extract_route_params_wrong_path() {
    assert!(extract_route_params("/api/v1/workspaces/ws/tulearn/home").is_none());
    assert!(extract_route_params("/api/v1/workspaces/ws/courses/course/modules/mod").is_none());
}

#[test]
fn test_extract_route_params_empty_segment() {
    let path = "/api/v1/workspaces//tulearn/courses/course-abc/modules/mod-xyz";
    assert!(extract_route_params(path).is_none());
}

// --- Workspace id helpers ---

#[test]
fn test_is_workspace_uuid_literal() {
    assert!(is_workspace_uuid_literal(
        "00000000-0000-0000-0000-000000000000"
    ));
    assert!(is_workspace_uuid_literal(
        "550e8400-e29b-41d4-a716-446655440000"
    ));
    assert!(!is_workspace_uuid_literal("personal"));
    assert!(!is_workspace_uuid_literal("too-short"));
}

#[test]
fn test_resolve_workspace_id_internal() {
    assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
    assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
    assert_eq!(resolve_workspace_id("my-handle"), "my-handle");
}

// --- stable_choice_rank ---

#[test]
fn test_stable_choice_rank_deterministic() {
    let r1 = stable_choice_rank("quiz-id", "apple", 0);
    let r2 = stable_choice_rank("quiz-id", "apple", 0);
    assert_eq!(r1, r2);
}

#[test]
fn test_stable_choice_rank_differs_by_value() {
    let ra = stable_choice_rank("quiz-id", "apple", 0);
    let rb = stable_choice_rank("quiz-id", "banana", 0);
    assert_ne!(ra, rb);
}

// --- get_matching_pairs ---

#[test]
fn test_get_matching_pairs_from_array() {
    let content = json!([
        { "left": "A", "right": "1" },
        { "left": "B", "right": "2" }
    ]);
    let pairs = get_matching_pairs(&content);
    assert_eq!(pairs.len(), 2);
    assert_eq!(pairs[0], ("A".to_owned(), "1".to_owned()));
    assert_eq!(pairs[1], ("B".to_owned(), "2".to_owned()));
}

#[test]
fn test_get_matching_pairs_from_object_with_pairs_key() {
    let content = json!({
        "pairs": [
            { "left": "X", "right": "Y" }
        ]
    });
    let pairs = get_matching_pairs(&content);
    assert_eq!(pairs.len(), 1);
    assert_eq!(pairs[0], ("X".to_owned(), "Y".to_owned()));
}

#[test]
fn test_get_matching_pairs_filters_empty() {
    let content = json!([
        { "left": "", "right": "1" },
        { "left": "A", "right": "2" }
    ]);
    let pairs = get_matching_pairs(&content);
    assert_eq!(pairs.len(), 1);
    assert_eq!(pairs[0].0, "A");
}

// --- sanitize_learner_quiz ---

#[test]
fn test_sanitize_removes_answer_field() {
    let quiz = json!({
        "id": "q1",
        "type": "multiple_choice",
        "question": "What?",
        "content": null,
        "score": 1,
        "answer": "secret"
    });
    let sanitized = sanitize_learner_quiz(quiz);
    assert!(sanitized.get("answer").is_none());
    assert_eq!(sanitized["type"], "multiple_choice");
}

#[test]
fn test_sanitize_matching_replaces_content() {
    let quiz = json!({
        "id": "q2",
        "type": "matching",
        "question": "Match",
        "content": [
            { "left": "A", "right": "1" },
            { "left": "B", "right": "2" }
        ],
        "score": 1
    });
    let sanitized = sanitize_learner_quiz(quiz);
    let content = &sanitized["content"];
    assert!(content.get("choices").is_some());
    assert!(content.get("pairs").is_some());
    let pairs = content["pairs"].as_array().unwrap();
    // Each pair should only have "left".
    for pair in pairs {
        assert!(pair.get("left").is_some());
        assert!(pair.get("right").is_none());
    }
}

// --- in_list ---

#[test]
fn test_in_list_formats_correctly() {
    let ids = vec!["id1".to_owned(), "id2".to_owned()];
    assert_eq!(in_list(&ids), r#"("id1","id2")"#);
}

// --- student_id_from_url ---

#[test]
fn test_student_id_from_url_present() {
    let url = "https://example.com/path?studentId=abc123";
    assert_eq!(student_id_from_url(Some(url)), Some("abc123".to_owned()));
}

#[test]
fn test_student_id_from_url_empty() {
    let url = "https://example.com/path?studentId=";
    assert_eq!(student_id_from_url(Some(url)), None);
}

#[test]
fn test_student_id_from_url_absent() {
    let url = "https://example.com/path";
    assert_eq!(student_id_from_url(Some(url)), None);
}
