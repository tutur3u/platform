ALTER TABLE public.ai_credit_plan_allocations
ADD COLUMN IF NOT EXISTS default_language_model TEXT
REFERENCES public.ai_gateway_models(id)
ON UPDATE CASCADE
ON DELETE RESTRICT;

ALTER TABLE public.ai_credit_plan_allocations
ADD COLUMN IF NOT EXISTS default_image_model TEXT
REFERENCES public.ai_gateway_models(id)
ON UPDATE CASCADE
ON DELETE RESTRICT;

UPDATE public.ai_credit_plan_allocations
SET default_language_model = CASE tier
  WHEN 'FREE' THEN (
    SELECT id FROM public.ai_gateway_models
    WHERE id = 'google/gemini-2.0-flash-lite'
  )
  WHEN 'PLUS' THEN (
    SELECT id FROM public.ai_gateway_models
    WHERE id = 'google/gemini-2.5-flash-lite'
  )
  WHEN 'PRO' THEN (
    SELECT id FROM public.ai_gateway_models
    WHERE id = 'google/gemini-2.5-flash'
  )
  WHEN 'ENTERPRISE' THEN (
    SELECT id FROM public.ai_gateway_models
    WHERE id = 'google/gemini-2.5-flash'
  )
  ELSE default_language_model
END
WHERE default_language_model IS NULL;

UPDATE public.ai_credit_plan_allocations
SET default_image_model = CASE tier
  WHEN 'FREE' THEN (
    SELECT id FROM public.ai_gateway_models
    WHERE id = 'google/imagen-4.0-fast-generate-001'
  )
  WHEN 'PLUS' THEN (
    SELECT id FROM public.ai_gateway_models
    WHERE id = 'google/imagen-4.0-generate-001'
  )
  WHEN 'PRO' THEN (
    SELECT id FROM public.ai_gateway_models
    WHERE id = 'google/imagen-4.0-generate-001'
  )
  WHEN 'ENTERPRISE' THEN (
    SELECT id FROM public.ai_gateway_models
    WHERE id = 'google/imagen-4.0-generate-001'
  )
  ELSE default_image_model
END
WHERE default_image_model IS NULL;

CREATE OR REPLACE FUNCTION public.validate_ai_credit_plan_allocation_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_language_type TEXT;
  v_image_type TEXT;
  v_language_enabled BOOLEAN;
  v_image_enabled BOOLEAN;
BEGIN
  IF NEW.default_language_model IS NOT NULL THEN
    SELECT type, is_enabled
      INTO v_language_type, v_language_enabled
      FROM public.ai_gateway_models
     WHERE id = NEW.default_language_model;

    IF v_language_type IS DISTINCT FROM 'language' THEN
      RAISE EXCEPTION
        'Default language model % must reference an enabled language gateway model',
        NEW.default_language_model;
    END IF;

    IF v_language_enabled IS NOT TRUE THEN
      RAISE EXCEPTION
        'Default language model % must remain enabled',
        NEW.default_language_model;
    END IF;
  END IF;

  IF NEW.default_image_model IS NOT NULL THEN
    SELECT type, is_enabled
      INTO v_image_type, v_image_enabled
      FROM public.ai_gateway_models
     WHERE id = NEW.default_image_model;

    IF v_image_type IS DISTINCT FROM 'image' THEN
      RAISE EXCEPTION
        'Default image model % must reference an enabled image gateway model',
        NEW.default_image_model;
    END IF;

    IF v_image_enabled IS NOT TRUE THEN
      RAISE EXCEPTION
        'Default image model % must remain enabled',
        NEW.default_image_model;
    END IF;
  END IF;

  IF COALESCE(array_length(NEW.allowed_models, 1), 0) > 0 THEN
    IF NEW.default_language_model IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM unnest(NEW.allowed_models) AS allowed_model
       WHERE allowed_model = NEW.default_language_model
          OR split_part(allowed_model, '/', 2) = split_part(NEW.default_language_model, '/', 2)
    ) THEN
      RAISE EXCEPTION
        'Default language model % must be included in allowed_models for tier %',
        NEW.default_language_model,
        NEW.tier;
    END IF;

    IF NEW.default_image_model IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM unnest(NEW.allowed_models) AS allowed_model
       WHERE allowed_model = NEW.default_image_model
          OR split_part(allowed_model, '/', 2) = split_part(NEW.default_image_model, '/', 2)
    ) THEN
      RAISE EXCEPTION
        'Default image model % must be included in allowed_models for tier %',
        NEW.default_image_model,
        NEW.tier;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_ai_credit_plan_allocation_defaults_trigger
ON public.ai_credit_plan_allocations;

CREATE TRIGGER validate_ai_credit_plan_allocation_defaults_trigger
BEFORE INSERT OR UPDATE OF allowed_models, default_language_model, default_image_model
ON public.ai_credit_plan_allocations
FOR EACH ROW
EXECUTE FUNCTION public.validate_ai_credit_plan_allocation_defaults();

CREATE OR REPLACE FUNCTION public.prevent_disabling_default_ai_gateway_models()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier public.workspace_product_tier;
BEGIN
  IF OLD.is_enabled IS TRUE AND NEW.is_enabled IS FALSE THEN
    SELECT tier
      INTO v_tier
      FROM public.ai_credit_plan_allocations
     WHERE default_language_model = OLD.id
        OR default_image_model = OLD.id
     LIMIT 1;

    IF v_tier IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot disable model % because it is configured as a default model for the % plan',
        OLD.id,
        v_tier;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_disabling_default_ai_gateway_models_trigger
ON public.ai_gateway_models;

CREATE TRIGGER prevent_disabling_default_ai_gateway_models_trigger
BEFORE UPDATE OF is_enabled
ON public.ai_gateway_models
FOR EACH ROW
EXECUTE FUNCTION public.prevent_disabling_default_ai_gateway_models();
