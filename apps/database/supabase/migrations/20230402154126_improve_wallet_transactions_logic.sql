alter table "public"."wallet_transactions"
add column "is_expense" boolean not null default true;
-- Make public.wallet_transactions.wallet_id on delete cascade and make sure the foreign key is not null (delete old constraint first)
alter table "public"."wallet_transactions" drop constraint "wallet_transactions_wallet_id_fkey";
alter table "public"."wallet_transactions"
add constraint "wallet_transactions_wallet_id_fkey" foreign key ("wallet_id") references "public"."workspace_wallets"("id") on delete cascade not valid;
alter table "public"."wallet_transactions" drop column "name";