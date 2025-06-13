CREATE OR REPLACE FUNCTION update_wallet_transactions() RETURNS trigger AS $$ BEGIN IF (OLD.is_expense <> NEW.is_expense) THEN IF (NEW.is_expense = true) THEN
UPDATE public.wallet_transactions
SET amount = - amount
WHERE category_id = NEW.id
    AND amount > 0;
UPDATE public.wallet_transactions
SET amount = amount
WHERE category_id = NEW.id
    AND amount < 0;
ELSE
UPDATE public.wallet_transactions
SET amount = - amount
WHERE category_id = NEW.id
    AND amount < 0;
UPDATE public.wallet_transactions
SET amount = amount
WHERE category_id = NEW.id
    AND amount > 0;
END IF;
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER update_wallet_transactions
AFTER
UPDATE OF is_expense ON public.transaction_categories FOR EACH ROW EXECUTE PROCEDURE update_wallet_transactions();
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.update_wallet_transaction_amount() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF (TG_OP = 'UPDATE') THEN IF (
        (NEW.price + NEW.total_diff) <> (OLD.price + OLD.total_diff)
    ) THEN
UPDATE public.wallet_transactions
SET amount = CASE
        WHEN tc.is_expense THEN -(NEW.price + NEW.total_diff)
        ELSE (NEW.price + NEW.total_diff)
    END
FROM public.transaction_categories tc
WHERE tc.id = wallet_transactions.category_id
    AND wallet_transactions.id = NEW.transaction_id;
END IF;
END IF;
RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_wallet_transactions() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF (OLD.is_expense <> NEW.is_expense) THEN IF (NEW.is_expense = true) THEN
UPDATE public.wallet_transactions
SET amount = - amount
WHERE category_id = NEW.id
    AND amount > 0;
UPDATE public.wallet_transactions
SET amount = amount
WHERE category_id = NEW.id
    AND amount < 0;
ELSE
UPDATE public.wallet_transactions
SET amount = - amount
WHERE category_id = NEW.id
    AND amount < 0;
UPDATE public.wallet_transactions
SET amount = amount
WHERE category_id = NEW.id
    AND amount > 0;
END IF;
END IF;
RETURN NEW;
END;
$function$;
CREATE TRIGGER update_wallet_transaction_amount
AFTER
UPDATE OF price,
    total_diff ON public.finance_invoices FOR EACH ROW EXECUTE FUNCTION update_wallet_transaction_amount();