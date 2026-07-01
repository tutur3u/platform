use super::*;

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub(super) struct HabitTracker {
    pub(super) id: String,
    pub(super) ws_id: String,
    pub(super) name: String,
    pub(super) description: Option<String>,
    pub(super) color: String,
    pub(super) icon: String,
    pub(super) tracking_mode: String,
    pub(super) target_period: String,
    pub(super) target_operator: String,
    pub(super) target_value: f64,
    pub(super) primary_metric_key: String,
    pub(super) aggregation_strategy: String,
    pub(super) input_schema: Value,
    pub(super) quick_add_values: Vec<f64>,
    pub(super) freeze_allowance: f64,
    pub(super) recovery_window_periods: f64,
    pub(super) use_case: String,
    pub(super) template_category: String,
    pub(super) composer_mode: String,
    pub(super) composer_config: Value,
    pub(super) start_date: String,
    pub(super) created_by: Option<String>,
    pub(super) is_active: bool,
    pub(super) archived_at: Option<String>,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

#[derive(Clone, Debug)]
pub(super) struct Member {
    pub(super) user_id: String,
    pub(super) workspace_user_id: Option<String>,
    pub(super) display_name: String,
    pub(super) email: Option<String>,
    pub(super) avatar_url: Option<String>,
}

/// Streak-engine view of an entry (subset).
#[derive(Clone, Debug)]
pub(super) struct HabitEntry {
    pub(super) user_id: String,
    pub(super) entry_date: String,
    pub(super) occurred_at: String,
    pub(super) primary_value: Option<f64>,
    /// The normalized `values` map (object) as raw JSON.
    pub(super) values: Value,
    /// The full `mapEntryRow` JSON object (for the response `entries` array).
    pub(super) full: Map<String, Value>,
}

#[derive(Clone, Debug)]
pub(super) struct StreakAction {
    pub(super) user_id: String,
    pub(super) action_type: String,
    pub(super) period_start: String,
}

#[derive(Clone, Debug)]
pub(super) struct LatestStat {
    pub(super) latest_entry_id: Option<String>,
    pub(super) latest_entry_date: Option<String>,
    pub(super) latest_occurred_at: Option<String>,
    pub(super) latest_primary_value: Option<f64>,
    pub(super) latest_values: Option<Value>,
}
