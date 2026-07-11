-- Audit log for user_group_post_checks so post-completion changes are
-- traceable and individual entries can be reverted (e.g. after an accidental
-- "check all"). Each row records the transition of a single member's
-- completion status. A null is_completed represents "no check / pending".
--
-- Access is intentionally gated by the application layer (the group-checks
-- API resolves the acting user and enforces post permissions before reading
-- or writing these rows via the service role). RLS is enabled with no
-- permissive policies so direct anon/authenticated access is denied.

create table if not exists private.user_group_post_check_logs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null
    references private.user_group_posts (id) on update cascade on delete cascade,
  user_id uuid not null
    references public.workspace_users (id) on update cascade on delete cascade,
  previous_is_completed boolean,
  new_is_completed boolean,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists user_group_post_check_logs_post_created_idx
  on private.user_group_post_check_logs (post_id, created_at desc);

create index if not exists user_group_post_check_logs_post_user_created_idx
  on private.user_group_post_check_logs (post_id, user_id, created_at desc);

alter table private.user_group_post_check_logs enable row level security;

comment on table private.user_group_post_check_logs is
  'Audit trail of user_group_post_checks completion changes; app-gated (service role), used for history + per-entry revert.';
