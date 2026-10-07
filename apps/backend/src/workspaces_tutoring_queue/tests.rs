use super::*;

fn query() -> TutoringQueueQuery {
    TutoringQueueQuery {
        page: 1,
        page_size: 20,
        ..TutoringQueueQuery::default()
    }
}

fn policy() -> QueuePolicy {
    QueuePolicy {
        reassessment_days: 14,
        absence_lookback_days: 28,
        weak_content_review_days: 0,
        group_exclusions: vec![],
    }
}

#[test]
fn pending_recovery_reserves_an_absence_without_hiding_other_missing_sessions() {
    let attendance = || AttendanceRow {
        date: Some("2026-09-20".into()),
        group_id: Some("group".into()),
        user_id: Some("student".into()),
        group: None,
        user: None,
    };
    let pending = ReservedSessionRow {
        session_date: Some("2026-09-28".into()),
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
        &policy(),
        iso_day("2026-09-27").unwrap(),
    );
    assert_eq!(response.count, 1);
    assert_eq!(response.data[0].absence_deficit, 1);
    assert_eq!(response.data[0].missed_class_dates, ["2026-09-20"]);
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
        session_date: Some("2026-09-28".into()),
        group_id: Some("group".into()),
        student_user_id: Some("student".into()),
        reason_type: Some("WEAK_SUPPORT".into()),
        attendance_status: Some("PENDING".into()),
        source_feedback_id: Some("feedback".into()),
        resolved_at: None,
    };
    assert_eq!(
        build_queue_response(
            &query(),
            vec![],
            vec![pending],
            vec![feedback],
            &policy(),
            iso_day("2026-09-27").unwrap()
        )
        .count,
        0
    );
}

#[test]
fn historical_absence_and_recovery_do_not_distort_recent_deficit() {
    let absence = |date: &str| AttendanceRow {
        date: Some(date.into()),
        group_id: Some("group".into()),
        user_id: Some("student".into()),
        group: None,
        user: None,
    };
    let old_recovery = ReservedSessionRow {
        session_date: Some("2026-07-05".into()),
        group_id: Some("group".into()),
        student_user_id: Some("student".into()),
        reason_type: Some("ABSENT_RECOVERY".into()),
        attendance_status: Some("DONE".into()),
        source_feedback_id: None,
        resolved_at: None,
    };
    let response = build_queue_response(
        &query(),
        vec![absence("2026-07-01"), absence("2026-09-20")],
        vec![old_recovery],
        vec![],
        &policy(),
        iso_day("2026-09-27").unwrap(),
    );
    assert_eq!(response.data[0].absence_deficit, 1);
    assert_eq!(response.data[0].missed_class_dates, ["2026-09-20"]);
}

#[test]
fn pending_support_still_shows_stale_content_for_office_review() {
    let feedback = FeedbackRow {
        id: Some("feedback".into()),
        content: Some("Needs reading support".into()),
        created_at: Some("2026-09-01T00:00:00Z".into()),
        user_id: Some("student".into()),
        group_id: Some("group".into()),
        user: None,
        group: None,
    };
    let pending = ReservedSessionRow {
        session_date: Some("2026-09-28".into()),
        group_id: Some("group".into()),
        student_user_id: Some("student".into()),
        reason_type: Some("WEAK_SUPPORT".into()),
        attendance_status: Some("PENDING".into()),
        source_feedback_id: Some("feedback".into()),
        resolved_at: None,
    };
    let mut policy = policy();
    policy.weak_content_review_days = 14;
    let response = build_queue_response(
        &query(),
        vec![],
        vec![pending],
        vec![feedback],
        &policy,
        iso_day("2026-09-27").unwrap(),
    );
    assert_eq!(response.count, 1);
    assert!(response.data[0].review_only);
    assert!(response.data[0].content_review_due);
    assert_eq!(response.summary.weak, 0);
    assert_eq!(response.summary.review_due, 1);
}

#[test]
fn earlier_make_up_cannot_consume_later_absence_for_either_reserved_status() {
    for status in ["DONE", "PENDING"] {
        let response = build_queue_response(
            &query(),
            vec![AttendanceRow {
                date: Some("2026-09-20".into()),
                group_id: Some("group".into()),
                user_id: Some("student".into()),
                group: None,
                user: None,
            }],
            vec![ReservedSessionRow {
                session_date: Some("2026-09-10".into()),
                group_id: Some("group".into()),
                student_user_id: Some("student".into()),
                reason_type: Some("ABSENT_RECOVERY".into()),
                attendance_status: Some(status.into()),
                source_feedback_id: None,
                resolved_at: None,
            }],
            vec![],
            &policy(),
            iso_day("2026-09-27").unwrap(),
        );
        assert_eq!(response.data[0].absence_deficit, 1);
        assert_eq!(response.data[0].missed_class_dates, ["2026-09-20"]);
    }
}

#[test]
fn chronological_matching_preserves_same_day_multiplicity_and_skips_early_reservations() {
    let dates = |values: &[&str]| values.iter().map(|value| (*value).to_owned()).collect();
    assert_eq!(
        super::absence_credits::unmatched_dates(
            dates(&["2026-09-25", "2026-09-20", "2026-09-10", "2026-09-20"]),
            dates(&["2026-09-21", "2026-09-05", "2026-09-12"]),
        ),
        ["2026-09-20", "2026-09-25"]
    );
    assert!(
        super::absence_credits::unmatched_dates(dates(&["2026-09-20"]), dates(&["2026-09-25"]))
            .is_empty()
    );
}

#[test]
fn credits_remain_scoped_to_the_original_group_and_student() {
    let reservation = |group: &str, student: &str| ReservedSessionRow {
        session_date: Some("2026-09-25".into()),
        group_id: Some(group.into()),
        student_user_id: Some(student.into()),
        reason_type: Some("ABSENT_RECOVERY".into()),
        attendance_status: Some("PENDING".into()),
        source_feedback_id: None,
        resolved_at: None,
    };
    let response = build_queue_response(
        &query(),
        vec![AttendanceRow {
            date: Some("2026-09-20".into()),
            group_id: Some("group".into()),
            user_id: Some("student".into()),
            group: None,
            user: None,
        }],
        vec![
            reservation("other-group", "student"),
            reservation("group", "other-student"),
        ],
        vec![],
        &policy(),
        iso_day("2026-09-27").unwrap(),
    );
    assert_eq!(response.data[0].absence_deficit, 1);
    assert_eq!(response.data[0].missed_class_dates, ["2026-09-20"]);
}
