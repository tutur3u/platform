alter table "public"."finance_invoices" add column "transaction_id" uuid not null;

CREATE UNIQUE INDEX finance_invoices_transaction_id_key ON public.finance_invoices USING btree (transaction_id);

alter table "public"."finance_invoices" add constraint "finance_invoices_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES wallet_transactions(id) not valid;

alter table "public"."finance_invoices" validate constraint "finance_invoices_transaction_id_fkey";

alter table "public"."finance_invoices" add constraint "finance_invoices_transaction_id_key" UNIQUE using index "finance_invoices_transaction_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_wallet_balance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$BEGIN 
    IF TG_OP = 'INSERT' THEN
        UPDATE workspace_wallets
        SET balance = balance + NEW.amount
        WHERE id = NEW.wallet_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.wallet_id = NEW.wallet_id THEN
            UPDATE workspace_wallets
            SET balance = balance - OLD.amount + NEW.amount
            WHERE id = OLD.wallet_id;
        ELSE
            UPDATE workspace_wallets
            SET balance = balance - OLD.amount
            WHERE id = OLD.wallet_id;
            
            UPDATE workspace_wallets
            SET balance = balance + NEW.amount
            WHERE id = NEW.wallet_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE workspace_wallets
        SET balance = balance - OLD.amount
        WHERE id = OLD.wallet_id;
    END IF;
    RETURN NULL;
END;
$function$
;


