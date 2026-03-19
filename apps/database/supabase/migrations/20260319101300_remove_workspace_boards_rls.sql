do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_boards'
  loop
    execute format(
      'drop policy if exists %I on public.workspace_boards',
      policy_record.policyname
    );
  end loop;
end
$$;

