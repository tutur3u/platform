-- FORBIDDEN after V10. Roll back V10 before V2; PL/pgSQL dependencies are not tracked.
-- Manual only, before later erase slices depend on these tables.
-- Refuse to discard any hold or settings audit evidence.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- tuturuuu: reviewed(dynamic-sql-review): Selene, #7523 rollback evidence checks; static SQL only, no EXECUTE.
do $$ begin
  if exists(select 1 from private.meet_content_holds) or exists(select 1 from private.meet_erase_settings_audit) then
    raise exception 'Preserve hold and settings audit evidence';
  end if;
end $$;
drop table private.meet_content_holds;
drop function private.block_meet_hold_transition();
drop function private.set_meet_retention_purge_enabled(boolean);
drop table private.meet_erase_settings;
drop function private.audit_meet_erase_settings();
drop table private.meet_erase_settings_audit;
commit;
