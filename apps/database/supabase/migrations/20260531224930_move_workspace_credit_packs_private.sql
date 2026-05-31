begin;

alter table if exists public.workspace_credit_packs
  set schema private;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_credit_packs'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

alter table private.workspace_credit_packs enable row level security;

revoke all on table private.workspace_credit_packs from anon, authenticated, public;

grant all on table private.workspace_credit_packs to service_role;

create policy "Service role can manage private workspace credit packs"
on private.workspace_credit_packs
for all
to service_role
using (true)
with check (true);

notify pgrst, 'reload schema';

commit;
