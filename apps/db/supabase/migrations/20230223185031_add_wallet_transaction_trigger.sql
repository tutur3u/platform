set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_wallet_balance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE project_wallets
        SET balance = balance + NEW.amount
        WHERE id = NEW.wallet_id;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE project_wallets
        SET balance = balance - OLD.amount + NEW.amount
        WHERE id = OLD.wallet_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE project_wallets
        SET balance = balance - OLD.amount
        WHERE id = OLD.wallet_id;
    END IF;
    
    RETURN NULL;
END;
$function$
;

CREATE TRIGGER update_wallet_balance_tr AFTER INSERT OR DELETE OR UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION update_wallet_balance();


