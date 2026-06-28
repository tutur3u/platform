create table if not exists private.inventory_square_app_credentials (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null,
  application_id text,
  application_secret_encrypted text,
  application_secret_fingerprint text,
  application_secret_last4 text,
  oauth_redirect_url text,
  webhook_notification_url text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_square_app_credentials_environment_check
    check (environment in ('sandbox', 'production')),
  constraint inventory_square_app_credentials_ws_environment_key
    unique (ws_id, environment),
  constraint inventory_square_app_credentials_secret_metadata_check
    check (
      application_secret_encrypted is not null
      or (
        application_secret_fingerprint is null
        and application_secret_last4 is null
      )
    )
);

create index if not exists inventory_square_app_credentials_ws_id_idx
  on private.inventory_square_app_credentials (ws_id);

alter table private.inventory_square_app_credentials enable row level security;

revoke all on table private.inventory_square_app_credentials
  from anon, authenticated;

grant all on table private.inventory_square_app_credentials to service_role;
