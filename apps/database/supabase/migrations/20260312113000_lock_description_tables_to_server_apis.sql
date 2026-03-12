do $$
declare
  r record;
  p record;
begin
  for r in
    with protected_tables as (
      select distinct c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
        and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.data_type in ('text', 'character varying', 'character')
        and (
          c.column_name = 'description'
          or c.column_name = 'content'
          or c.column_name = 'message'
          or c.column_name = 'prompt'
          or c.column_name = 'body'
          or c.column_name = 'html'
          or c.column_name = 'text'
          or c.column_name = 'input'
          or c.column_name = 'output'
          or c.column_name = 'data'
          or c.column_name like '%\_content' escape '\'
          or c.column_name like '%\_message' escape '\'
          or c.column_name like '%\_prompt' escape '\'
          or c.column_name like '%\_body' escape '\'
          or c.column_name like '%\_text' escape '\'
          or c.column_name like '%\_input' escape '\'
          or c.column_name like '%\_output' escape '\'
        )
    )
    select table_name
    from protected_tables
    order by table_name
  loop
    execute format(
      'alter table public.%I enable row level security',
      r.table_name
    );

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = r.table_name
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        p.policyname,
        r.table_name
      );
    end loop;

    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      r.table_name
    );
  end loop;
end;
$$;
