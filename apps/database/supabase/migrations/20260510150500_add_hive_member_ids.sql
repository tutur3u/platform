alter table public.hive_members
add column if not exists id uuid not null default gen_random_uuid();

create unique index if not exists hive_members_id_key
on public.hive_members (id);
