begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(28);

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
        and c.table_name <> 'ai_gateway_models'
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
        and c.table_name <> 'ai_gateway_models'
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
        and c.table_name <> 'ai_gateway_models'
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
        and c.table_name <> 'ai_gateway_models'
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
      and c.table_name <> 'ai_gateway_models'
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
      and c.table_name <> 'ai_gateway_models'
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
      and c.table_name <> 'ai_gateway_models'
      and c.data_type in ('text', 'character varying', 'character')
      and strict_text_field_byte_limit(c.table_name, c.column_name)
        < strict_text_field_char_limit(c.table_name, c.column_name)
  ),
  'every public text-like column keeps the byte ceiling at or above the character ceiling'
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
      and c.data_type in ('json', 'jsonb')
      and strict_payload_field_byte_limit(c.table_name, c.column_name) <= 0
  ),
  'every public json/jsonb column resolves to a positive payload byte limit'
);

select ok(
  not exists (
    with text_columns as (
      select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
        and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.table_name <> 'ai_gateway_models'
        and c.data_type in ('text', 'character varying', 'character')
    )
    select 1
    from text_columns tc
    left join pg_constraint con
      on con.conrelid = format('public.%I', tc.table_name)::regclass
      and con.contype = 'c'
      and con.conname = format('%s_strict_length_check', tc.column_name)
    where con.oid is null
  ),
  'every public text-like column has a strict char-length check constraint'
);

select ok(
  not exists (
    with text_columns as (
      select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
        and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.table_name <> 'ai_gateway_models'
        and c.data_type in ('text', 'character varying', 'character')
    )
    select 1
    from text_columns tc
    left join pg_constraint con
      on con.conrelid = format('public.%I', tc.table_name)::regclass
      and con.contype = 'c'
      and con.conname = format('%s_strict_bytes_check', tc.column_name)
    where con.oid is null
  ),
  'every public text-like column has a strict byte-length check constraint'
);

select ok(
  not exists (
    with payload_columns as (
      select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
        and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.data_type in ('json', 'jsonb')
    )
    select 1
    from payload_columns pc
    left join pg_constraint con
      on con.conrelid = format('public.%I', pc.table_name)::regclass
      and con.contype = 'c'
      and con.conname = format('%s_strict_payload_size_check', pc.column_name)
    where con.oid is null
  ),
  'every public json/jsonb column has a strict payload-size check constraint'
);

select ok(
  not exists (
    select 1
    from pg_constraint con
    join pg_class cls
      on cls.oid = con.conrelid
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and con.contype = 'c'
      and (
        pg_get_constraintdef(con.oid) ~ 'char_length\\([^)]*\\) <= 10000'
        or pg_get_constraintdef(con.oid) ~ 'octet_length\\([^)]*\\) <= 40000'
        or pg_get_constraintdef(con.oid) like '%2097152%'
      )
  ),
  'legacy loose public length and payload constraints are gone'
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
  strict_text_field_char_limit('tasks', 'name'),
  1024,
  'task titles allow up to 1,024 characters'
);

select is(
  strict_text_field_char_limit('tasks', 'description'),
  100000,
  'task descriptions preserve the 100,000 character allowance'
);

select is(
  strict_text_field_char_limit('workspace_calendar_events', 'description'),
  10000,
  'workspace calendar event descriptions allow provider-sized payloads'
);

select is(
  strict_text_field_char_limit('workspace_calendar_events', 'title'),
  255,
  'workspace calendar event titles allow provider-sized payloads'
);

select is(
  strict_text_field_char_limit('workspace_chat_messages', 'content'),
  512,
  'payload fields default to the lower 512-character ceiling'
);

select is(
  strict_text_field_char_limit('sent_emails', 'content'),
  1048576,
  'sent email HTML content keeps the large character ceiling'
);

select is(
  strict_text_field_byte_limit('sent_emails', 'content'),
  4194304,
  'sent email HTML content keeps the large byte ceiling'
);

select is(
  strict_text_field_char_limit('email_audit', 'html_content'),
  1048576,
  'email audit HTML content keeps the large character ceiling'
);

select is(
  strict_text_field_byte_limit('email_audit', 'html_content'),
  4194304,
  'email audit HTML content keeps the large byte ceiling'
);

select is(
  strict_text_field_char_limit('finance_budgets', 'period'),
  64,
  'period fields use the short enum-style ceiling'
);

select ok(
  not exists (
    select 1
    from pg_constraint con
    join pg_class cls
      on cls.oid = con.conrelid
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = 'ai_gateway_models'
      and con.contype = 'c'
      and (
        con.conname like '%\_strict\_length\_check' escape '\'
        or con.conname like '%\_strict\_bytes\_check' escape '\'
        or pg_get_constraintdef(con.oid) like '%char_length(%'
        or pg_get_constraintdef(con.oid) like '%octet_length(%'
      )
  ),
  'ai gateway model text columns are not text-length constrained'
);

select is(
  strict_payload_field_byte_limit('workspace_whiteboards', 'snapshot'),
  67108864,
  'whiteboard snapshots allow up to 64 MB for large canvas content'
);

create temporary table pgtap_text_limit_probe (
  title text,
  description text,
  content text,
  path text,
  data jsonb
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

select throws_ok(
  $$insert into pgtap_text_limit_probe (data)
    values (jsonb_build_object('blob', repeat('a', 20000)))$$,
  '22001',
  'PAYLOAD_FIELD_BYTES_EXCEEDED: pgtap_text_limit_probe.data exceeds 16384 bytes',
  'json payload fields reject oversized blobs'
);

select lives_ok(
  $$insert into pgtap_text_limit_probe (title, description, content, data)
    values (
      repeat('a', 128),
      repeat('a', 512),
      repeat('a', 512),
      jsonb_build_object('blob', repeat('a', 1000))
    )$$,
  'boundary-length text and payload values still insert'
);

select * from finish();

rollback;
