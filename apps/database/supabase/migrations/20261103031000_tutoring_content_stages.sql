-- One atomic swap is required. The migration runner wraps multi-statement files
-- in a transaction, so CREATE INDEX CONCURRENTLY is unavailable here.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Constant default is metadata-only on supported PostgreSQL versions.
alter table private.tutoring_notification_receipts
  add column stage text not null default 'n1'
  constraint tutoring_notification_receipts_stage_check check (stage in ('n1','n2','n3'));
-- A pre-stage weak-content receipt is the teacher alert, so it is N2 history of
-- its cycle (N1 is the session-completed notice). Use the processor's excluded
-- workspace identity, hashed to avoid duplicating its raw ID. Both timeouts above
-- cover this data step as well as the schema changes.
update private.tutoring_notification_receipts r set stage='n2'
  from public.workspace_user_groups g
  where r.group_id=g.id and r.kind='weak_content_review_due'
    and md5(g.ws_id::text) <> 'c736c4be0acb08f8625bb5ebe9ad8fe2';
create unique index tutoring_notification_receipts_stage_key
  on private.tutoring_notification_receipts
  (group_id, student_user_id, review_cycle_started_at, recipient_user_id, stage);
alter table private.tutoring_notification_receipts
  drop constraint tutoring_notification_receipts_review_key;

-- Review clocks remain controlled by the existing authorized review operation.
-- A bounded scan must advance past already-notified or unlinked students.
create table private.tutoring_content_scan_cursor (
  singleton boolean primary key default true check(singleton), after_id uuid
);
alter table private.tutoring_content_scan_cursor enable row level security;
revoke all on private.tutoring_content_scan_cursor from public,anon,authenticated;

-- Effective review cycle per authorized review boundary. Members can edit,
-- toggle, revert or replace user_feedbacks rows over the Data API, so the cycle
-- is fixed when the processor first observes the episode and only a newer
-- authorized review (private.tutoring_weak_support_reviews, service role only)
-- opens the next one. '-infinity' marks "no authorized review yet".
create table private.tutoring_content_review_episodes (
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  student_user_id uuid not null references public.workspace_users(id) on delete cascade,
  review_boundary timestamptz not null,
  cycle_started_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (group_id, student_user_id, review_boundary)
);
create index tutoring_content_review_episodes_student_idx
  on private.tutoring_content_review_episodes (student_user_id);
alter table private.tutoring_content_review_episodes enable row level security;
revoke all on private.tutoring_content_review_episodes from public,anon,authenticated;
grant select on private.tutoring_content_review_episodes to service_role;

create function private.process_tutoring_content_rules(p_limit integer default 1000)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '25s'
as $$
declare
  note record;
  scanned integer := 0;
  target record;
  cycle timestamptz;
  boundary timestamptz;
  scan_limit integer := greatest(1,least(coalesce(p_limit,1000),1000));
  n2_at timestamptz;
  stage_name text;
  receipt_id uuid;
  notice_id uuid;
  sent integer := 0;
  n2_days integer;
  n3_days integer;
  office_group text;
begin
  -- Serialize processor runs.
  if not pg_try_advisory_xact_lock(hashtextextended('tutoring_content_rules',0)) then
    return jsonb_build_object('sent',0);
  end if;
  -- Kill switch first: with no enabled non-EC workspace there is no eligible
  -- population, so the run returns before its first derived write (cursor,
  -- episode, receipt or notification).
  if not exists(select 1 from public.workspace_configs flag
      where flag.id='tutoring_content_rules' and flag.value='true'
        and flag.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid) then
    return jsonb_build_object('sent',0);
  end if;
  for note in
    select f.*, g.ws_id from public.user_feedbacks f
    join public.workspace_user_groups g on g.id=f.group_id
    join public.workspace_users u on u.id=f.user_id and u.ws_id=g.ws_id
    join public.workspace_configs flag on flag.ws_id=g.ws_id
      and flag.id='tutoring_content_rules' and flag.value='true'
    where g.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid and f.require_attention
      and f.id>coalesce((select after_id from private.tutoring_content_scan_cursor), '00000000-0000-0000-0000-000000000000'::uuid)
      and exists(select 1 from public.workspace_user_groups_users m
        where m.group_id=f.group_id and m.user_id=f.user_id and m.role='STUDENT')
      and not exists(select 1 from public.user_feedbacks newer
        where newer.group_id=f.group_id and newer.user_id=f.user_id
          and (newer.created_at,newer.id)>(f.created_at,f.id))
    order by f.id
    limit scan_limit
    for update of f skip locked
  loop
    scanned := scanned+1;
    receipt_id := null;
    select coalesce(max(r.last_reviewed_at),'-infinity') into boundary
      from private.tutoring_weak_support_reviews r
      where r.group_id=note.group_id and r.student_user_id=note.user_id;
    select e.cycle_started_at into cycle from private.tutoring_content_review_episodes e
      where e.group_id=note.group_id and e.student_user_id=note.user_id and e.review_boundary=boundary;
    if cycle is null then
      -- Keep existing N2 history of this episode; otherwise start at the later
      -- of the authorized review and the observed note, never in the future.
      select min(rc.review_cycle_started_at) into cycle from private.tutoring_notification_receipts rc
        where rc.group_id=note.group_id and rc.student_user_id=note.user_id
          and rc.stage='n2' and rc.review_cycle_started_at>=boundary;
      cycle := coalesce(cycle, greatest(least(coalesce(note.created_at,now()),now()),boundary));
      insert into private.tutoring_content_review_episodes(group_id,student_user_id,review_boundary,cycle_started_at)
        values(note.group_id,note.user_id,boundary,cycle) on conflict do nothing;
    end if;
    select coalesce(max(case when id='tutoring_content_rules_n2_days' and value ~ '^[0-9]{1,3}$' then greatest(1,value::integer) end),14),
      coalesce(max(case when id='tutoring_content_rules_n3_days' and value ~ '^[0-9]{1,3}$' then greatest(1,value::integer) end),14),
      max(case when id='tutoring_content_rules_office_group' then value end)
      into n2_days,n3_days,office_group
      from public.workspace_configs where ws_id=note.ws_id;
    if now()<cycle+make_interval(days=>n2_days) then
      insert into private.tutoring_content_scan_cursor(singleton,after_id) values(true,note.id)
        on conflict (singleton) do update set after_id=excluded.after_id;
      continue;
    end if;
    select min(created_at) into n2_at from private.tutoring_notification_receipts
      where group_id=note.group_id and student_user_id=note.user_id
        and review_cycle_started_at=cycle and stage='n2';
    stage_name := case when n2_at is not null and now()>=n2_at+make_interval(days=>n3_days) then 'n3' else 'n2' end;
    for target in
      select distinct l.platform_user_id as user_id
      from public.workspace_user_groups_users m
      join public.workspace_user_linked_users l on l.virtual_user_id=m.user_id and l.ws_id=note.ws_id
      join public.workspace_members wm on wm.user_id=l.platform_user_id and wm.ws_id=note.ws_id
      where stage_name='n2' and m.group_id=note.group_id and m.role='TEACHER'
      union
      select wm.user_id from public.workspace_members wm
      where stage_name='n3' and wm.ws_id=note.ws_id and (
        (office_group is null and (public.has_workspace_permission(note.ws_id,wm.user_id,'admin')
          or public.has_workspace_permission(note.ws_id,wm.user_id,'approve_reports')))
        or exists(select 1 from public.workspace_user_groups_users m
          join public.workspace_user_groups g on g.id=m.group_id and g.ws_id=note.ws_id
          join public.workspace_user_linked_users l on l.virtual_user_id=m.user_id and l.ws_id=note.ws_id
          where m.group_id::text=office_group and l.platform_user_id=wm.user_id))
    loop
      receipt_id := null;
      insert into private.tutoring_notification_receipts(kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,stage)
        values('weak_content_review_due',note.group_id,note.user_id,cycle,target.user_id,stage_name)
        on conflict do nothing returning id into receipt_id;
      if receipt_id is null then continue; end if;
      -- Direct in-app insert intentionally bypasses create_notification's email
      -- batching. Receipt and notification commit or roll back together.
      insert into public.notifications(ws_id,user_id,type,code,title,description,scope,entity_type,entity_id,data)
        values(note.ws_id,target.user_id,'tutoring_weak_content_review_due','tutoring_weak_content_review_due',
          case when stage_name='n2' then 'Có cần thay đổi nội dung kèm không?' else 'Nội dung kèm chưa được cập nhật' end,
          case when stage_name='n2' then 'Review the learner’s tutoring content.' else 'Tutoring content remains unchanged after the teacher reminder.' end,
          'workspace','user_group',note.group_id,jsonb_build_object('stage',stage_name,'studentUserId',note.user_id))
        returning id into notice_id;
      update private.tutoring_notification_receipts set notification_id=notice_id where id=receipt_id;
      sent := sent+1;
      if sent>=scan_limit then return jsonb_build_object('sent',sent); end if;
    end loop;
    insert into private.tutoring_content_scan_cursor(singleton,after_id) values(true,note.id)
      on conflict (singleton) do update set after_id=excluded.after_id;
    if stage_name='n2' and n2_at is null and receipt_id is null then
      raise log 'Tutoring content reminder skipped: no linked GVCN';
    end if;
  end loop;
  -- Wrap only an advanced cursor; an already-empty cursor is not rewritten.
  if scanned<scan_limit then
    update private.tutoring_content_scan_cursor set after_id=null where after_id is not null;
  end if;
  return jsonb_build_object('sent',sent);
end $$;
revoke all on function private.process_tutoring_content_rules(integer) from public,anon,authenticated;
grant execute on function private.process_tutoring_content_rules(integer) to service_role;
notify pgrst, 'reload schema';
