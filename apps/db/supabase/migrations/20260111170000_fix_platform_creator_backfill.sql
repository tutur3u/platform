-- Migration: fix_platform_creator_backfill
-- 1. Backfill platform_creator_id in wallet_transactions using workspace_user_linked_users
-- 2. Update set_transaction_platform_creator trigger to fallback to linked user lookup

-- 1. Correct Backfill
-- We look up the platform_user_id corresponding to the virtual user (creator_id)
UPDATE public.wallet_transactions wt
SET platform_creator_id = wulu.platform_user_id
FROM public.workspace_user_linked_users wulu
WHERE wt.creator_id = wulu.virtual_user_id
  AND wt.platform_creator_id IS NULL;


-- 2. Update Trigger
-- Now handles case where auth.uid() is missing but creator_id is provided
CREATE OR REPLACE FUNCTION public.set_transaction_platform_creator() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
  -- If platform_creator_id is not provided
  IF NEW.platform_creator_id IS NULL THEN
    -- 1. Try auth.uid() (Standard user creation)
    IF auth.uid() IS NOT NULL THEN
      NEW.platform_creator_id := auth.uid();
    
    -- 2. If no auth.uid(), try looking up via creator_id (System/Import creation with virtual user)
    ELSIF NEW.creator_id IS NOT NULL THEN
      SELECT platform_user_id INTO NEW.platform_creator_id
      FROM public.workspace_user_linked_users
      WHERE virtual_user_id = NEW.creator_id
      LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure trigger is created (idempotent)
DROP TRIGGER IF EXISTS set_transaction_platform_creator_tr ON public.wallet_transactions;
CREATE TRIGGER set_transaction_platform_creator_tr 
BEFORE INSERT ON public.wallet_transactions 
FOR EACH ROW 
EXECUTE FUNCTION public.set_transaction_platform_creator();
