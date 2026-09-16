BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(3);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM private.ai_live_model_prices
    WHERE model_id IN ('gemini-3.8-live', 'gemini-3.8-live-extended-thinking')
      AND input_audio_per_million = 3 AND output_audio_per_million = 12
      AND output_text_per_million = 4.5 AND effective_at <= now()$$,
  ARRAY[2::bigint], 'Both modes have effective provider pricing'
);
SELECT results_eq(
  $$SELECT count(*)::bigint FROM private.ai_gateway_models
    WHERE id IN ('google/gemini-3.8-live', 'google/gemini-3.8-live-extended-thinking')
      AND type = 'audio' AND max_tokens = 65536$$,
  ARRAY[2::bigint], 'Both models are registered with audio capability'
);
SELECT is_empty(
  $$SELECT id FROM public.ai_credit_plan_allocations
    WHERE is_active AND 'google/gemini-3.1-flash-live-preview' = ANY(allowed_models)
      AND NOT (allowed_models @> ARRAY['google/gemini-3.8-live', 'google/gemini-3.8-live-extended-thinking'])$$,
  'Existing Live allowlists permit both replacement models'
);
SELECT * FROM finish();
ROLLBACK;
