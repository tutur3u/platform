-- Account links between a Tuturuuu user and an account on a registered
-- external app (Upskii). See apps/docs/platform/features/upskii-account-link.mdx.
--
-- Access model: the table is in the private schema and reachable only by the
-- service role. The link, unlink and introspect routes in apps/web authorise
-- the user session or the external app's secret before touching rows. RLS is
-- enabled with no policies, so any role other than the service role is denied.
-- Rows hold no credentials. Revoked rows are kept as the link history, with
-- external_email cleared on revoke.

create table private.external_account_links (
  id uuid primary key default gen_random_uuid(),
  -- Deleting the Tuturuuu account deletes its links.
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('upskii')),
  external_subject text not null
    check (char_length(external_subject) between 1 and 128),
  external_email text
    check (external_email is null or char_length(external_email) <= 320),
  scopes text[] not null default '{}'
    check (
      scopes <@ array[
        'upskii:assessments:read',
        'upskii:classes:read',
        'upskii:lessons:read'
      ]::text[]
    ),
  -- jti of the link-only bearer that last wrote this row; a bearer links once.
  link_jti uuid unique,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text check (revoked_by in ('user', 'provider', 'admin')),
  check ((revoked_at is null) = (revoked_by is null))
);

-- One active link per Tuturuuu account and per external account.
create unique index external_account_links_active_user_idx
  on private.external_account_links (user_id, provider)
  where revoked_at is null;
create unique index external_account_links_active_subject_idx
  on private.external_account_links (provider, external_subject)
  where revoked_at is null;

alter table private.external_account_links enable row level security;

grant usage on schema private to service_role;

revoke all on table private.external_account_links
from public, anon, authenticated, service_role;

grant select, insert, update on table private.external_account_links
to service_role;
