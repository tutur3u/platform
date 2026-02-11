set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.fn_prevent_invalid_referral_link()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  promo record;
BEGIN
  -- Get the promotion details
  SELECT * INTO promo FROM public.workspace_promotions WHERE id = NEW.promo_id;

  -- If it's a referral promo, ensure the user is the owner
  IF promo.promo_type = 'REFERRAL' AND promo.owner_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Referral promotions can only be linked to their owner.';
  END IF;

  -- If the check passes, allow the insertion to proceed
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_prevent_owner_referral_unlink()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  promo record;
BEGIN
  -- Get the promotion details from the main promotions table
  SELECT * INTO promo FROM public.workspace_promotions WHERE id = OLD.promo_id;

  -- Check if it's a referral promo and the user is the owner
  IF promo.promo_type = 'REFERRAL' AND promo.owner_id = OLD.user_id THEN
    RAISE EXCEPTION 'You cannot unlink your own referral promotion.';
  END IF;

  -- If the check passes, allow the deletion to proceed
  RETURN OLD;
END;
$function$
;

CREATE TRIGGER t_prevent_invalid_referral_link BEFORE INSERT ON public.user_linked_promotions FOR EACH ROW EXECUTE FUNCTION fn_prevent_invalid_referral_link();

CREATE TRIGGER t_prevent_owner_referral_unlink BEFORE DELETE ON public.user_linked_promotions FOR EACH ROW EXECUTE FUNCTION fn_prevent_owner_referral_unlink();


