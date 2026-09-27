use super::*;

fn query() -> TutoringQueueQuery {
    TutoringQueueQuery {
        page: 1,
        page_size: 20,
        ..TutoringQueueQuery::default()
    }
}

#[test]
fn pending_recovery_reserves_an_absence_without_hiding_other_missing_sessions() {
    let attendance = || AttendanceRow {
        group_id: Some("group".into()),
        user_id: Some("student".into()),
        group: None,
        user: None,
    };
    let pending = ReservedSessionRow {
        group_id: Some("group".into()),
        student_user_id: Some("student".into()),
        reason_type: Some("ABSENT_RECOVERY".into()),
        attendance_status: Some("PENDING".into()),
        source_feedback_id: None,
        resolved_at: None,
    };
    let response = build_queue_response(
        &query(),
        vec![attendance(), attendance()],
        vec![pending],
        vec![],
        14,
        20_000,
    );
    assert_eq!(response.count, 1);
    assert_eq!(response.data[0].absence_deficit, 1);
}

#[test]
fn pending_feedback_support_is_not_suggested_twice() {
    let feedback = FeedbackRow {
        id: Some("feedback".into()),
        content: Some("Needs reading support".into()),
        created_at: Some("2026-09-20T00:00:00Z".into()),
        user_id: Some("student".into()),
        group_id: Some("group".into()),
        user: None,
        group: None,
    };
    let pending = ReservedSessionRow {
        group_id: Some("group".into()),
        student_user_id: Some("student".into()),
        reason_type: Some("WEAK_SUPPORT".into()),
        attendance_status: Some("PENDING".into()),
        source_feedback_id: Some("feedback".into()),
        resolved_at: None,
    };
    assert_eq!(
        build_queue_response(&query(), vec![], vec![pending], vec![feedback], 14, 20_000).count,
        0
    );
}
