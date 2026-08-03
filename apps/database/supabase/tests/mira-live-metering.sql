BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(14);

SELECT ok(
  to_regclass('private.ai_live_model_prices') IS NOT NULL,
  'Live model pricing is private'
);
SELECT ok(
  to_regclass('private.ai_live_sessions') IS NOT NULL,
  'Live billing sessions are private'
);
SELECT ok(
  to_regprocedure(
    'private.begin_ai_live_session(uuid,uuid,uuid,text,timestamp with time zone)'
  ) IS NOT NULL,
  'Live reservation RPC exists'
);
SELECT ok(
  to_regprocedure(
    'private.settle_ai_live_session(uuid,uuid,integer,jsonb,boolean)'
  ) IS NOT NULL,
  'Live settlement RPC exists'
);
SELECT ok(
  to_regprocedure('private.expire_ai_live_sessions(uuid)') IS NOT NULL,
  'Live expiry RPC exists'
);
SELECT results_eq(
  $$SELECT count(*)::BIGINT FROM private.ai_live_model_prices
    WHERE model_id = 'gemini-3.1-flash-live-preview'
      AND input_audio_per_million = 3
      AND output_audio_per_million = 12$$,
  ARRAY[1::BIGINT],
  'Gemini Live audio prices are versioned'
);
SELECT results_eq(
  $$SELECT count(*)::BIGINT FROM public.ai_credit_feature_access
    WHERE feature = 'voice_live' AND enabled$$,
  ARRAY[4::BIGINT],
  'Live credits are enabled for every tier'
);
SELECT results_eq(
  $$SELECT count(*)::BIGINT FROM public.ai_credit_plan_allocations
    WHERE 'voice_live' = ANY(allowed_features)$$,
  ARRAY[4::BIGINT],
  'Every active plan allocation permits Live credits'
);

CREATE TEMP TABLE mira_live_test_context AS
SELECT wm.user_id, wm.ws_id
FROM public.workspace_members AS wm
ORDER BY wm.created_at
LIMIT 1;

CREATE TEMP TABLE mira_live_test_start AS
SELECT started.*, context.user_id, context.ws_id
FROM mira_live_test_context AS context
CROSS JOIN LATERAL private.begin_ai_live_session(
  context.user_id,
  context.ws_id,
  context.ws_id,
  'gemini-3.1-flash-live-preview',
  now() + interval '5 minutes'
) AS started;

SELECT ok(
  (SELECT success AND live_session_id IS NOT NULL
    AND reservation_id IS NOT NULL AND reserved_credits = 2000
    FROM mira_live_test_start),
  'Live start atomically creates a capped reservation and billing session'
);
SELECT results_eq(
  $$SELECT count(*)::BIGINT
    FROM private.ai_credit_reservations AS reservation
    JOIN mira_live_test_start AS started
      ON started.reservation_id = reservation.id
    WHERE reservation.status = 'reserved'
      AND reservation.feature = 'voice_live'
      AND reservation.model_id = 'google/gemini-3.1-flash-live-preview'$$,
  ARRAY[1::BIGINT],
  'Live start binds the reservation to the Live feature and model'
);

CREATE TEMP TABLE mira_live_test_usage AS
SELECT settled.*
FROM mira_live_test_start AS started
CROSS JOIN LATERAL private.settle_ai_live_session(
  started.live_session_id,
  started.user_id,
  0,
  jsonb_build_object(
    'inputTextTokens', 1000,
    'inputAudioTokens', 0,
    'inputImageTokens', 0,
    'inputVideoTokens', 0,
    'outputTextTokens', 0,
    'outputAudioTokens', 0,
    'thinkingTokens', 0,
    'searchQueries', 0
  ),
  false
) AS settled;

SELECT ok(
  (SELECT success AND provider_cost_usd = 0.00075
    AND billed_credits > 0 AND NOT closed
    FROM mira_live_test_usage),
  'Live settlement prices cumulative modality usage with the versioned rate'
);
SELECT results_eq(
  $$SELECT replay.billed_credits
    FROM mira_live_test_start AS started
    CROSS JOIN LATERAL private.settle_ai_live_session(
      started.live_session_id, started.user_id, 0,
      jsonb_build_object(
        'inputTextTokens', 1000, 'inputAudioTokens', 0,
        'inputImageTokens', 0, 'inputVideoTokens', 0,
        'outputTextTokens', 0, 'outputAudioTokens', 0,
        'thinkingTokens', 0, 'searchQueries', 0
      ), false
    ) AS replay$$,
  $$SELECT billed_credits FROM mira_live_test_usage$$,
  'Replaying a sequence is idempotent'
);
SELECT results_eq(
  $$SELECT regression.error_code
    FROM mira_live_test_start AS started
    CROSS JOIN LATERAL private.settle_ai_live_session(
      started.live_session_id, started.user_id, 1,
      jsonb_build_object(
        'inputTextTokens', 999, 'inputAudioTokens', 0,
        'inputImageTokens', 0, 'inputVideoTokens', 0,
        'outputTextTokens', 0, 'outputAudioTokens', 0,
        'thinkingTokens', 0, 'searchQueries', 0
      ), false
    ) AS regression$$,
  ARRAY['USAGE_REGRESSION'::TEXT],
  'Regressing cumulative usage is rejected'
);

CREATE TEMP TABLE mira_live_test_close AS
SELECT closed.*
FROM mira_live_test_start AS started
CROSS JOIN LATERAL private.settle_ai_live_session(
  started.live_session_id, started.user_id, 2,
  jsonb_build_object(
    'inputTextTokens', 1000, 'inputAudioTokens', 0,
    'inputImageTokens', 0, 'inputVideoTokens', 0,
    'outputTextTokens', 0, 'outputAudioTokens', 0,
    'thinkingTokens', 0, 'searchQueries', 0
  ), true
) AS closed;

SELECT ok(
  (SELECT closed.closed
      AND (SELECT count(*) FROM public.ai_credit_transactions AS txn
        WHERE txn.metadata ->> 'live_session_id' = started.live_session_id::TEXT) = 1
      AND (SELECT reservation.status = 'committed'
        FROM private.ai_credit_reservations AS reservation
        WHERE reservation.id = started.reservation_id)
    FROM mira_live_test_start AS started
    CROSS JOIN mira_live_test_close AS closed),
  'Closing commits one auditable transaction and releases the unused hold'
);

SELECT * FROM finish();
ROLLBACK;
