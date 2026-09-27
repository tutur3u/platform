use serde::Serialize;

#[derive(Serialize)]
pub(super) struct QueueItem {
    pub(super) group_id: String,
    pub(super) student_user_id: String,
    pub(super) group_name: String,
    pub(super) student_name: String,
    pub(super) reason_type: String,
    pub(super) absence_deficit: u32,
    pub(super) missed_class_dates: Vec<String>,
    pub(super) feedback_content: String,
    pub(super) feedback_created_at: Option<String>,
    pub(super) source_feedback_id: Option<String>,
    pub(super) content_review_due: bool,
    pub(super) content_unchanged_since: Option<String>,
    pub(super) review_only: bool,
}

#[derive(Serialize)]
pub(super) struct QueueSummary {
    pub(super) absent: u32,
    pub(super) weak: u32,
    pub(super) review_due: u32,
}

#[derive(Serialize)]
pub(super) struct QueueResponse {
    pub(super) data: Vec<QueueItem>,
    pub(super) count: usize,
    pub(super) page: u32,
    #[serde(rename = "pageSize")]
    pub(super) page_size: u32,
    pub(super) summary: QueueSummary,
    #[serde(rename = "totalPages")]
    pub(super) total_pages: u32,
}

pub(super) fn summarize_queue(queue: &[QueueItem]) -> QueueSummary {
    let mut summary = QueueSummary {
        absent: 0,
        weak: 0,
        review_due: 0,
    };
    for item in queue {
        if item.reason_type == "ABSENT_RECOVERY" || item.reason_type == "BOTH" {
            summary.absent += 1;
        }
        if !item.review_only && (item.reason_type == "WEAK_SUPPORT" || item.reason_type == "BOTH") {
            summary.weak += 1;
        }
        if item.content_review_due {
            summary.review_due += 1;
        }
    }
    summary
}
