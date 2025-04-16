alter table "public"."nova_submissions" alter column "session_id" set not null;

alter table "public"."nova_submissions" drop constraint "nova_users_problem_history_pkey";

drop index if exists "public"."nova_users_problem_history_pkey";

alter table "public"."nova_submissions" drop column "id";

alter table "public"."nova_submissions" add column "id" uuid not null default gen_random_uuid();

CREATE UNIQUE INDEX nova_submissions_pkey ON public.nova_submissions USING btree (id);

alter table "public"."nova_submissions" add constraint "nova_submissions_pkey" PRIMARY KEY using index "nova_submissions_pkey";
