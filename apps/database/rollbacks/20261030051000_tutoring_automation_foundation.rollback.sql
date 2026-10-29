-- Rollback for 20261030051000_tutoring_automation_foundation.sql.
-- Run the 20261030051010 rollback first; this one refuses to run while the
-- receipts still reference follow-ups. Drops the automation settings, absence
-- follow-ups, their audit, and their functions (their data is lost). Nothing
-- outside these objects changes, and it grants nothing.
-- Not a migration: apply manually only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'tutoring_notification_receipts'
      and column_name = 'absence_followup_id'
  ) then
    raise exception 'Roll back 20261030051010_tutoring_automation_notifications first';
  end if;
end;
$$;

drop function if exists private.tutoring_absence_followup_apply(
  uuid, uuid, uuid, date, text, uuid, text, uuid
);
drop table if exists private.tutoring_automation_events;
drop table if exists private.tutoring_absence_followups;
drop table if exists private.tutoring_automation_settings;
drop function if exists private.tutoring_automation_events_append_only();
drop function if exists private.tutoring_absence_followups_guard();
drop function if exists private.tutoring_automation_settings_audit();
drop function if exists private.tutoring_automation_settings_stamp();

notify pgrst, 'reload schema';

commit;
