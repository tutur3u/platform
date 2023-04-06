drop trigger if exists "sync_wallet_transactions_tr" on "public"."wallet_transactions";

drop function if exists "public"."sync_wallet_transactions"();

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.sync_transfer_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    opposite_id uuid;
    is_from boolean;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT CASE
            WHEN wtt.from_transaction_id = OLD.id THEN wtt.to_transaction_id
            WHEN wtt.to_transaction_id = OLD.id THEN wtt.from_transaction_id
            ELSE NULL
        END INTO opposite_id
        FROM public.workspace_wallet_transfers wtt
        WHERE wtt.from_transaction_id = OLD.id
            OR wtt.to_transaction_id = OLD.id
        LIMIT 1;
        
        IF opposite_id IS NOT NULL THEN
            UPDATE public.wallet_transactions wt
            SET amount = ABS(NEW.amount)
            WHERE wt.id = opposite_id AND wt.amount <> ABS(NEW.amount);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_transaction_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.workspace_wallet_transfers wtt
        WHERE wtt.from_transaction_id = NEW.id
    ) AND NEW.amount > 0 THEN
        NEW.amount = -NEW.amount;
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE TRIGGER update_transaction_amount BEFORE UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION update_transaction_amount();

CREATE TRIGGER update_transfer_transaction_amount AFTER UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION sync_transfer_transactions();


