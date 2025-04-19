alter table "public"."nova_submissions" drop column "score";
alter table "public"."nova_submissions" drop column "feedback";

alter table "public"."nova_submissions" drop constraint "nova_users_problem_history_pkey" cascade;
drop index if exists "public"."nova_users_problem_history_pkey";

alter table "public"."nova_submissions" add column "new_id" uuid not null default gen_random_uuid();

alter table "public"."nova_submissions" drop column "id";
alter table "public"."nova_submissions" rename column "new_id" to "id";

CREATE UNIQUE INDEX nova_submissions_pkey ON public.nova_submissions USING btree (id);
alter table "public"."nova_submissions" add constraint "nova_submissions_pkey" PRIMARY KEY using index "nova_submissions_pkey";
