create table "public"."workspace_wallet_transfers" (
  "from_transaction_id" uuid not null,
  "to_transaction_id" uuid not null,
  "created_at" timestamp with time zone default now()
);
alter table "public"."workspace_wallet_transfers" enable row level security;
alter table "public"."wallet_transactions"
add column "taken_at" timestamp with time zone not null default now();
CREATE UNIQUE INDEX workspace_wallet_transfers_pkey ON public.workspace_wallet_transfers USING btree (from_transaction_id, to_transaction_id);
alter table "public"."workspace_wallet_transfers"
add constraint "workspace_wallet_transfers_pkey" PRIMARY KEY using index "workspace_wallet_transfers_pkey";
alter table "public"."workspace_wallet_transfers"
add constraint "workspace_wallet_transfers_from_transaction_id_fkey" FOREIGN KEY (from_transaction_id) REFERENCES wallet_transactions(id) ON DELETE CASCADE not valid;
alter table "public"."workspace_wallet_transfers" validate constraint "workspace_wallet_transfers_from_transaction_id_fkey";
alter table "public"."workspace_wallet_transfers"
add constraint "workspace_wallet_transfers_to_transaction_id_fkey" FOREIGN KEY (to_transaction_id) REFERENCES wallet_transactions(id) ON DELETE CASCADE not valid;
alter table "public"."workspace_wallet_transfers" validate constraint "workspace_wallet_transfers_to_transaction_id_fkey";
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.delete_complementary_transaction() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN
DELETE FROM public.wallet_transactions
WHERE id = OLD.from_transaction_id
  OR id = OLD.to_transaction_id;
RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_wallet_transactions() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE opposite_id uuid;
BEGIN IF TG_OP = 'UPDATE' THEN IF OLD.amount <> NEW.amount
AND transactions_have_same_abs_amount(OLD.id, NEW.id) THEN opposite_id := CASE
  WHEN OLD.id = NEW.from_transaction_id THEN NEW.to_transaction_id
  WHEN OLD.id = NEW.to_transaction_id THEN NEW.from_transaction_id
END;
UPDATE public.workspace_wallet_transfers
SET amount = - NEW.amount
WHERE id = opposite_id;
END IF;
END IF;
RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.transactions_have_same_abs_amount(transaction_id_1 uuid, transaction_id_2 uuid) RETURNS boolean LANGUAGE sql AS $function$
SELECT ABS(t1.amount) = ABS(t2.amount)
FROM wallet_transactions t1,
  wallet_transactions t2
WHERE t1.id = transaction_id_1
  AND t2.id = transaction_id_2 $function$;
CREATE OR REPLACE FUNCTION public.transactions_have_same_amount(transaction_id_1 uuid, transaction_id_2 uuid) RETURNS boolean LANGUAGE sql AS $function$
SELECT t1.amount = t2.amount
FROM wallet_transactions t1,
  wallet_transactions t2
WHERE t1.id = transaction_id_1
  AND t2.id = transaction_id_2 $function$;
create policy "Allow delete access for workspace members" on "public"."workspace_wallet_transfers" as permissive for delete to authenticated using (
  (
    (
      EXISTS (
        SELECT 1
        FROM wallet_transactions t
        WHERE (
            workspace_wallet_transfers.from_transaction_id = t.id
          )
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM wallet_transactions t
        WHERE (
            workspace_wallet_transfers.to_transaction_id = t.id
          )
      )
    )
  )
);
create policy "Allow insert access if both transaction have the same amount" on "public"."workspace_wallet_transfers" as permissive for
insert to authenticated with check (
    (
      transactions_have_same_abs_amount(from_transaction_id, to_transaction_id)
      AND (
        EXISTS (
          SELECT 1
          FROM wallet_transactions t
          WHERE (
              t.id = workspace_wallet_transfers.from_transaction_id
            )
        )
      )
      AND (
        EXISTS (
          SELECT 1
          FROM wallet_transactions t
          WHERE (
              t.id = workspace_wallet_transfers.to_transaction_id
            )
        )
      )
    )
  );
create policy "Allow read access for workspace members" on "public"."workspace_wallet_transfers" as permissive for
select to authenticated using (
    (
      (
        EXISTS (
          SELECT 1
          FROM wallet_transactions t
          WHERE (
              workspace_wallet_transfers.from_transaction_id = t.id
            )
        )
      )
      AND (
        EXISTS (
          SELECT 1
          FROM wallet_transactions t
          WHERE (
              workspace_wallet_transfers.to_transaction_id = t.id
            )
        )
      )
    )
  );
CREATE TRIGGER sync_wallet_transactions_tr BEFORE
UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION sync_wallet_transactions();
CREATE TRIGGER delete_complementary_transaction_tr
AFTER DELETE ON public.workspace_wallet_transfers FOR EACH ROW EXECUTE FUNCTION delete_complementary_transaction();