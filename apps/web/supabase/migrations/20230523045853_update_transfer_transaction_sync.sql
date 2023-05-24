set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.sync_transfer_transactions() RETURNS trigger LANGUAGE plpgsql AS $function$DECLARE opposite_id uuid;
is_from boolean;
report_opt_in_value boolean;
BEGIN IF TG_OP = 'UPDATE' THEN
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
SELECT report_opt_in INTO report_opt_in_value
FROM public.wallet_transactions
WHERE id = NEW.id;
UPDATE public.wallet_transactions wt
SET amount = ABS(NEW.amount),
    report_opt_in = report_opt_in_value
WHERE wt.id = opposite_id
    AND (
        wt.amount <> ABS(NEW.amount)
        OR wt.report_opt_in <> report_opt_in_value
    );
END IF;
END IF;
RETURN NEW;
END;
$function$;