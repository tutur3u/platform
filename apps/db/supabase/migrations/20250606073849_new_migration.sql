alter table "public"."workspace_quiz_sets" add column "due_date" timestamp with time zone not null default (now() + '7 days'::interval);

alter table "public"."workspace_quiz_sets" add column "results_released" boolean not null default false;


