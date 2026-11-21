-- Per-workspace change sequence for the people registry. A drain cursor
-- exposes only its own workspace's sequence, never the global event identity,
-- so it reveals nothing about other workspaces' activity. The sequence row is
-- locked until the writing transaction commits, so sequence order is commit
-- order within a workspace and a cursor never skips a slower writer.
begin;
set local lock_timeout = '3s';

create table private.people_change_sequences (
  ws_id uuid primary key references private.people_registry_control (ws_id) on delete cascade,
  last_seq bigint not null default 0 check (last_seq >= 0)
);
alter table private.people_change_sequences enable row level security;
revoke all on table private.people_change_sequences from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.people_change_sequences to people_registry_definer;
create policy people_change_sequences_definer on private.people_change_sequences
  for all to people_registry_definer using (true) with check (true);

alter table private.people_change_events add column ws_seq bigint;
update private.people_change_events e set ws_seq = s.seq
  from (
    select event_id, row_number() over (partition by ws_id order by event_id) as seq
    from private.people_change_events
  ) s
  where s.event_id = e.event_id;
alter table private.people_change_events alter column ws_seq set not null,
  add constraint people_change_events_ws_seq check (ws_seq > 0),
  add constraint people_change_events_ws_seq_unique unique (ws_id, ws_seq);
insert into private.people_change_sequences (ws_id, last_seq)
  select c.ws_id, coalesce((select max(e.ws_seq) from private.people_change_events e where e.ws_id = c.ws_id), 0)
  from private.people_registry_control c;

-- Each emitted event takes the next sequence value for its workspace.
-- tuturuuu: no-grant (internal)
create or replace function private.people_emit_change(
  p_ws uuid, p_person uuid, p_conversation uuid, p_kind private.people_change_kind
)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row record;
  v_seq bigint;
begin
  for v_row in
    select p.id as person_id, null::uuid as conversation_id, p.version, p.consent_version
      from private.people_persons p where p_person is not null and p.ws_id = p_ws and p.id = p_person
    union all
    select null::uuid, c.id, c.version, c.consent_version
      from private.people_conversations c
      where p_conversation is not null and c.ws_id = p_ws and c.id = p_conversation
  loop
    insert into private.people_change_sequences as s (ws_id, last_seq) values (p_ws, 1)
      on conflict (ws_id) do update set last_seq = s.last_seq + 1
      returning s.last_seq into v_seq;
    insert into private.people_change_events
      (ws_id, person_id, conversation_id, version, consent_version, kind, ws_seq)
      values (p_ws, v_row.person_id, v_row.conversation_id, v_row.version, v_row.consent_version, p_kind, v_seq);
  end loop;
end;
$$;
revoke all on function private.people_emit_change(uuid, uuid, uuid, private.people_change_kind)
  from public, anon, authenticated, service_role;

commit;
