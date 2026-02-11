-- Support cross-currency wallet transfers
-- The existing sync_transfer_transactions() trigger unconditionally syncs
-- amount from one side to the other. For cross-currency transfers (e.g. VND → USD),
-- each side must have independently-set amounts. This migration updates the trigger
-- to only sync amounts when both wallets share the same currency.

CREATE OR REPLACE FUNCTION public.sync_transfer_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    opposite_id uuid;
    from_currency text;
    to_currency text;
    report_opt_in_value boolean;
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
            -- Get currencies of both wallets
            SELECT ww.currency INTO from_currency
            FROM public.workspace_wallets ww
            JOIN public.wallet_transactions wt ON wt.wallet_id = ww.id
            WHERE wt.id = NEW.id;

            SELECT ww.currency INTO to_currency
            FROM public.workspace_wallets ww
            JOIN public.wallet_transactions wt ON wt.wallet_id = ww.id
            WHERE wt.id = opposite_id;

            SELECT report_opt_in INTO report_opt_in_value
            FROM public.wallet_transactions
            WHERE id = NEW.id;

            IF from_currency = to_currency THEN
                -- Same currency: sync amount + report_opt_in
                UPDATE public.wallet_transactions wt
                SET amount = ABS(NEW.amount),
                    report_opt_in = report_opt_in_value
                WHERE wt.id = opposite_id
                  AND (wt.amount <> ABS(NEW.amount) OR wt.report_opt_in <> report_opt_in_value);
            ELSE
                -- Cross-currency: only sync report_opt_in (NOT amount)
                UPDATE public.wallet_transactions wt
                SET report_opt_in = report_opt_in_value
                WHERE wt.id = opposite_id
                  AND wt.report_opt_in <> report_opt_in_value;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
