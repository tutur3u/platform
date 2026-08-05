create type public.task_capacity_metric as enum ('task_count', 'estimation_points');
create type public.task_capacity_enforcement as enum ('soft', 'hard');
create type public.task_capacity_counting_mode as enum ('active', 'all_non_deleted');
create type public.task_capacity_match_mode as enum ('any', 'all');

create table public.task_capacity_rules (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.workspace_boards(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  enabled boolean not null default true,
  limit_value integer not null check (limit_value > 0),
  metric public.task_capacity_metric not null default 'task_count',
  enforcement public.task_capacity_enforcement not null default 'soft',
  counting_mode public.task_capacity_counting_mode not null default 'active',
  label_match_mode public.task_capacity_match_mode not null default 'any',
  project_match_mode public.task_capacity_match_mode not null default 'any',
  disabled_reason text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_capacity_rule_lists (
  rule_id uuid not null references public.task_capacity_rules(id) on delete cascade,
  list_id uuid not null references public.task_lists(id) on delete cascade,
  primary key (rule_id, list_id)
);

create table public.task_capacity_rule_labels (
  rule_id uuid not null references public.task_capacity_rules(id) on delete cascade,
  label_id uuid not null references public.workspace_task_labels(id) on delete cascade,
  primary key (rule_id, label_id)
);

create table public.task_capacity_rule_projects (
  rule_id uuid not null references public.task_capacity_rules(id) on delete cascade,
  project_id uuid not null references public.task_projects(id) on delete cascade,
  primary key (rule_id, project_id)
);

create index task_capacity_rules_board_id_idx on public.task_capacity_rules(board_id);
create index task_capacity_rule_lists_list_id_idx on public.task_capacity_rule_lists(list_id);
create index task_capacity_rule_labels_label_id_idx on public.task_capacity_rule_labels(label_id);
create index task_capacity_rule_projects_project_id_idx on public.task_capacity_rule_projects(project_id);

alter table public.task_capacity_rules enable row level security;
alter table public.task_capacity_rule_lists enable row level security;
alter table public.task_capacity_rule_labels enable row level security;
alter table public.task_capacity_rule_projects enable row level security;

grant select, insert, update, delete on public.task_capacity_rules to service_role;
grant select, insert, update, delete on public.task_capacity_rule_lists to service_role;
grant select, insert, update, delete on public.task_capacity_rule_labels to service_role;
grant select, insert, update, delete on public.task_capacity_rule_projects to service_role;

create or replace function private.task_matches_capacity_rule_state(
  p_rule_id uuid, p_task_id uuid, p_board_id uuid, p_list_id uuid,
  p_deleted_at timestamptz, p_completed boolean, p_completed_at timestamptz,
  p_closed_at timestamptz
) returns boolean
language sql stable security definer set search_path = public, private
as $$
  with selector_counts as (
    select
      (select count(*) from public.task_capacity_rule_lists where rule_id = p_rule_id) as lists,
      (select count(*) from public.task_capacity_rule_labels where rule_id = p_rule_id) as labels,
      (select count(*) from public.task_capacity_rule_projects where rule_id = p_rule_id) as projects
  )
  select exists (
    select 1 from public.task_capacity_rules r cross join selector_counts sc
    where r.id = p_rule_id and p_board_id = r.board_id and p_deleted_at is null
      and (r.counting_mode = 'all_non_deleted' or (
        p_completed_at is null and coalesce(p_completed, false) = false and p_closed_at is null and
        coalesce((select status::text from public.task_lists where id = p_list_id), '') not in ('done', 'closed')
      ))
      and (sc.lists = 0 or exists (select 1 from public.task_capacity_rule_lists s where s.rule_id = r.id and s.list_id = p_list_id))
      and (sc.labels = 0 or case r.label_match_mode
        when 'any' then exists (select 1 from public.task_capacity_rule_labels s join public.task_labels tl on tl.label_id = s.label_id and tl.task_id = p_task_id where s.rule_id = r.id)
        else not exists (select 1 from public.task_capacity_rule_labels s where s.rule_id = r.id and not exists (select 1 from public.task_labels tl where tl.task_id = p_task_id and tl.label_id = s.label_id)) end)
      and (sc.projects = 0 or case r.project_match_mode
        when 'any' then exists (select 1 from public.task_capacity_rule_projects s join public.task_project_tasks tp on tp.project_id = s.project_id and tp.task_id = p_task_id where s.rule_id = r.id)
        else not exists (select 1 from public.task_capacity_rule_projects s where s.rule_id = r.id and not exists (select 1 from public.task_project_tasks tp where tp.task_id = p_task_id and tp.project_id = s.project_id)) end)
  );
$$;

create or replace function private.task_matches_capacity_rule(
  p_rule_id uuid,
  p_task_id uuid
) returns boolean
language sql stable security definer set search_path = public, private
as $$
  with candidate as (
    select t.*, l.status as list_status
    from public.tasks t
    left join public.task_lists l on l.id = t.list_id
    where t.id = p_task_id
  ), selector_counts as (
    select
      (select count(*) from public.task_capacity_rule_lists where rule_id = p_rule_id) as lists,
      (select count(*) from public.task_capacity_rule_labels where rule_id = p_rule_id) as labels,
      (select count(*) from public.task_capacity_rule_projects where rule_id = p_rule_id) as projects
  )
  select exists (
    select 1
    from candidate t
    join public.task_capacity_rules r on r.id = p_rule_id
    cross join selector_counts sc
    where t.board_id = r.board_id
      and t.deleted_at is null
      and (r.counting_mode = 'all_non_deleted' or (
        t.completed_at is null and coalesce(t.completed, false) = false and
        t.closed_at is null and coalesce(t.list_status::text, '') not in ('done', 'closed')
      ))
      and (sc.lists = 0 or exists (
        select 1 from public.task_capacity_rule_lists s
        where s.rule_id = r.id and s.list_id = t.list_id
      ))
      and (sc.labels = 0 or case r.label_match_mode
        when 'any' then exists (
          select 1 from public.task_capacity_rule_labels s
          join public.task_labels tl on tl.label_id = s.label_id and tl.task_id = t.id
          where s.rule_id = r.id
        )
        else not exists (
          select 1 from public.task_capacity_rule_labels s
          where s.rule_id = r.id and not exists (
            select 1 from public.task_labels tl where tl.task_id = t.id and tl.label_id = s.label_id
          )
        ) end)
      and (sc.projects = 0 or case r.project_match_mode
        when 'any' then exists (
          select 1 from public.task_capacity_rule_projects s
          join public.task_project_tasks tp on tp.project_id = s.project_id and tp.task_id = t.id
          where s.rule_id = r.id
        )
        else not exists (
          select 1 from public.task_capacity_rule_projects s
          where s.rule_id = r.id and not exists (
            select 1 from public.task_project_tasks tp where tp.task_id = t.id and tp.project_id = s.project_id
          )
        ) end)
  );
$$;

create or replace function private.task_capacity_rule_usage(p_rule_id uuid)
returns integer
language sql stable security definer set search_path = public, private
as $$
  select coalesce(sum(case r.metric
    when 'task_count' then 1
    else coalesce(t.estimation_points, 0)
  end), 0)::integer
  from public.task_capacity_rules r
  join public.tasks t on t.board_id = r.board_id
  where r.id = p_rule_id and private.task_matches_capacity_rule(r.id, t.id);
$$;

create or replace function public.get_task_capacity_rules(p_board_id uuid)
returns table (
  id uuid, board_id uuid, name text, enabled boolean, limit_value integer,
  metric public.task_capacity_metric, enforcement public.task_capacity_enforcement,
  counting_mode public.task_capacity_counting_mode,
  label_match_mode public.task_capacity_match_mode,
  project_match_mode public.task_capacity_match_mode,
  disabled_reason text, created_by uuid, updated_by uuid,
  created_at timestamptz, updated_at timestamptz, current_value integer,
  list_ids uuid[], label_ids uuid[], project_ids uuid[]
)
language sql stable security definer set search_path = public, private
as $$
  select r.id, r.board_id, r.name, r.enabled, r.limit_value, r.metric,
    r.enforcement, r.counting_mode, r.label_match_mode, r.project_match_mode,
    r.disabled_reason, r.created_by, r.updated_by, r.created_at, r.updated_at,
    private.task_capacity_rule_usage(r.id),
    coalesce((select array_agg(s.list_id order by s.list_id) from public.task_capacity_rule_lists s where s.rule_id = r.id), '{}'),
    coalesce((select array_agg(s.label_id order by s.label_id) from public.task_capacity_rule_labels s where s.rule_id = r.id), '{}'),
    coalesce((select array_agg(s.project_id order by s.project_id) from public.task_capacity_rule_projects s where s.rule_id = r.id), '{}')
  from public.task_capacity_rules r where r.board_id = p_board_id order by r.created_at, r.id;
$$;

create or replace function private.enforce_task_capacity()
returns trigger
language plpgsql security definer set search_path = public, private
as $$
declare
  v_board_id uuid;
  v_rule public.task_capacity_rules%rowtype;
  v_usage integer;
  v_old_contribution integer;
  v_new_contribution integer;
begin
  select board_id into v_board_id from public.tasks where id = coalesce(new.id, old.id);
  if v_board_id is null then v_board_id := coalesce(new.board_id, old.board_id); end if;
  if v_board_id is null then select board_id into v_board_id from public.task_lists where id = coalesce(new.list_id, old.list_id); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_board_id::text, 72411));

  for v_rule in select * from public.task_capacity_rules
    where board_id = v_board_id and enabled and enforcement = 'hard'
    order by id
  loop
    v_usage := private.task_capacity_rule_usage(v_rule.id);
    v_new_contribution := case when private.task_matches_capacity_rule(v_rule.id, new.id)
      then case v_rule.metric when 'task_count' then 1 else coalesce(new.estimation_points, 0) end else 0 end;
    v_old_contribution := case when tg_op = 'UPDATE' and private.task_matches_capacity_rule_state(
      v_rule.id, old.id, old.board_id, old.list_id, old.deleted_at, old.completed, old.completed_at, old.closed_at
    )
      then case v_rule.metric when 'task_count' then 1 else coalesce(old.estimation_points, 0) end else 0 end;
    if v_usage > v_rule.limit_value and v_new_contribution > v_old_contribution then
      raise exception using
        errcode = 'P0001',
        message = 'TASK_CAPACITY_EXCEEDED',
        detail = json_build_object(
          'ruleId', v_rule.id, 'ruleName', v_rule.name, 'metric', v_rule.metric,
          'currentValue', v_usage - v_new_contribution,
          'attemptedValue', v_usage, 'limit', v_rule.limit_value
        )::text;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function private.lock_task_capacity_board()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_board_id uuid;
begin
  if tg_table_name = 'tasks' then
    v_board_id := coalesce(new.board_id, old.board_id);
    if v_board_id is null then
      select board_id into v_board_id from public.task_lists where id = coalesce(new.list_id, old.list_id);
    end if;
  else
    select board_id into v_board_id from public.tasks where id = coalesce(new.task_id, old.task_id);
  end if;
  if v_board_id is not null then perform pg_advisory_xact_lock(hashtextextended(v_board_id::text, 72411)); end if;
  return coalesce(new, old);
end;
$$;

create trigger lock_task_capacity_before_task_change before insert or update
on public.tasks for each row execute function private.lock_task_capacity_board();
create trigger lock_task_capacity_before_label_change before insert or delete
on public.task_labels for each row execute function private.lock_task_capacity_board();
create trigger lock_task_capacity_before_project_change before insert or delete
on public.task_project_tasks for each row execute function private.lock_task_capacity_board();

create trigger enforce_task_capacity_after_task_change
after insert or update of board_id, list_id, deleted_at, completed, completed_at, closed_at, estimation_points
on public.tasks for each row execute function private.enforce_task_capacity();

create or replace function private.enforce_task_relation_capacity()
returns trigger
language plpgsql security definer set search_path = public, private
as $$
declare
  v_task_id uuid := new.task_id;
  v_board_id uuid;
  v_rule public.task_capacity_rules%rowtype;
  v_usage integer;
  v_contribution integer;
  v_caused_match boolean;
begin
  select board_id into v_board_id from public.tasks where id = v_task_id;
  perform pg_advisory_xact_lock(hashtextextended(v_board_id::text, 72411));
  for v_rule in select * from public.task_capacity_rules
    where board_id = v_board_id and enabled and enforcement = 'hard' order by id
  loop
    v_usage := private.task_capacity_rule_usage(v_rule.id);
    v_contribution := case when private.task_matches_capacity_rule(v_rule.id, v_task_id)
      then case v_rule.metric when 'task_count' then 1 else coalesce((select estimation_points from public.tasks where id = v_task_id), 0) end else 0 end;
    if tg_table_name = 'task_labels' then
      v_caused_match := exists (select 1 from public.task_capacity_rule_labels where rule_id = v_rule.id and label_id = new.label_id)
        and (v_rule.label_match_mode = 'all' or not exists (
          select 1 from public.task_capacity_rule_labels s join public.task_labels tl on tl.label_id = s.label_id
          where s.rule_id = v_rule.id and tl.task_id = v_task_id and tl.label_id <> new.label_id
        ));
    else
      v_caused_match := exists (select 1 from public.task_capacity_rule_projects where rule_id = v_rule.id and project_id = new.project_id)
        and (v_rule.project_match_mode = 'all' or not exists (
          select 1 from public.task_capacity_rule_projects s join public.task_project_tasks tp on tp.project_id = s.project_id
          where s.rule_id = v_rule.id and tp.task_id = v_task_id and tp.project_id <> new.project_id
        ));
    end if;
    if v_usage > v_rule.limit_value and v_contribution > 0 and v_caused_match then
      raise exception using errcode = 'P0001', message = 'TASK_CAPACITY_EXCEEDED',
        detail = json_build_object('ruleId', v_rule.id, 'ruleName', v_rule.name,
          'metric', v_rule.metric, 'currentValue', v_usage - v_contribution,
          'attemptedValue', v_usage, 'limit', v_rule.limit_value)::text;
    end if;
  end loop;
  return new;
end;
$$;

create trigger enforce_task_capacity_after_label_add
after insert on public.task_labels for each row execute function private.enforce_task_relation_capacity();
create trigger enforce_task_capacity_after_project_add
after insert on public.task_project_tasks for each row execute function private.enforce_task_relation_capacity();

create or replace function private.disable_capacity_rule_for_removed_selector()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  update public.task_capacity_rules set enabled = false,
    disabled_reason = 'selector_deleted', updated_at = now()
  where id = old.rule_id;
  return old;
end;
$$;

create trigger disable_capacity_rule_before_list_selector_delete before delete on public.task_capacity_rule_lists
for each row execute function private.disable_capacity_rule_for_removed_selector();
create trigger disable_capacity_rule_before_label_selector_delete before delete on public.task_capacity_rule_labels
for each row execute function private.disable_capacity_rule_for_removed_selector();
create trigger disable_capacity_rule_before_project_selector_delete before delete on public.task_capacity_rule_projects
for each row execute function private.disable_capacity_rule_for_removed_selector();

revoke all on function public.get_task_capacity_rules(uuid) from public;
grant execute on function public.get_task_capacity_rules(uuid) to service_role;
comment on function public.get_task_capacity_rules(uuid) is
  'Returns board capacity rules, normalized selectors, and distinct task usage. Service role only; callers must authorize board access.';
