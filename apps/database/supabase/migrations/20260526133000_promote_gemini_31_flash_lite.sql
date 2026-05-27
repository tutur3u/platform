DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ai_gateway_models
    WHERE id = 'google/gemini-3.1-flash-lite'
  ) THEN
    UPDATE public.ai_credit_plan_allocations
    SET
      default_language_model = CASE
        WHEN default_language_model IN (
          'google/gemini-3.1-flash-lite-preview',
          'gemini-3.1-flash-lite-preview'
        ) THEN 'google/gemini-3.1-flash-lite'
        ELSE default_language_model
      END,
      allowed_models = array_replace(
        array_replace(
          allowed_models,
          'google/gemini-3.1-flash-lite-preview',
          'google/gemini-3.1-flash-lite'
        ),
        'gemini-3.1-flash-lite-preview',
        'google/gemini-3.1-flash-lite'
      ),
      updated_at = now()
    WHERE default_language_model IN (
      'google/gemini-3.1-flash-lite-preview',
      'gemini-3.1-flash-lite-preview'
    )
    OR allowed_models && ARRAY[
      'google/gemini-3.1-flash-lite-preview',
      'gemini-3.1-flash-lite-preview'
    ];
  END IF;
END
$$;
