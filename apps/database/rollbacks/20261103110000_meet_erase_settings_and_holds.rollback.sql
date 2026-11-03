-- Manual only, before later erase slices depend on these tables.
-- Refuse to discard any hold or settings audit evidence.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$ begin
  if exists(select 1 from private.meet_content_holds) or exists(select 1 from private.meet_erase_settings_audit) then
    raise exception 'Preserve hold and settings audit evidence';
  end if;
end $$;
drop table private.meet_content_holds;
drop function private.block_meet_hold_transition();
drop table private.meet_erase_settings;
drop function private.audit_meet_erase_settings();
drop table private.meet_erase_settings_audit;
commit;
