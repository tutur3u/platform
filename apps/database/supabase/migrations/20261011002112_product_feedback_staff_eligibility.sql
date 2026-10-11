-- Source only, unapplied. Requires the admitted canonical registry/source union,
-- intake160000 and staff170000 before this parent-reserved wrapper.
-- Reuse the accepted assertion; never recreate its authorization predicate.
DO $$ BEGIN
  IF pg_catalog.to_regprocedure('private.assert_product_feedback_staff(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Feedback staff assertion dependency unavailable';
  END IF;
END $$;

CREATE FUNCTION public.check_product_feedback_staff_eligibility(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '3s' SET lock_timeout = '500ms' AS $$
BEGIN
  PERFORM private.assert_product_feedback_staff(p_actor);
  RETURN pg_catalog.jsonb_build_object('eligible',true);
END;
$$;
REVOKE ALL ON FUNCTION public.check_product_feedback_staff_eligibility(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.check_product_feedback_staff_eligibility(uuid)
  TO service_role;
-- No helper EXECUTE grant, report read/write, registry grant, or activation.
