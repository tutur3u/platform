create table "public"."workspace_ai_models" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text,
    "url" text not null,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);

alter table
    "public"."workspace_ai_models" enable row level security;

create table "public"."workspace_cron_jobs" (
    "id" uuid not null default gen_random_uuid(),
    "ws_id" uuid not null,
    "dataset_id" uuid not null,
    "schedule" text not null,
    "url" text not null,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
);

alter table
    "public"."workspace_cron_jobs" enable row level security;

create table "public"."workspace_dataset_columns" (
    "dataset_id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text,
    "alias" text,
    "created_at" timestamp with time zone not null default now()
);

alter table
    "public"."workspace_dataset_columns" enable row level security;

create table "public"."workspace_datasets" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text,
    "ws_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);

alter table
    "public"."workspace_datasets" enable row level security;

CREATE UNIQUE INDEX workspace_ai_models_pkey ON public.workspace_ai_models USING btree (id);

CREATE UNIQUE INDEX workspace_cron_jobs_pkey ON public.workspace_cron_jobs USING btree (id);

CREATE UNIQUE INDEX workspace_dataset_columns_pkey ON public.workspace_dataset_columns USING btree (dataset_id, name);

CREATE UNIQUE INDEX workspace_datasets_pkey ON public.workspace_datasets USING btree (id);

alter table
    "public"."workspace_ai_models"
add
    constraint "workspace_ai_models_pkey" PRIMARY KEY using index "workspace_ai_models_pkey";

alter table
    "public"."workspace_cron_jobs"
add
    constraint "workspace_cron_jobs_pkey" PRIMARY KEY using index "workspace_cron_jobs_pkey";

alter table
    "public"."workspace_dataset_columns"
add
    constraint "workspace_dataset_columns_pkey" PRIMARY KEY using index "workspace_dataset_columns_pkey";

alter table
    "public"."workspace_datasets"
add
    constraint "workspace_datasets_pkey" PRIMARY KEY using index "workspace_datasets_pkey";

alter table
    "public"."workspace_ai_models"
add
    constraint "workspace_ai_models_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."workspace_ai_models" validate constraint "workspace_ai_models_ws_id_fkey";

alter table
    "public"."workspace_cron_jobs"
add
    constraint "workspace_cron_jobs_dataset_id_fkey" FOREIGN KEY (dataset_id) REFERENCES workspace_datasets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."workspace_cron_jobs" validate constraint "workspace_cron_jobs_dataset_id_fkey";

alter table
    "public"."workspace_cron_jobs"
add
    constraint "workspace_cron_jobs_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."workspace_cron_jobs" validate constraint "workspace_cron_jobs_ws_id_fkey";

alter table
    "public"."workspace_dataset_columns"
add
    constraint "workspace_dataset_columns_dataset_id_fkey" FOREIGN KEY (dataset_id) REFERENCES workspace_datasets(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."workspace_dataset_columns" validate constraint "workspace_dataset_columns_dataset_id_fkey";

alter table
    "public"."workspace_datasets"
add
    constraint "workspace_datasets_ws_id_fkey" FOREIGN KEY (ws_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."workspace_datasets" validate constraint "workspace_datasets_ws_id_fkey";

grant delete on table "public"."workspace_ai_models" to "anon";

grant
insert
    on table "public"."workspace_ai_models" to "anon";

grant references on table "public"."workspace_ai_models" to "anon";

grant
select
    on table "public"."workspace_ai_models" to "anon";

grant trigger on table "public"."workspace_ai_models" to "anon";

grant truncate on table "public"."workspace_ai_models" to "anon";

grant
update
    on table "public"."workspace_ai_models" to "anon";

grant delete on table "public"."workspace_ai_models" to "authenticated";

grant
insert
    on table "public"."workspace_ai_models" to "authenticated";

grant references on table "public"."workspace_ai_models" to "authenticated";

grant
select
    on table "public"."workspace_ai_models" to "authenticated";

grant trigger on table "public"."workspace_ai_models" to "authenticated";

grant truncate on table "public"."workspace_ai_models" to "authenticated";

grant
update
    on table "public"."workspace_ai_models" to "authenticated";

grant delete on table "public"."workspace_ai_models" to "service_role";

grant
insert
    on table "public"."workspace_ai_models" to "service_role";

grant references on table "public"."workspace_ai_models" to "service_role";

grant
select
    on table "public"."workspace_ai_models" to "service_role";

grant trigger on table "public"."workspace_ai_models" to "service_role";

grant truncate on table "public"."workspace_ai_models" to "service_role";

grant
update
    on table "public"."workspace_ai_models" to "service_role";

grant delete on table "public"."workspace_cron_jobs" to "anon";

grant
insert
    on table "public"."workspace_cron_jobs" to "anon";

grant references on table "public"."workspace_cron_jobs" to "anon";

grant
select
    on table "public"."workspace_cron_jobs" to "anon";

grant trigger on table "public"."workspace_cron_jobs" to "anon";

grant truncate on table "public"."workspace_cron_jobs" to "anon";

grant
update
    on table "public"."workspace_cron_jobs" to "anon";

grant delete on table "public"."workspace_cron_jobs" to "authenticated";

grant
insert
    on table "public"."workspace_cron_jobs" to "authenticated";

grant references on table "public"."workspace_cron_jobs" to "authenticated";

grant
select
    on table "public"."workspace_cron_jobs" to "authenticated";

grant trigger on table "public"."workspace_cron_jobs" to "authenticated";

grant truncate on table "public"."workspace_cron_jobs" to "authenticated";

grant
update
    on table "public"."workspace_cron_jobs" to "authenticated";

grant delete on table "public"."workspace_cron_jobs" to "service_role";

grant
insert
    on table "public"."workspace_cron_jobs" to "service_role";

grant references on table "public"."workspace_cron_jobs" to "service_role";

grant
select
    on table "public"."workspace_cron_jobs" to "service_role";

grant trigger on table "public"."workspace_cron_jobs" to "service_role";

grant truncate on table "public"."workspace_cron_jobs" to "service_role";

grant
update
    on table "public"."workspace_cron_jobs" to "service_role";

grant delete on table "public"."workspace_dataset_columns" to "anon";

grant
insert
    on table "public"."workspace_dataset_columns" to "anon";

grant references on table "public"."workspace_dataset_columns" to "anon";

grant
select
    on table "public"."workspace_dataset_columns" to "anon";

grant trigger on table "public"."workspace_dataset_columns" to "anon";

grant truncate on table "public"."workspace_dataset_columns" to "anon";

grant
update
    on table "public"."workspace_dataset_columns" to "anon";

grant delete on table "public"."workspace_dataset_columns" to "authenticated";

grant
insert
    on table "public"."workspace_dataset_columns" to "authenticated";

grant references on table "public"."workspace_dataset_columns" to "authenticated";

grant
select
    on table "public"."workspace_dataset_columns" to "authenticated";

grant trigger on table "public"."workspace_dataset_columns" to "authenticated";

grant truncate on table "public"."workspace_dataset_columns" to "authenticated";

grant
update
    on table "public"."workspace_dataset_columns" to "authenticated";

grant delete on table "public"."workspace_dataset_columns" to "service_role";

grant
insert
    on table "public"."workspace_dataset_columns" to "service_role";

grant references on table "public"."workspace_dataset_columns" to "service_role";

grant
select
    on table "public"."workspace_dataset_columns" to "service_role";

grant trigger on table "public"."workspace_dataset_columns" to "service_role";

grant truncate on table "public"."workspace_dataset_columns" to "service_role";

grant
update
    on table "public"."workspace_dataset_columns" to "service_role";

grant delete on table "public"."workspace_datasets" to "anon";

grant
insert
    on table "public"."workspace_datasets" to "anon";

grant references on table "public"."workspace_datasets" to "anon";

grant
select
    on table "public"."workspace_datasets" to "anon";

grant trigger on table "public"."workspace_datasets" to "anon";

grant truncate on table "public"."workspace_datasets" to "anon";

grant
update
    on table "public"."workspace_datasets" to "anon";

grant delete on table "public"."workspace_datasets" to "authenticated";

grant
insert
    on table "public"."workspace_datasets" to "authenticated";

grant references on table "public"."workspace_datasets" to "authenticated";

grant
select
    on table "public"."workspace_datasets" to "authenticated";

grant trigger on table "public"."workspace_datasets" to "authenticated";

grant truncate on table "public"."workspace_datasets" to "authenticated";

grant
update
    on table "public"."workspace_datasets" to "authenticated";

grant delete on table "public"."workspace_datasets" to "service_role";

grant
insert
    on table "public"."workspace_datasets" to "service_role";

grant references on table "public"."workspace_datasets" to "service_role";

grant
select
    on table "public"."workspace_datasets" to "service_role";

grant trigger on table "public"."workspace_datasets" to "service_role";

grant truncate on table "public"."workspace_datasets" to "service_role";

grant
update
    on table "public"."workspace_datasets" to "service_role";

create table "public"."workspace_cron_executions" (
    "id" uuid not null default gen_random_uuid(),
    "job_id" uuid not null,
    "cron_run_id" bigint,
    "status" text not null,
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "response" text,
    "created_at" timestamp with time zone not null default now()
);

alter table
    "public"."workspace_cron_executions" enable row level security;

alter table
    "public"."workspace_cron_jobs"
add
    column "cron_job_id" bigint;

alter table
    "public"."workspace_cron_jobs"
add
    column "name" text not null;

CREATE UNIQUE INDEX workspace_cron_executions_pkey ON public.workspace_cron_executions USING btree (id);

alter table
    "public"."workspace_cron_executions"
add
    constraint "workspace_cron_executions_pkey" PRIMARY KEY using index "workspace_cron_executions_pkey";

alter table
    "public"."workspace_cron_executions"
add
    constraint "workspace_cron_executions_job_id_fkey" FOREIGN KEY (job_id) REFERENCES workspace_cron_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table
    "public"."workspace_cron_executions" validate constraint "workspace_cron_executions_job_id_fkey";

grant delete on table "public"."workspace_cron_executions" to "anon";

grant
insert
    on table "public"."workspace_cron_executions" to "anon";

grant references on table "public"."workspace_cron_executions" to "anon";

grant
select
    on table "public"."workspace_cron_executions" to "anon";

grant trigger on table "public"."workspace_cron_executions" to "anon";

grant truncate on table "public"."workspace_cron_executions" to "anon";

grant
update
    on table "public"."workspace_cron_executions" to "anon";

grant delete on table "public"."workspace_cron_executions" to "authenticated";

grant
insert
    on table "public"."workspace_cron_executions" to "authenticated";

grant references on table "public"."workspace_cron_executions" to "authenticated";

grant
select
    on table "public"."workspace_cron_executions" to "authenticated";

grant trigger on table "public"."workspace_cron_executions" to "authenticated";

grant truncate on table "public"."workspace_cron_executions" to "authenticated";

grant
update
    on table "public"."workspace_cron_executions" to "authenticated";

grant delete on table "public"."workspace_cron_executions" to "service_role";

grant
insert
    on table "public"."workspace_cron_executions" to "service_role";

grant references on table "public"."workspace_cron_executions" to "service_role";

grant
select
    on table "public"."workspace_cron_executions" to "service_role";

grant trigger on table "public"."workspace_cron_executions" to "service_role";

grant truncate on table "public"."workspace_cron_executions" to "service_role";

grant
update
    on table "public"."workspace_cron_executions" to "service_role";