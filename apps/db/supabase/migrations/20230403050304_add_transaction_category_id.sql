alter table "public"."wallet_transactions"
add column "category_id" uuid;
alter table "public"."wallet_transactions"
add constraint "wallet_transactions_category_id_fkey" FOREIGN KEY (category_id) REFERENCES transaction_categories(id) not valid;
alter table "public"."wallet_transactions" validate constraint "wallet_transactions_category_id_fkey";