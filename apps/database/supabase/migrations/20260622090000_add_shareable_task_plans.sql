-- First-class task plans for personal Kanban planning.
-- Plans are user-owned, may target multiple workspaces, and may be shared with
-- specific users/emails or members of intended workspaces.

create table if not exists public.task_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  personal_ws_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  period_type text not null check (period_type in ('week', 'month', 'year')),
  period_start date not null,
  period_end date not null,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 128),
  status text not null default 'draft' check (status in ('draft', 'active', 'sent', 'archived')),
  default_target_ws_id uuid null references public.workspaces(id) on delete set null,
  default_target_board_id uuid null references public.workspace_boards(id) on delete set null,
  default_target_list_id uuid null references public.task_lists(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint task_plans_period_order check (period_end >= period_start)
);

create index if not exists task_plans_owner_idx
  on public.task_plans(owner_id, period_type, period_start desc);

create index if not exists task_plans_personal_ws_idx
  on public.task_plans(personal_ws_id, period_type, period_start desc);

create table if not exists public.task_plan_workspaces (
  plan_id uuid not null references public.task_plans(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  added_by_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, ws_id)
);

create index if not exists task_plan_workspaces_ws_idx
  on public.task_plan_workspaces(ws_id, plan_id);

create table if not exists public.task_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.task_plans(id) on delete cascade,
  task_id uuid null references public.tasks(id) on delete set null,
  target_ws_id uuid null references public.workspaces(id) on delete set null,
  target_board_id uuid null references public.workspace_boards(id) on delete set null,
  target_list_id uuid null references public.task_lists(id) on delete set null,
  planned_start date null,
  planned_end date null,
  sort_key double precision not null default 1000000,
  status text not null default 'planned' check (status in ('draft', 'planned', 'in_progress', 'done', 'removed')),
  notes text null check (notes is null or char_length(notes) <= 10000),
  snapshot_title text null check (snapshot_title is null or char_length(snapshot_title) <= 256),
  created_by_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_plan_items_planned_order check (
    planned_end is null or planned_start is null or planned_end >= planned_start
  )
);

create index if not exists task_plan_items_plan_idx
  on public.task_plan_items(plan_id, planned_start, sort_key);

create index if not exists task_plan_items_task_idx
  on public.task_plan_items(task_id)
  where task_id is not null;

create index if not exists task_plan_items_target_ws_idx
  on public.task_plan_items(target_ws_id)
  where target_ws_id is not null;

create table if not exists public.task_plan_shares (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.task_plans(id) on delete cascade,
  shared_with_ws_id uuid null references public.workspaces(id) on delete cascade,
  shared_with_user_id uuid null references public.users(id) on delete cascade,
  shared_with_email text null,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  shared_by_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_plan_shares_has_single_recipient check (
    ((shared_with_ws_id is not null)::int +
     (shared_with_user_id is not null)::int +
     (shared_with_email is not null)::int) = 1
  ),
  constraint task_plan_shares_email_is_normalized check (
    shared_with_email is null or shared_with_email = lower(trim(shared_with_email))
  )
);

create unique index if not exists task_plan_shares_ws_unique_idx
  on public.task_plan_shares(plan_id, shared_with_ws_id)
  where shared_with_ws_id is not null;

create unique index if not exists task_plan_shares_user_unique_idx
  on public.task_plan_shares(plan_id, shared_with_user_id)
  where shared_with_user_id is not null;

create unique index if not exists task_plan_shares_email_unique_idx
  on public.task_plan_shares(plan_id, lower(shared_with_email))
  where shared_with_email is not null;

create index if not exists task_plan_shares_plan_idx
  on public.task_plan_shares(plan_id);

create index if not exists task_plan_shares_ws_idx
  on public.task_plan_shares(shared_with_ws_id)
  where shared_with_ws_id is not null;

create index if not exists task_plan_shares_user_idx
  on public.task_plan_shares(shared_with_user_id)
  where shared_with_user_id is not null;

create or replace function public.touch_task_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists task_plans_touch_updated_at on public.task_plans;
create trigger task_plans_touch_updated_at
before update on public.task_plans
for each row execute function public.touch_task_plans_updated_at();

drop trigger if exists task_plan_items_touch_updated_at on public.task_plan_items;
create trigger task_plan_items_touch_updated_at
before update on public.task_plan_items
for each row execute function public.touch_task_plans_updated_at();

drop trigger if exists task_plan_shares_touch_updated_at on public.task_plan_shares;
create trigger task_plan_shares_touch_updated_at
before update on public.task_plan_shares
for each row execute function public.touch_task_plans_updated_at();

create or replace function public.is_task_plan_workspace_member(p_ws_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.ws_id = p_ws_id
      and wm.user_id = p_user_id
      and wm.type = 'MEMBER'
  );
$$;

create or replace function public.is_task_plan_personal_workspace(p_ws_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    join public.workspace_members wm on wm.ws_id = w.id
    where w.id = p_ws_id
      and w.personal = true
      and wm.user_id = p_user_id
  );
$$;

create or replace function public.can_access_task_plan(
  p_plan_id uuid,
  p_required_permission text default 'view',
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with actor_email as (
    select lower(trim(upd.email)) as email
    from public.user_private_details upd
    where upd.user_id = p_user_id
  ),
  matched_permissions as (
    select 'edit'::text as permission
    from public.task_plans tp
    where tp.id = p_plan_id
      and tp.owner_id = p_user_id

    union all

    select tps.permission
    from public.task_plan_shares tps
    where tps.plan_id = p_plan_id
      and (
        tps.shared_with_user_id = p_user_id
        or (
          tps.shared_with_email is not null
          and tps.shared_with_email = (select email from actor_email)
        )
        or (
          tps.shared_with_ws_id is not null
          and public.is_task_plan_workspace_member(tps.shared_with_ws_id, p_user_id)
        )
      )
  )
  select exists (
    select 1
    from matched_permissions mp
    where p_required_permission = 'view'
      or mp.permission = 'edit'
  );
$$;

create or replace function public.is_task_plan_intended_workspace(
  p_plan_id uuid,
  p_ws_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_plan_workspaces tpw
    where tpw.plan_id = p_plan_id
      and tpw.ws_id = p_ws_id
  );
$$;

alter table public.task_plans enable row level security;
alter table public.task_plan_workspaces enable row level security;
alter table public.task_plan_items enable row level security;
alter table public.task_plan_shares enable row level security;

drop policy if exists "task_plans_select_accessible" on public.task_plans;
create policy "task_plans_select_accessible"
  on public.task_plans
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.can_access_task_plan(id, 'view')
  );

drop policy if exists "task_plans_insert_own" on public.task_plans;
create policy "task_plans_insert_own"
  on public.task_plans
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and public.is_task_plan_personal_workspace(personal_ws_id, auth.uid())
  );

drop policy if exists "task_plans_update_editors" on public.task_plans;
create policy "task_plans_update_editors"
  on public.task_plans
  for update
  to authenticated
  using (public.can_access_task_plan(id, 'edit'))
  with check (public.can_access_task_plan(id, 'edit'));

drop policy if exists "task_plans_delete_owner" on public.task_plans;
create policy "task_plans_delete_owner"
  on public.task_plans
  for delete
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "task_plan_workspaces_select_accessible" on public.task_plan_workspaces;
create policy "task_plan_workspaces_select_accessible"
  on public.task_plan_workspaces
  for select
  to authenticated
  using (public.can_access_task_plan(plan_id, 'view'));

drop policy if exists "task_plan_workspaces_insert_editors" on public.task_plan_workspaces;
create policy "task_plan_workspaces_insert_editors"
  on public.task_plan_workspaces
  for insert
  to authenticated
  with check (
    public.can_access_task_plan(plan_id, 'edit')
    and added_by_user_id = auth.uid()
    and public.is_task_plan_workspace_member(ws_id, auth.uid())
  );

drop policy if exists "task_plan_workspaces_delete_editors" on public.task_plan_workspaces;
create policy "task_plan_workspaces_delete_editors"
  on public.task_plan_workspaces
  for delete
  to authenticated
  using (public.can_access_task_plan(plan_id, 'edit'));

drop policy if exists "task_plan_items_select_accessible" on public.task_plan_items;
create policy "task_plan_items_select_accessible"
  on public.task_plan_items
  for select
  to authenticated
  using (public.can_access_task_plan(plan_id, 'view'));

drop policy if exists "task_plan_items_insert_editors" on public.task_plan_items;
create policy "task_plan_items_insert_editors"
  on public.task_plan_items
  for insert
  to authenticated
  with check (
    public.can_access_task_plan(plan_id, 'edit')
    and created_by_user_id = auth.uid()
    and (
      target_ws_id is null
      or (
        public.is_task_plan_intended_workspace(plan_id, target_ws_id)
        and public.is_task_plan_workspace_member(target_ws_id, auth.uid())
      )
    )
  );

drop policy if exists "task_plan_items_update_editors" on public.task_plan_items;
create policy "task_plan_items_update_editors"
  on public.task_plan_items
  for update
  to authenticated
  using (public.can_access_task_plan(plan_id, 'edit'))
  with check (
    public.can_access_task_plan(plan_id, 'edit')
    and (
      target_ws_id is null
      or (
        public.is_task_plan_intended_workspace(plan_id, target_ws_id)
        and public.is_task_plan_workspace_member(target_ws_id, auth.uid())
      )
    )
  );

drop policy if exists "task_plan_items_delete_editors" on public.task_plan_items;
create policy "task_plan_items_delete_editors"
  on public.task_plan_items
  for delete
  to authenticated
  using (public.can_access_task_plan(plan_id, 'edit'));

drop policy if exists "task_plan_shares_select_accessible" on public.task_plan_shares;
create policy "task_plan_shares_select_accessible"
  on public.task_plan_shares
  for select
  to authenticated
  using (public.can_access_task_plan(plan_id, 'view'));

drop policy if exists "task_plan_shares_insert_owner" on public.task_plan_shares;
create policy "task_plan_shares_insert_owner"
  on public.task_plan_shares
  for insert
  to authenticated
  with check (
    shared_by_user_id = auth.uid()
    and exists (
      select 1
      from public.task_plans tp
      where tp.id = plan_id
        and tp.owner_id = auth.uid()
    )
    and (
      shared_with_ws_id is null
      or public.is_task_plan_intended_workspace(plan_id, shared_with_ws_id)
    )
  );

drop policy if exists "task_plan_shares_update_owner" on public.task_plan_shares;
create policy "task_plan_shares_update_owner"
  on public.task_plan_shares
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.task_plans tp
      where tp.id = plan_id
        and tp.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.task_plans tp
      where tp.id = plan_id
        and tp.owner_id = auth.uid()
    )
    and (
      shared_with_ws_id is null
      or public.is_task_plan_intended_workspace(plan_id, shared_with_ws_id)
    )
  );

drop policy if exists "task_plan_shares_delete_owner" on public.task_plan_shares;
create policy "task_plan_shares_delete_owner"
  on public.task_plan_shares
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.task_plans tp
      where tp.id = plan_id
        and tp.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on table public.task_plans to authenticated;
grant select, insert, update, delete on table public.task_plan_workspaces to authenticated;
grant select, insert, update, delete on table public.task_plan_items to authenticated;
grant select, insert, update, delete on table public.task_plan_shares to authenticated;

grant all privileges on table public.task_plans to service_role;
grant all privileges on table public.task_plan_workspaces to service_role;
grant all privileges on table public.task_plan_items to service_role;
grant all privileges on table public.task_plan_shares to service_role;

grant execute on function public.is_task_plan_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.is_task_plan_personal_workspace(uuid, uuid) to authenticated;
grant execute on function public.can_access_task_plan(uuid, text, uuid) to authenticated;
grant execute on function public.is_task_plan_intended_workspace(uuid, uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');
