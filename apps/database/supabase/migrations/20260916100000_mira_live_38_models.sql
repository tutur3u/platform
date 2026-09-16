-- Apply before deploying Gemini 3.8 Mira Live modes. Existing sessions retain
-- their original pricing snapshot. Published prices checked 2026-09-16:
-- https://ai.google.dev/gemini-api/docs/pricing
INSERT INTO private.ai_live_model_prices (
  model_id, input_text_per_million, input_audio_per_million,
  input_image_video_per_million, output_text_per_million,
  output_audio_per_million, search_per_query, source_url, effective_at
)
SELECT model_id, 0.75, 3.00, 1.00, 4.50, 12.00, 0.014,
  'https://ai.google.dev/gemini-api/docs/pricing', '2026-09-15T00:00:00Z'::timestamptz
FROM unnest(ARRAY['gemini-3.8-live', 'gemini-3.8-live-extended-thinking']) AS model_id
ON CONFLICT (model_id, effective_at) DO NOTHING;

INSERT INTO private.ai_gateway_models (
  id, name, provider, description, type, context_window, max_tokens, tags,
  input_price_per_token, output_price_per_token, is_enabled, synced_at
)
SELECT 'google/' || model_id, name, 'google', description, 'audio',
  131072, 65536, ARRAY['audio', 'live', 'gemini'],
  0.00000075, 0.0000045, true, now()
FROM (VALUES
  ('gemini-3.8-live', 'Gemini 3.8 Live', 'Mira Live Flash: low-latency voice and vision.'),
  ('gemini-3.8-live-extended-thinking', 'Gemini 3.8 Live Extended Thinking', 'Mira Live Pro: background reasoning and asynchronous tools.')
) AS models(model_id, name, description)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  type = EXCLUDED.type, context_window = EXCLUDED.context_window,
  max_tokens = EXCLUDED.max_tokens, tags = EXCLUDED.tags,
  input_price_per_token = EXCLUDED.input_price_per_token,
  output_price_per_token = EXCLUDED.output_price_per_token,
  synced_at = now();

-- Preserve unrestricted plans and only extend plans already allowing Live.
UPDATE public.ai_credit_plan_allocations
SET allowed_models = ARRAY(
  SELECT DISTINCT model_id FROM unnest(allowed_models || ARRAY[
    'google/gemini-3.8-live', 'google/gemini-3.8-live-extended-thinking'
  ]) AS model_id
), updated_at = now()
WHERE is_active
  AND 'google/gemini-3.1-flash-live-preview' = ANY(allowed_models);
