create table "public"."wallet_transactions" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "amount" numeric default '0'::numeric,
    "description" text,
    "wallet_id" uuid not null,
    "created_at" timestamp with time zone default now()
);


CREATE UNIQUE INDEX wallet_transactions_pkey ON public.wallet_transactions USING btree (id);

alter table "public"."wallet_transactions" add constraint "wallet_transactions_pkey" PRIMARY KEY using index "wallet_transactions_pkey";

alter table "public"."wallet_transactions" add constraint "wallet_transactions_wallet_id_fkey" FOREIGN KEY (wallet_id) REFERENCES project_wallets(id) not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_transactions_wallet_id_fkey";


