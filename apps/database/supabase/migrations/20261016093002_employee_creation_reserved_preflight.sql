-- Revalidate the journal's reservation without rebinding or consuming it.
-- A true result is only a transaction-local preflight result. The journal's
-- winning attempted transition and invocation-local permission remain required.
create or replace function private.employee_creation_preflight(
  p_actor_id uuid,p_user_id uuid,p_email text,p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  intent private.employee_creation_intents%rowtype;
  reserved boolean := false;
begin
  perform private.assert_employee_administrator(p_actor_id);
  if p_user_id is null then
    raise exception using errcode='23502',message='Employee target is required';
  end if;
  if p_email is null or p_email <> lower(p_email) or p_email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$' then
    raise exception using errcode='23514',message='Invalid employee email';
  end if;
  if p_name is null then
    raise exception using errcode='23502',message='Employee name is required';
  end if;
  if p_name <> btrim(p_name) or length(p_name) not between 1 and 100 then
    raise exception using errcode='23514',message='Invalid employee name';
  end if;
  -- Match the identity trigger's UUID lock order. Every overlap must match;
  -- an email-only, UUID-only, or split overlap cannot reuse either reservation.
  for intent in select * from private.employee_creation_intents
    where user_id=p_user_id or staff_email=p_email order by user_id for update loop
    if intent.actor_id is distinct from p_actor_id
      or intent.user_id is distinct from p_user_id
      or intent.staff_email is distinct from p_email
      or intent.managed_name is distinct from p_name then
      raise exception using errcode='23505',message='Employee account or reservation already exists';
    end if;
    reserved := true;
  end loop;
  -- Recheck conflicts after any intent-lock wait: an Auth INSERT holds that
  -- same lock and may have committed while this call was waiting.
  -- Also reject an existing target UUID whose Auth email differs.
  if exists(select 1 from auth.users where id=p_user_id or lower(email)=p_email)
    or exists(select 1 from public.platform_email_roles where lower(email)=p_email)
    or exists(select 1 from private.mail_mailboxes where address=p_email) then
    raise exception using errcode='23505',message='Employee account or reservation already exists';
  end if;
  if reserved then return true; end if;
  -- Unique target/email constraints arbitrate concurrent absent-row inserts.
  -- A conflict must propagate; it is never converted into optimistic success.
  insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id)
    values(p_user_id,p_email,p_name,p_actor_id);
  return true;
end;
$$;

revoke all on function private.employee_creation_preflight(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.employee_creation_preflight(uuid,uuid,text,text) to service_role;
