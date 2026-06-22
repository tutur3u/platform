-- Link-only public task board sharing. Public reads stay behind server-owned
-- API/page loaders that return sanitized board data.

create table if not exists public.task_board_public_links (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.workspace_boards(id) on delete cascade,
  code text not null default encode(gen_random_bytes(18), 'hex'),
  created_by_user_id uuid not null references public.users(id) on delete cascade,
  enabled boolean not null default true,
  disabled_at timestamptz,
  disabled_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_board_public_links_code_normalized check (
    code = lower(trim(code)) and length(code) >= 24
  ),
  constraint task_board_public_links_disabled_consistent check (
    (enabled and disabled_at is null and disabled_by_user_id is null)
    or (not enabled)
  )
);

create unique index if not exists task_board_public_links_code_unique_idx
  on public.task_board_public_links (code);

create unique index if not exists task_board_public_links_enabled_board_unique_idx
  on public.task_board_public_links (board_id)
  where enabled;

create index if not exists task_board_public_links_board_id_idx
  on public.task_board_public_links (board_id);

create index if not exists task_board_public_links_enabled_code_idx
  on public.task_board_public_links (code)
  where enabled;

create or replace function public.touch_task_board_public_links_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists task_board_public_links_touch_updated_at
on public.task_board_public_links;

create trigger task_board_public_links_touch_updated_at
before update on public.task_board_public_links
for each row execute function public.touch_task_board_public_links_updated_at();

alter table public.task_board_public_links enable row level security;

revoke all privileges on table public.task_board_public_links from public;
revoke all privileges on table public.task_board_public_links from anon;
revoke all privileges on table public.task_board_public_links from authenticated;
grant all privileges on table public.task_board_public_links to service_role;

revoke all privileges on function public.touch_task_board_public_links_updated_at()
from public;
revoke all privileges on function public.touch_task_board_public_links_updated_at()
from anon;
revoke all privileges on function public.touch_task_board_public_links_updated_at()
from authenticated;
grant execute on function public.touch_task_board_public_links_updated_at()
to service_role;

notify pgrst, 'reload schema';
