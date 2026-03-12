begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(15);

select ok(
  not exists (
    with text_tables as (
      select distinct c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
        and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.data_type in ('text', 'character varying', 'character')
    )
    select 1
    from text_tables tt
    left join pg_trigger trg
      on trg.tgrelid = format('public.%I', tt.table_name)::regclass
      and trg.tgname = 'enforce_strict_text_field_limits'
      and not trg.tgisinternal
    where trg.oid is null
  ),
  'every public table with text-like columns has the strict text trigger'
);

select ok(
  not exists (
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
    select 1
    from pg_policies p
    join protected_tables pt
      on pt.table_name = p.tablename
    where p.schemaname = 'public'
  ),
  'protected text-heavy tables have no client-facing RLS policies'
);

select ok(
  not exists (
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
    select 1
    from pg_class cls
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    join protected_tables pt
      on pt.table_name = cls.relname
    where ns.nspname = 'public'
      and cls.relkind = 'r'
      and not cls.relrowsecurity
  ),
  'protected text-heavy tables keep RLS enabled after policy removal'
);

select ok(
  not exists (
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
    ),
    roles as (
      select unnest(array['anon', 'authenticated']) as role_name
    ),
    privileges as (
      select unnest(array['select', 'insert', 'update', 'delete']) as privilege_name
    )
    select 1
    from protected_tables dt
    cross join roles r
    cross join privileges p
    where has_table_privilege(
      r.role_name,
      format('public.%I', dt.table_name),
      p.privilege_name
    )
  ),
  'protected text-heavy tables grant no CRUD privileges to anon or authenticated'
);

select ok(
  not exists (
    select 1
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
      and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'character')
      and strict_text_field_char_limit(c.table_name, c.column_name) <= 0
  ),
  'every public text-like column resolves to a positive character limit'
);

select ok(
  not exists (
    select 1
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
      and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'character')
      and strict_text_field_byte_limit(c.table_name, c.column_name) <= 0
  ),
  'every public text-like column resolves to a positive octet limit'
);

select ok(
  not exists (
    select 1
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
      and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'character')
      and strict_text_field_byte_limit(c.table_name, c.column_name)
        < strict_text_field_char_limit(c.table_name, c.column_name)
  ),
  'every public text-like column keeps the byte ceiling at or above the character ceiling'
);

select is(
  strict_text_field_char_limit('workspaces', 'name'),
  63,
  'workspace names are capped below 64 characters'
);

select is(
  strict_text_field_char_limit('users', 'bio'),
  160,
  'user bios use the stricter short-form limit'
);

select is(
  strict_text_field_char_limit('tasks', 'description'),
  2000,
  'task descriptions keep the larger special-case allowance'
);

select is(
  strict_text_field_char_limit('workspace_calendar_events', 'description'),
  512,
  'generic descriptions are capped at 512 characters'
);

select is(
  strict_text_field_char_limit('workspace_chat_messages', 'content'),
  512,
  'payload fields default to the lower 512-character ceiling'
);

create temporary table pgtap_text_limit_probe (
  title text,
  description text,
  content text,
  path text
);

create trigger enforce_strict_text_field_limits
before insert or update on pgtap_text_limit_probe
for each row
execute function public.enforce_strict_text_field_limits();

select throws_ok(
  $$insert into pgtap_text_limit_probe (description) values (repeat('a', 513))$$,
  '22001',
  'TEXT_FIELD_LENGTH_EXCEEDED: pgtap_text_limit_probe.description exceeds 512 characters',
  'generic descriptions reject payloads longer than 512 chars'
);

select throws_ok(
  $$insert into pgtap_text_limit_probe (path) values (repeat('🚀', 600))$$,
  '22001',
  'TEXT_FIELD_BYTES_EXCEEDED: pgtap_text_limit_probe.path exceeds 2048 bytes',
  'octet-based payload limits reject multibyte overflows'
);

select lives_ok(
  $$insert into pgtap_text_limit_probe (title, description, content)
    values (repeat('a', 128), repeat('a', 512), repeat('a', 512))$$,
  'boundary-length title, description, and content values still insert'
);

select * from finish();

rollback;
