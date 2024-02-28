alter table "public"."finance_invoice_products" drop constraint "finance_invoice_products_warehouse_id_fkey";

alter table "public"."user_feedbacks" drop constraint "user_feedbacks_creator_id_fkey";

create table "public"."product_stock_changes" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "unit_id" uuid not null,
    "warehouse_id" uuid not null,
    "amount" bigint not null,
    "beneficiary_id" uuid,
    "creator_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."product_stock_changes" enable row level security;

create table "public"."user_indicators" (
    "user_id" uuid not null,
    "indicator_id" uuid not null,
    "value" numeric,
    "creator_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "group_id" uuid not null
);


alter table "public"."user_indicators" enable row level security;

CREATE UNIQUE INDEX product_stock_changes_pkey ON public.product_stock_changes USING btree (id);

CREATE UNIQUE INDEX user_indicators_pkey ON public.user_indicators USING btree (user_id, indicator_id);

alter table "public"."product_stock_changes" add constraint "product_stock_changes_pkey" PRIMARY KEY using index "product_stock_changes_pkey";

alter table "public"."user_indicators" add constraint "user_indicators_pkey" PRIMARY KEY using index "user_indicators_pkey";

alter table "public"."product_stock_changes" add constraint "product_stock_changes_beneficiary_id_fkey" FOREIGN KEY (beneficiary_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."product_stock_changes" validate constraint "product_stock_changes_beneficiary_id_fkey";

alter table "public"."product_stock_changes" add constraint "product_stock_changes_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."product_stock_changes" validate constraint "product_stock_changes_creator_id_fkey";

alter table "public"."product_stock_changes" add constraint "product_stock_changes_product_id_fkey" FOREIGN KEY (product_id) REFERENCES workspace_products(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."product_stock_changes" validate constraint "product_stock_changes_product_id_fkey";

alter table "public"."product_stock_changes" add constraint "product_stock_changes_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES inventory_units(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."product_stock_changes" validate constraint "product_stock_changes_unit_id_fkey";

alter table "public"."product_stock_changes" add constraint "product_stock_changes_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."product_stock_changes" validate constraint "product_stock_changes_warehouse_id_fkey";

alter table "public"."user_indicators" add constraint "user_indicators_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."user_indicators" validate constraint "user_indicators_creator_id_fkey";

alter table "public"."user_indicators" add constraint "user_indicators_group_id_fkey" FOREIGN KEY (group_id) REFERENCES workspace_user_groups(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."user_indicators" validate constraint "user_indicators_group_id_fkey";

alter table "public"."user_indicators" add constraint "user_indicators_indicator_id_fkey" FOREIGN KEY (indicator_id) REFERENCES healthcare_vitals(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."user_indicators" validate constraint "user_indicators_indicator_id_fkey";

alter table "public"."user_indicators" add constraint "user_indicators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."user_indicators" validate constraint "user_indicators_user_id_fkey";

alter table "public"."finance_invoice_products" add constraint "finance_invoice_products_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES inventory_warehouses(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."finance_invoice_products" validate constraint "finance_invoice_products_warehouse_id_fkey";

alter table "public"."user_feedbacks" add constraint "user_feedbacks_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."user_feedbacks" validate constraint "user_feedbacks_creator_id_fkey";

create or replace view "public"."distinct_invoice_creators" as  SELECT DISTINCT u.id,
    COALESCE(u.display_name, u.full_name) AS display_name
   FROM finance_invoices b,
    workspace_users u
  WHERE (u.id = b.creator_id);


grant delete on table "public"."product_stock_changes" to "anon";

grant insert on table "public"."product_stock_changes" to "anon";

grant references on table "public"."product_stock_changes" to "anon";

grant select on table "public"."product_stock_changes" to "anon";

grant trigger on table "public"."product_stock_changes" to "anon";

grant truncate on table "public"."product_stock_changes" to "anon";

grant update on table "public"."product_stock_changes" to "anon";

grant delete on table "public"."product_stock_changes" to "authenticated";

grant insert on table "public"."product_stock_changes" to "authenticated";

grant references on table "public"."product_stock_changes" to "authenticated";

grant select on table "public"."product_stock_changes" to "authenticated";

grant trigger on table "public"."product_stock_changes" to "authenticated";

grant truncate on table "public"."product_stock_changes" to "authenticated";

grant update on table "public"."product_stock_changes" to "authenticated";

grant delete on table "public"."product_stock_changes" to "service_role";

grant insert on table "public"."product_stock_changes" to "service_role";

grant references on table "public"."product_stock_changes" to "service_role";

grant select on table "public"."product_stock_changes" to "service_role";

grant trigger on table "public"."product_stock_changes" to "service_role";

grant truncate on table "public"."product_stock_changes" to "service_role";

grant update on table "public"."product_stock_changes" to "service_role";

grant delete on table "public"."user_indicators" to "anon";

grant insert on table "public"."user_indicators" to "anon";

grant references on table "public"."user_indicators" to "anon";

grant select on table "public"."user_indicators" to "anon";

grant trigger on table "public"."user_indicators" to "anon";

grant truncate on table "public"."user_indicators" to "anon";

grant update on table "public"."user_indicators" to "anon";

grant delete on table "public"."user_indicators" to "authenticated";

grant insert on table "public"."user_indicators" to "authenticated";

grant references on table "public"."user_indicators" to "authenticated";

grant select on table "public"."user_indicators" to "authenticated";

grant trigger on table "public"."user_indicators" to "authenticated";

grant truncate on table "public"."user_indicators" to "authenticated";

grant update on table "public"."user_indicators" to "authenticated";

grant delete on table "public"."user_indicators" to "service_role";

grant insert on table "public"."user_indicators" to "service_role";

grant references on table "public"."user_indicators" to "service_role";

grant select on table "public"."user_indicators" to "service_role";

grant trigger on table "public"."user_indicators" to "service_role";

grant truncate on table "public"."user_indicators" to "service_role";

grant update on table "public"."user_indicators" to "service_role";

create policy "Allow all for workspace users"
on "public"."product_stock_changes"
as permissive
for all
to authenticated
using (((EXISTS ( SELECT 1
   FROM workspace_products p
  WHERE (p.id = product_stock_changes.product_id))) AND (EXISTS ( SELECT 1
   FROM inventory_units u
  WHERE (u.id = product_stock_changes.unit_id))) AND (EXISTS ( SELECT 1
   FROM inventory_warehouses w
  WHERE (w.id = product_stock_changes.warehouse_id)))))
with check (((EXISTS ( SELECT 1
   FROM workspace_products p
  WHERE (p.id = product_stock_changes.product_id))) AND (EXISTS ( SELECT 1
   FROM inventory_units u
  WHERE (u.id = product_stock_changes.unit_id))) AND (EXISTS ( SELECT 1
   FROM inventory_warehouses w
  WHERE (w.id = product_stock_changes.warehouse_id)))));


create policy "Allow all for workspace users"
on "public"."user_indicators"
as permissive
for all
to authenticated
using (((EXISTS ( SELECT 1
   FROM workspace_user_groups g
  WHERE (g.id = user_indicators.group_id))) AND (EXISTS ( SELECT 1
   FROM healthcare_vitals v
  WHERE (v.id = user_indicators.indicator_id))) AND (EXISTS ( SELECT 1
   FROM workspace_users u
  WHERE (u.id = user_indicators.user_id)))))
with check (((EXISTS ( SELECT 1
   FROM workspace_user_groups g
  WHERE (g.id = user_indicators.group_id))) AND (EXISTS ( SELECT 1
   FROM healthcare_vitals v
  WHERE (v.id = user_indicators.indicator_id))) AND (EXISTS ( SELECT 1
   FROM workspace_users u
  WHERE (u.id = user_indicators.user_id)))));

alter table "public"."finance_invoices" drop constraint "public_finance_invoices_creator_id_fkey";

alter table "public"."finance_invoices" add column "category_id" uuid not null;

alter table "public"."finance_invoices" add column "valid_until" timestamp with time zone;

alter table "public"."finance_invoices" add column "wallet_id" uuid not null;

alter table "public"."wallet_transactions" add column "creator_id" uuid;

alter table "public"."finance_invoices" add constraint "finance_invoices_category_id_fkey" FOREIGN KEY (category_id) REFERENCES transaction_categories(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."finance_invoices" validate constraint "finance_invoices_category_id_fkey";

alter table "public"."finance_invoices" add constraint "finance_invoices_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."finance_invoices" validate constraint "finance_invoices_creator_id_fkey";

alter table "public"."finance_invoices" add constraint "finance_invoices_wallet_id_fkey" FOREIGN KEY (wallet_id) REFERENCES workspace_wallets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."finance_invoices" validate constraint "finance_invoices_wallet_id_fkey";

alter table "public"."wallet_transactions" add constraint "wallet_transactions_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES workspace_users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_transactions_creator_id_fkey";

-- before data is inserted to, updated, or deleted from public.finance_invoices fi,
-- please modify public.wallet_transactions wt (where fi.transaction_id = wt.id) accordingly
CREATE OR REPLACE FUNCTION public.sync_invoice_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (TG_OP = 'INSERT') then
    insert into public.wallet_transactions (id, amount, description, wallet_id, category_id, creator_id, created_at, taken_at)
    values (new.transaction_id, new.price + new.total_diff, new.notice, new.wallet_id, new.category_id, new.creator_id, new.created_at, new.created_at);
  elsif (TG_OP = 'UPDATE') then
    update public.wallet_transactions
    set amount = new.price + new.total_diff,
        description = new.notice,
        wallet_id = new.wallet_id,
        category_id = new.category_id,
        creator_id = new.creator_id,
        created_at = new.created_at
    where id = new.transaction_id;
  elsif (TG_OP = 'DELETE') then
    delete from public.wallet_transactions
    where id = old.transaction_id;
  end if;
  return new;
end;
$function$;

CREATE TRIGGER sync_invoice_transaction BEFORE INSERT OR DELETE OR UPDATE ON public.finance_invoices FOR EACH ROW EXECUTE FUNCTION sync_invoice_transaction();