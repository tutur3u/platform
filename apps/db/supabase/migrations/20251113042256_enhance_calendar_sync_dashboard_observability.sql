-- Enhance calendar_sync_dashboard table with comprehensive observability metrics
-- This migration adds detailed performance, error tracking, API metrics, and data volume fields
-- for production sync optimization and debugging

-- Performance timing breakdowns (in milliseconds)
ALTER TABLE calendar_sync_dashboard
ADD COLUMN timing_google_api_fetch_ms integer,
ADD COLUMN timing_token_operations_ms integer,
ADD COLUMN timing_event_processing_ms integer,
ADD COLUMN timing_database_writes_ms integer,
ADD COLUMN timing_total_ms integer;

-- API performance metrics
ALTER TABLE calendar_sync_dashboard
ADD COLUMN google_api_calls_count integer DEFAULT 0,
ADD COLUMN google_api_pages_fetched integer DEFAULT 0,
ADD COLUMN google_api_retry_count integer DEFAULT 0,
ADD COLUMN google_api_error_code text;

-- Data volume metrics
ALTER TABLE calendar_sync_dashboard
ADD COLUMN events_fetched_total integer DEFAULT 0,
ADD COLUMN events_filtered_out integer DEFAULT 0,
ADD COLUMN batch_count integer DEFAULT 0,
ADD COLUMN payload_size_bytes bigint;

-- Error tracking and diagnostics
ALTER TABLE calendar_sync_dashboard
ADD COLUMN error_message text,
ADD COLUMN error_type text, -- 'auth' | 'network' | 'api_limit' | 'validation' | 'database' | 'unknown'
ADD COLUMN error_stack_trace text,
ADD COLUMN failed_event_ids jsonb; -- Array of event IDs that failed to sync

-- Calendar-specific metrics
ALTER TABLE calendar_sync_dashboard
ADD COLUMN calendar_ids_synced text[], -- Array of calendar IDs included in this sync
ADD COLUMN calendar_connection_count integer DEFAULT 0;

-- Sync coordination and context
ALTER TABLE calendar_sync_dashboard
ADD COLUMN was_blocked_by_cooldown boolean DEFAULT false,
ADD COLUMN cooldown_remaining_seconds integer,
ADD COLUMN sync_token_used boolean DEFAULT false,
ADD COLUMN date_range_start timestamptz,
ADD COLUMN date_range_end timestamptz,
ADD COLUMN triggered_from text; -- 'ui_button' | 'auto_refresh' | 'trigger_dev' | 'api_call'

-- Add comments for documentation
COMMENT ON COLUMN calendar_sync_dashboard.timing_google_api_fetch_ms IS 'Time spent fetching events from Google Calendar API';
COMMENT ON COLUMN calendar_sync_dashboard.timing_token_operations_ms IS 'Time spent on token retrieval and refresh operations';
COMMENT ON COLUMN calendar_sync_dashboard.timing_event_processing_ms IS 'Time spent processing and filtering events';
COMMENT ON COLUMN calendar_sync_dashboard.timing_database_writes_ms IS 'Time spent writing to database (upserts and deletes)';
COMMENT ON COLUMN calendar_sync_dashboard.timing_total_ms IS 'Total sync duration calculated from start_time and end_time';

COMMENT ON COLUMN calendar_sync_dashboard.google_api_calls_count IS 'Number of API calls made to Google Calendar';
COMMENT ON COLUMN calendar_sync_dashboard.google_api_pages_fetched IS 'Number of pagination pages fetched from Google Calendar';
COMMENT ON COLUMN calendar_sync_dashboard.google_api_retry_count IS 'Number of retry attempts due to API errors';
COMMENT ON COLUMN calendar_sync_dashboard.google_api_error_code IS 'HTTP error code or API error identifier from Google';

COMMENT ON COLUMN calendar_sync_dashboard.events_fetched_total IS 'Total number of events fetched from Google before filtering';
COMMENT ON COLUMN calendar_sync_dashboard.events_filtered_out IS 'Number of events filtered out (e.g., outside date range)';
COMMENT ON COLUMN calendar_sync_dashboard.batch_count IS 'Number of database batch operations performed';
COMMENT ON COLUMN calendar_sync_dashboard.payload_size_bytes IS 'Total size of data transferred from Google Calendar API';

COMMENT ON COLUMN calendar_sync_dashboard.error_message IS 'Human-readable error message for failed syncs';
COMMENT ON COLUMN calendar_sync_dashboard.error_type IS 'Categorized error type for analytics and alerting';
COMMENT ON COLUMN calendar_sync_dashboard.error_stack_trace IS 'Full stack trace for debugging production issues';
COMMENT ON COLUMN calendar_sync_dashboard.failed_event_ids IS 'JSONB array of Google Calendar event IDs that failed to sync';

COMMENT ON COLUMN calendar_sync_dashboard.calendar_ids_synced IS 'Array of Google Calendar IDs included in this sync operation';
COMMENT ON COLUMN calendar_sync_dashboard.calendar_connection_count IS 'Number of calendar connections processed in this sync';

COMMENT ON COLUMN calendar_sync_dashboard.was_blocked_by_cooldown IS 'Whether sync was initially blocked by 30-second cooldown coordination';
COMMENT ON COLUMN calendar_sync_dashboard.cooldown_remaining_seconds IS 'Seconds remaining in cooldown when sync was attempted';
COMMENT ON COLUMN calendar_sync_dashboard.sync_token_used IS 'Whether incremental sync token was used (vs full date range fetch)';
COMMENT ON COLUMN calendar_sync_dashboard.date_range_start IS 'Start date for event fetching (if not using sync token)';
COMMENT ON COLUMN calendar_sync_dashboard.date_range_end IS 'End date for event fetching (if not using sync token)';
COMMENT ON COLUMN calendar_sync_dashboard.triggered_from IS 'Source that initiated the sync operation';

-- Create index on error_type for faster error analytics queries
CREATE INDEX IF NOT EXISTS idx_calendar_sync_dashboard_error_type ON calendar_sync_dashboard(error_type) WHERE error_type IS NOT NULL;

-- Create index on triggered_from for source analytics
CREATE INDEX IF NOT EXISTS idx_calendar_sync_dashboard_triggered_from ON calendar_sync_dashboard(triggered_from) WHERE triggered_from IS NOT NULL;

-- Create index on timing_total_ms for performance analytics
CREATE INDEX IF NOT EXISTS idx_calendar_sync_dashboard_timing_total ON calendar_sync_dashboard(timing_total_ms) WHERE timing_total_ms IS NOT NULL;
