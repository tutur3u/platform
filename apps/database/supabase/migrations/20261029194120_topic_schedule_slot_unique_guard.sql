-- IF NOT EXISTS must not accept an invalid index from an interrupted build.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_index
    where indexrelid = pg_catalog.to_regclass('private.topic_announcements_schedule_slot_unique')
      and indrelid = 'private.topic_announcements'::regclass and indisvalid and indisunique
  ) then
    raise exception using errcode = '55000',
      message = 'Required index topic_announcements_schedule_slot_unique is missing or invalid',
      hint = 'Drop the invalid index concurrently outside a transaction, resolve duplicates if applicable, rebuild, and retry.';
  end if;
end;
$$;


comment on index private.topic_announcements_schedule_slot_unique is
  'One non-cancelled GVNN schedule session per workspace, class, date and start time.';

-- Sets a schedule session's GVNN recipient in one transaction. Used to put
-- the previous GVNN back when an edit could not apply (for example, the slot
-- index refused it): the session row is locked FOR UPDATE, so a send's claim
-- (an UPDATE of that row from an editable status to processing) waits for
-- this to finish and then re-checks its condition; editability is re-checked
-- under the lock; the contact is checked (and locked against archiving) before
-- anything changes. Returns:
--   'set'                 the recipient is now p_contact_id (none when null);
--   'locked'              the session is in delivery or sent: nothing changed;
--   'contact_unavailable' the contact is archived or in another workspace:
--                         nothing changed (the current recipient stays);
--   'not_found'           no such schedule session in this workspace.
-- SECURITY INVOKER: only service_role may call it, with its own privileges.
create function private.set_topic_schedule_recipient(
  p_announcement_id uuid,
  p_ws_id uuid,
  p_contact_id uuid
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_status text;
  v_sent_at timestamptz;
begin
  select announcement.status, announcement.sent_at
    into v_status, v_sent_at
  from private.topic_announcements announcement
  where announcement.id = p_announcement_id
    and announcement.ws_id = p_ws_id
    and announcement.source_type = 'schedule'
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_sent_at is not null
    or v_status not in ('draft', 'failed', 'skipped') then
    return 'locked';
  end if;

  if p_contact_id is not null then
    perform 1
    from private.topic_announcement_contacts contact
    where contact.id = p_contact_id
      and contact.ws_id = p_ws_id
      and contact.archived = false
    for share;

    if not found then
      return 'contact_unavailable';
    end if;
  end if;

  delete from private.topic_announcement_recipients
  where announcement_id = p_announcement_id;

  if p_contact_id is not null then
    insert into private.topic_announcement_recipients (announcement_id, contact_id)
    values (p_announcement_id, p_contact_id);
  end if;

  return 'set';
end;
$fn$;

comment on function private.set_topic_schedule_recipient(uuid, uuid, uuid) is
  'Atomically sets a schedule session GVNN recipient while the session is editable (locks the session row).';

revoke all on function private.set_topic_schedule_recipient(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.set_topic_schedule_recipient(uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
