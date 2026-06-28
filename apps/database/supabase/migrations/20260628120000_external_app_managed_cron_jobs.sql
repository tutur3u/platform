-- External-app-owned managed cron jobs.
-- Nullable keys keep existing workspace cron jobs untouched while allowing
-- deterministic idempotent setup for first-party integrations.

alter table public.workspace_cron_jobs
  add column if not exists external_app_id text,
  add column if not exists external_job_key text;

create unique index if not exists workspace_cron_jobs_external_app_job_unique
  on public.workspace_cron_jobs (ws_id, external_app_id, external_job_key)
  where external_app_id is not null
    and external_job_key is not null;

create index if not exists workspace_cron_jobs_external_app_idx
  on public.workspace_cron_jobs (external_app_id, external_job_key)
  where external_app_id is not null
    and external_job_key is not null;

comment on column public.workspace_cron_jobs.external_app_id is
  'External app id that owns this managed cron job, when provisioned through an external app setup flow.';

comment on column public.workspace_cron_jobs.external_job_key is
  'Deterministic external-app job key used for idempotent setup and run-now operations.';
