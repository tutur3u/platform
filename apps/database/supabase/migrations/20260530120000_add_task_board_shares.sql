-- Share task boards directly with authenticated users without adding them as
-- workspace members. This mirrors task_shares semantics at board scope.

create table if not exists public.task_board_shares (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.workspace_boards(id) on delete cascade,
  shared_with_user_id uuid references public.users(id) on delete cascade,
  shared_with_email text,
  permission public.task_share_permission not null default 'view',
  shared_by_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_board_shares_has_recipient check (
    shared_with_user_id is not null or shared_with_email is not null
  ),
  constraint task_board_shares_email_is_normalized check (
    shared_with_email is null or shared_with_email = lower(trim(shared_with_email))
  ),
  constraint task_board_shares_user_unique unique (board_id, shared_with_user_id)
);

create unique index if not exists task_board_shares_email_unique_idx
  on public.task_board_shares (board_id, lower(shared_with_email))
  where shared_with_email is not null;

create index if not exists task_board_shares_board_id_idx
  on public.task_board_shares(board_id);

create index if not exists task_board_shares_shared_with_user_id_idx
  on public.task_board_shares(shared_with_user_id);

create index if not exists task_board_shares_shared_with_email_idx
  on public.task_board_shares(shared_with_email)
  where shared_with_email is not null;

create or replace function public.touch_task_board_shares_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists task_board_shares_touch_updated_at on public.task_board_shares;
create trigger task_board_shares_touch_updated_at
before update on public.task_board_shares
for each row execute function public.touch_task_board_shares_updated_at();

create or replace function public.get_task_board_workspace_id(p_board_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select wb.ws_id
  from public.workspace_boards wb
  where wb.id = p_board_id;
$$;

create or replace function public.is_task_board_workspace_member(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_boards wb
    join public.workspace_members wm on wm.ws_id = wb.ws_id
    where wb.id = p_board_id and wm.user_id = auth.uid()
  );
$$;

alter table public.task_board_shares enable row level security;

create policy "Allow workspace members to view task board shares"
on public.task_board_shares
for select
to authenticated
using (public.is_task_board_workspace_member(board_id));

create policy "Allow recipients to view their own task board shares"
on public.task_board_shares
for select
to authenticated
using (
  shared_with_user_id = auth.uid()
  or shared_with_email = lower((
    select upd.email
    from public.user_private_details upd
    where upd.user_id = auth.uid()
  ))
);

create policy "Allow workspace members to create task board shares"
on public.task_board_shares
for insert
to authenticated
with check (
  public.is_task_board_workspace_member(board_id)
  and shared_by_user_id = auth.uid()
);

create policy "Allow workspace members to update task board shares"
on public.task_board_shares
for update
to authenticated
using (public.is_task_board_workspace_member(board_id))
with check (public.is_task_board_workspace_member(board_id));

create policy "Allow workspace members to delete task board shares"
on public.task_board_shares
for delete
to authenticated
using (public.is_task_board_workspace_member(board_id));
