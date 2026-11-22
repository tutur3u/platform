-- Rollback for 20261122181300_restore_retained_personal_mailbox.sql.
-- Apply as a new forward migration through the gated database workflow. It
-- removes the restoration helpers and refuses while any restoration receipt
-- remains; reverse a restoration first with
-- private.rollback_retained_personal_mailbox_restoration.
-- tuturuuu: reviewed(dynamic-sql-review): fixed receipt guard with no EXECUTE, interpolation or caller input.
do $$
begin
  perform set_config('lock_timeout', '5s', true);
  -- Hold the table until the drop below so no receipt can appear in between.
  lock table private.mail_mailbox_restorations in access exclusive mode;
  if exists (select 1 from private.mail_mailbox_restorations) then
    raise exception 'Mailbox restoration helpers are still referenced by a receipt';
  end if;
end;
$$;
drop function private.inspect_retained_personal_mailbox(uuid);
drop function private.rollback_retained_personal_mailbox_restoration(uuid);
drop function private.restore_retained_personal_mailbox(uuid, uuid);
drop table private.mail_mailbox_restorations;
