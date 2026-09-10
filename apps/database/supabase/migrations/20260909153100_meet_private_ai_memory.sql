-- Meet memory is a separate, explicit opt-in; platform defaults do not enable it.
create table public.meet_ai_user_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  memory_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.meet_ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  category text not null check (category in ('preference', 'fact', 'project')),
  created_at timestamptz not null default now()
);
create index meet_ai_memories_owner on public.meet_ai_memories(user_id, created_at desc);
alter table public.meet_ai_user_preferences enable row level security;
alter table public.meet_ai_memories enable row level security;
revoke all on public.meet_ai_user_preferences, public.meet_ai_memories from anon, authenticated;
grant select on public.meet_ai_user_preferences, public.meet_ai_memories to authenticated;
grant all on public.meet_ai_user_preferences, public.meet_ai_memories to service_role;
create policy meet_ai_preferences_owner on public.meet_ai_user_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy meet_ai_memories_owner on public.meet_ai_memories for select to authenticated using (user_id = (select auth.uid()));

-- Serialize the opt-in check and insertion, including concurrent disable requests.
create function public.save_meet_ai_memory(p_user_id uuid, p_content text, p_category text)
returns public.meet_ai_memories language plpgsql set search_path = '' as $$
declare
  enabled boolean;
  memory public.meet_ai_memories;
begin
  select memory_enabled into enabled from public.meet_ai_user_preferences where user_id = p_user_id for update;
  if enabled is distinct from true then raise exception 'Memory is disabled'; end if;
  select * into memory from public.meet_ai_memories where user_id = p_user_id and content = btrim(p_content) limit 1;
  if found then return memory; end if;
  if (select count(*) from public.meet_ai_memories where user_id = p_user_id) >= 100 then raise exception 'Memory limit reached'; end if;
  insert into public.meet_ai_memories(user_id, content, category) values(p_user_id, btrim(p_content), p_category) returning * into memory;
  return memory;
end;
$$;
revoke all on function public.save_meet_ai_memory(uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_meet_ai_memory(uuid, text, text) to service_role;
