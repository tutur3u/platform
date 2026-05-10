alter table public.hive_npc_runs
add column if not exists prompt_mode text not null default 'enhanced'
check (prompt_mode in ('default', 'enhanced', 'custom'));

alter table public.hive_npc_memories
add column if not exists source_run_id uuid
references public.hive_npc_runs(id) on update cascade on delete set null;
