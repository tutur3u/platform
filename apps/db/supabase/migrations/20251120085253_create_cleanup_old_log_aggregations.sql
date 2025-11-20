-- Function to cleanup old aggregated logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_log_aggregations()
RETURNS void AS $$
BEGIN
    DELETE FROM public.realtime_log_aggregations
    WHERE time_bucket < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the cleanup job using pg_cron (if available)
-- Note: This requires the pg_cron extension to be enabled
SELECT cron.schedule(
    'cleanup-old-log-aggregations', -- unique job name
    '0 0 * * *',                    -- cron schedule (every day at midnight)
    $$SELECT cleanup_old_log_aggregations()$$
);