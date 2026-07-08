create table if not exists private.app_token_invitation_action_replays (
  token_jti text primary key,
  user_id uuid not null,
  target_app text not null,
  workspace_id text not null,
  action text not null check (action in ('accept', 'reject')),
  consumed_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_app_token_invitation_action_replays_expires_at
  on private.app_token_invitation_action_replays (expires_at);

revoke all on table private.app_token_invitation_action_replays
  from anon, authenticated;

grant all on table private.app_token_invitation_action_replays
  to service_role;

alter table private.app_token_invitation_action_replays
  enable row level security;

comment on table private.app_token_invitation_action_replays is
  'One-time replay protection for external app pending invitation accept/reject action tokens.';
