create table "public"."project_wallets" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "balance" numeric default '0'::numeric,
    "currency" text default 'VND'::text,
    "description" text,
    "created_at" timestamp with time zone default now(),
    "project_id" uuid not null
);


CREATE UNIQUE INDEX projects_wallets_pkey ON public.project_wallets USING btree (id);

alter table "public"."project_wallets" add constraint "projects_wallets_pkey" PRIMARY KEY using index "projects_wallets_pkey";

alter table "public"."project_wallets" add constraint "project_wallets_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) not valid;

alter table "public"."project_wallets" validate constraint "project_wallets_project_id_fkey";


