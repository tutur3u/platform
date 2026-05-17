alter table public.hive_npc_runs
  add column if not exists interaction_id uuid,
  add column if not exists target_npc_id uuid references public.hive_npcs(id) on update cascade on delete set null,
  add column if not exists trigger text not null default 'manual',
  add column if not exists status text not null default 'completed',
  add column if not exists error text,
  add column if not exists llm_provider text,
  add column if not exists llm_model text,
  add column if not exists llm_cost numeric(12, 6) not null default 0,
  add column if not exists input_tokens integer not null default 0,
  add column if not exists output_tokens integer not null default 0,
  add column if not exists reasoning_tokens integer not null default 0,
  add column if not exists credits_deducted numeric(12, 6) not null default 0,
  add column if not exists credit_ws_id uuid references public.workspaces(id) on update cascade on delete set null,
  add column if not exists credit_source text,
  add column if not exists autonomous boolean not null default false;

do $$
begin
  alter table public.hive_npc_runs
    add constraint hive_npc_runs_trigger_check
    check (trigger in ('manual', 'autonomous', 'workflow', 'simulation', 'cron'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.hive_npc_runs
    add constraint hive_npc_runs_status_check
    check (status in ('running', 'completed', 'failed', 'skipped'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.hive_npc_runs
    add constraint hive_npc_runs_credit_source_check
    check (credit_source is null or credit_source in ('personal', 'workspace'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.hive_npc_runs
    add constraint hive_npc_runs_non_negative_usage_check
    check (
      input_tokens >= 0
      and output_tokens >= 0
      and reasoning_tokens >= 0
      and llm_cost >= 0
      and credits_deducted >= 0
    );
exception
  when duplicate_object then null;
end $$;

create index if not exists hive_npc_runs_server_created_idx
  on public.hive_npc_runs (server_id, created_at desc);

create index if not exists hive_npc_runs_interaction_idx
  on public.hive_npc_runs (interaction_id, created_at)
  where interaction_id is not null;

create index if not exists hive_npc_runs_server_target_created_idx
  on public.hive_npc_runs (server_id, target_npc_id, created_at desc)
  where target_npc_id is not null;

create index if not exists hive_npc_runs_credit_ws_created_idx
  on public.hive_npc_runs (credit_ws_id, created_at desc)
  where credit_ws_id is not null;
