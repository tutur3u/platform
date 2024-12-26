create table "public"."currencies" (
    "code" text not null,
    "name" text not null
);
insert into "public"."currencies" ("code", "name")
values ('USD', 'United States Dollar'),
    ('VND', 'Vietnamese Dong');
alter table "public"."currencies" enable row level security;
create table "public"."wallet_types" ("id" text not null);
insert into "public"."wallet_types" ("id")
values ('STANDARD'),
    ('CREDIT');
alter table "public"."wallet_types" enable row level security;
alter table "public"."workspace_wallets"
add column "type" text not null default 'STANDARD'::text;
CREATE UNIQUE INDEX currencies_code_key ON public.currencies USING btree (code);
CREATE UNIQUE INDEX currencies_name_key ON public.currencies USING btree (name);
CREATE UNIQUE INDEX currencies_pkey ON public.currencies USING btree (code);
CREATE UNIQUE INDEX wallet_types_pkey ON public.wallet_types USING btree (id);
alter table "public"."currencies"
add constraint "currencies_pkey" PRIMARY KEY using index "currencies_pkey";
alter table "public"."wallet_types"
add constraint "wallet_types_pkey" PRIMARY KEY using index "wallet_types_pkey";
alter table "public"."currencies"
add constraint "currencies_code_key" UNIQUE using index "currencies_code_key";
alter table "public"."currencies"
add constraint "currencies_name_key" UNIQUE using index "currencies_name_key";
alter table "public"."workspace_wallets"
add constraint "workspace_wallets_type_fkey" FOREIGN KEY (type) REFERENCES wallet_types(id) not valid;
alter table "public"."workspace_wallets" validate constraint "workspace_wallets_type_fkey";
alter table "public"."workspace_wallets"
add column "new_currency" text not null default 'VND';
alter table "public"."workspace_wallets" drop column "currency";
alter table "public"."workspace_wallets"
    rename column "new_currency" to "currency";
alter table "public"."workspace_wallets"
add constraint "workspace_wallets_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code) not valid;
alter table "public"."workspace_wallets" validate constraint "workspace_wallets_currency_fkey";
create table "public"."credit_wallets" (
    "wallet_id" uuid not null,
    "statement_date" smallint not null,
    "payment_date" smallint not null,
    "limit" bigint not null
);
alter table "public"."credit_wallets" enable row level security;
CREATE UNIQUE INDEX credit_wallets_pkey ON public.credit_wallets USING btree (wallet_id);
alter table "public"."credit_wallets"
add constraint "credit_wallets_pkey" PRIMARY KEY using index "credit_wallets_pkey";
alter table "public"."credit_wallets"
add constraint "credit_wallets_wallet_id_fkey" FOREIGN KEY (wallet_id) REFERENCES workspace_wallets(id) ON DELETE CASCADE not valid;
alter table "public"."credit_wallets" validate constraint "credit_wallets_wallet_id_fkey";
create policy "Enable all access for organization members" on "public"."credit_wallets" as permissive for all to authenticated using (
    (
        EXISTS (
            SELECT 1
            FROM workspace_wallets w
            WHERE (w.id = credit_wallets.wallet_id)
        )
    )
) with check (
    (
        EXISTS (
            SELECT 1
            FROM workspace_wallets w
            WHERE (w.id = credit_wallets.wallet_id)
        )
    )
);