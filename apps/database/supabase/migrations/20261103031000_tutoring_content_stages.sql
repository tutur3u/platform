-- One atomic swap is required. The migration runner wraps multi-statement files
-- in a transaction, so CREATE INDEX CONCURRENTLY is unavailable here.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Constant default is metadata-only on supported PostgreSQL versions.
alter table private.tutoring_notification_receipts
  add column stage text not null default 'n1'
  constraint tutoring_notification_receipts_stage_check check (stage in ('n1','n2','n3'));
create unique index tutoring_notification_receipts_stage_key
  on private.tutoring_notification_receipts
  (group_id, student_user_id, review_cycle_started_at, recipient_user_id, stage);
alter table private.tutoring_notification_receipts
  drop constraint tutoring_notification_receipts_review_key;

-- Edits have no updated_at column. Track actual content changes in the existing
-- review clock; never change the identity or creation time of an old receipt.
create function private.reset_tutoring_content_clock() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if exists(select 1 from public.workspace_user_groups g join public.workspace_configs c on c.ws_id=g.ws_id and c.id='tutoring_content_rules' and c.value='true' where g.id=new.group_id and g.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid) and
    (new.content is distinct from old.content or new.require_attention is distinct from old.require_attention) then
    insert into private.tutoring_weak_support_reviews(group_id,student_user_id,last_reviewed_at)
    values(new.group_id,new.user_id,clock_timestamp())
    on conflict (group_id,student_user_id) do update set last_reviewed_at=excluded.last_reviewed_at;
  end if;
  return new;
end $$;
revoke all on function private.reset_tutoring_content_clock() from public,anon,authenticated,service_role;
create trigger reset_tutoring_content_clock after update on public.user_feedbacks
for each row execute function private.reset_tutoring_content_clock();

-- A bounded scan must advance past already-notified or unlinked students.
create table private.tutoring_content_scan_cursor (
  singleton boolean primary key default true check(singleton), after_id uuid
);
alter table private.tutoring_content_scan_cursor enable row level security;
revoke all on private.tutoring_content_scan_cursor from public,anon,authenticated;

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
  n2_at timestamptz;
  stage_name text;
  receipt_id uuid;
  notice_id uuid;
  sent integer := 0;
  n2_days integer;
  n3_days integer;
  office_group text;
begin
  -- Serialize runs and content edits so a changed note cannot race escalation.
  if not pg_try_advisory_xact_lock(hashtextextended('tutoring_content_rules',0)) then
    return jsonb_build_object('sent',0);
  end if;
  insert into private.tutoring_content_scan_cursor(singleton) values(true) on conflict do nothing;
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
    limit greatest(1,least(coalesce(p_limit,1000),1000))
    for update of f skip locked
  loop
    scanned := scanned+1;
    receipt_id := null;
    select greatest(note.created_at,coalesce(max(r.last_reviewed_at),note.created_at)) into cycle
      from private.tutoring_weak_support_reviews r
      where r.group_id=note.group_id and r.student_user_id=note.user_id;
    select coalesce(max(case when id='tutoring_content_rules_n2_days' and value ~ '^[0-9]{1,3}$' then greatest(1,value::integer) end),14),
      coalesce(max(case when id='tutoring_content_rules_n3_days' and value ~ '^[0-9]{1,3}$' then greatest(1,value::integer) end),14),
      max(case when id='tutoring_content_rules_office_group' then value end)
      into n2_days,n3_days,office_group
      from public.workspace_configs where ws_id=note.ws_id;
    if now()<cycle+make_interval(days=>n2_days) then
      update private.tutoring_content_scan_cursor set after_id=note.id;
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
      if sent>=greatest(1,least(coalesce(p_limit,1000),1000)) then return jsonb_build_object('sent',sent); end if;
    end loop;
    update private.tutoring_content_scan_cursor set after_id=note.id;
    if stage_name='n2' and n2_at is null and receipt_id is null then
      raise log 'Tutoring content reminder skipped: no linked GVCN';
    end if;
  end loop;
  if scanned<greatest(1,least(coalesce(p_limit,1000),1000)) then update private.tutoring_content_scan_cursor set after_id=null; end if;
  return jsonb_build_object('sent',sent);
end $$;
revoke all on function private.process_tutoring_content_rules(integer) from public,anon,authenticated;
grant execute on function private.process_tutoring_content_rules(integer) to service_role;
notify pgrst, 'reload schema';
