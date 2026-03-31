-- Default included user groups can grow with workspace size.
-- Store them in a dedicated join table instead of a comma-separated config blob.

create table if not exists public.workspace_default_included_user_groups (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (ws_id, group_id)
);

alter table public.workspace_default_included_user_groups enable row level security;

grant select on table public.workspace_default_included_user_groups to authenticated;
grant insert on table public.workspace_default_included_user_groups to authenticated;
grant update on table public.workspace_default_included_user_groups to authenticated;
grant delete on table public.workspace_default_included_user_groups to authenticated;

grant select on table public.workspace_default_included_user_groups to service_role;
grant insert on table public.workspace_default_included_user_groups to service_role;
grant update on table public.workspace_default_included_user_groups to service_role;
grant delete on table public.workspace_default_included_user_groups to service_role;

insert into public.workspace_default_included_user_groups (ws_id, group_id)
select distinct
  wc.ws_id,
  split.group_id::uuid
from public.workspace_configs wc
cross join lateral (
  select trim(value) as group_id
  from regexp_split_to_table(coalesce(wc.value, ''), ',') as value
) split
join public.workspace_user_groups wug
  on wug.id = split.group_id::uuid
  and wug.ws_id = wc.ws_id
where wc.id = 'DATABASE_DEFAULT_INCLUDED_GROUPS'
  and split.group_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (ws_id, group_id) do nothing;

delete from public.workspace_configs
where id = 'DATABASE_DEFAULT_INCLUDED_GROUPS';
