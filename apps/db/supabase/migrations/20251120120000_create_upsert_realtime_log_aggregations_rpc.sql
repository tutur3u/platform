-- Create RPC function to upsert realtime log aggregations with additive counts on conflict

CREATE OR REPLACE FUNCTION upsert_realtime_log_aggregations(
  p_logs jsonb
)
RETURNS void AS $$
DECLARE
  log_item jsonb;
BEGIN
  -- Iterate through each log in the array
  FOR log_item IN SELECT jsonb_array_elements(p_logs)
  LOOP
    INSERT INTO public.realtime_log_aggregations (
      ws_id,
      user_id,
      channel_id,
      time_bucket,
      kind,
      total_count,
      error_count,
      sample_messages
    )
    VALUES (
      (log_item->>'ws_id')::uuid,
      (log_item->>'user_id')::uuid,
      (log_item->>'channel_id')::text,
      (log_item->>'time_bucket')::timestamptz,
      (log_item->>'kind')::text,
      (log_item->>'total_count')::integer,
      (log_item->>'error_count')::integer,
      ARRAY(SELECT jsonb_array_elements_text(log_item->'sample_messages'))
    )
    ON CONFLICT (ws_id, user_id, channel_id, time_bucket, kind)
    DO UPDATE SET
      total_count = realtime_log_aggregations.total_count + (log_item->>'total_count')::integer,
      error_count = realtime_log_aggregations.error_count + (log_item->>'error_count')::integer,
      sample_messages = ARRAY(SELECT jsonb_array_elements_text(log_item->'sample_messages'));
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and anon
GRANT EXECUTE ON FUNCTION upsert_realtime_log_aggregations(jsonb) TO authenticated, anon;
