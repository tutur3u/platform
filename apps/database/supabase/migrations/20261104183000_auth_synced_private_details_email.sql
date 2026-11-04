-- SR-926: user_private_details.email is a copy of the confirmed Auth mailbox,
-- kept in step by public.sync_user_private_details() on auth.users. The
-- "Enable update for users based on email" RLS policy lets a signed-in user
-- update their own row, and the authenticated role holds table-wide UPDATE,
-- so a client could set this column to an arbitrary address that some readers
-- then trusted as identity.
--
-- A trigger, not a column-level REVOKE: revoking one column from a table-wide
-- UPDATE grant has no effect in Postgres, so a REVOKE would mean replacing the
-- table grant with a per-column list that every later column must join. No
-- client code writes this column today; the only writers are SECURITY DEFINER
-- code (the auth.users sync trigger and the employee address migrations) and
-- service_role, and none of them run as authenticated or anon. Client-role
-- changes to the column are ignored, so the stored value stays the Auth copy;
-- every other column on the row still updates normally.
--
-- SECURITY INVOKER on purpose: current_user must be the calling role. Trigger
-- firing does not check EXECUTE, so the function grants nothing to anyone.
create function private.keep_auth_synced_private_details_email()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.email := old.email;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_auth_synced_private_details_email()
  from public, anon, authenticated, service_role;

-- Named to sort before guard_employee_address_profile, so the reservation
-- guard sees the value that will actually be stored.
create trigger enforce_auth_synced_private_details_email
before update of email on public.user_private_details
for each row
when (new.email is distinct from old.email)
execute function private.keep_auth_synced_private_details_email();

comment on function private.keep_auth_synced_private_details_email() is
  'SR-926: ignores authenticated/anon changes to user_private_details.email; Auth sync and service_role writes are unaffected.';
