create or replace function public.strict_text_field_char_limit(
  _table_name text,
  _column_name text
)
returns integer
language sql
immutable
as $$
  select case
    when lower(_table_name) = 'users' and lower(_column_name) = 'display_name' then 64
    when lower(_table_name) = 'users' and lower(_column_name) = 'bio' then 160
    when lower(_table_name) = 'workspaces' and lower(_column_name) = 'name' then 63
    when lower(_table_name) = 'tasks' and lower(_column_name) = 'name' then 128
    when lower(_table_name) = 'tasks' and lower(_column_name) = 'description' then 100000
    when lower(_table_name) = 'workspace_calendar_events' and lower(_column_name) = 'title' then 128
    when lower(_table_name) = 'workspace_calendar_events' and lower(_column_name) = 'description' then 512
    when lower(_table_name) = 'support_inquiries' and lower(_column_name) = 'name' then 64
    when lower(_table_name) = 'support_inquiries' and lower(_column_name) = 'subject' then 128
    when lower(_table_name) = 'support_inquiries' and lower(_column_name) = 'message' then 512
    when lower(_table_name) = 'workspace_chat_channels' and lower(_column_name) = 'name' then 64
    when lower(_table_name) = 'workspace_chat_channels' and lower(_column_name) = 'description' then 256
    when lower(_table_name) = 'workspace_chat_messages' and lower(_column_name) = 'content' then 512
    when lower(_table_name) = 'workspace_secrets' and lower(_column_name) = 'value' then 4096
    when lower(_table_name) = 'internal_email_api_keys' and lower(_column_name) = 'value' then 4096
    when lower(_table_name) = 'workspace_whiteboards' and lower(_column_name) = 'title' then 120
    when lower(_table_name) = 'workspace_whiteboards' and lower(_column_name) = 'description' then 500
    when lower(_column_name) like '%email%' then 320
    when lower(_column_name) = 'id'
      or lower(_column_name) like '%\_id' escape '\' then 255
    when lower(_column_name) like '%token%' then 2048
    when lower(_column_name) like '%hash%'
      or lower(_column_name) like '%salt%' then 512
    when lower(_column_name) = 'user_agent'
      or lower(_column_name) like '%agent%' then 512
    when lower(_column_name) = 'endpoint' then 1024
    when lower(_column_name) = 'html'
      or lower(_column_name) like '%html%' then 4096
    when lower(_column_name) = 'text'
      or lower(_column_name) like '%\_text' escape '\' then 512
    when lower(_column_name) = 'input'
      or lower(_column_name) = 'output'
      or lower(_column_name) = 'data'
      or lower(_column_name) like '%\_input' escape '\'
      or lower(_column_name) like '%\_output' escape '\' then 512
    when lower(_column_name) like '%slug%'
      or lower(_column_name) like '%handle%'
      or lower(_column_name) like '%username%'
      or lower(_column_name) like '%shortcode%'
      or lower(_column_name) like '%otp%'
      or lower(_column_name) like '%code%' then 80
    when lower(_column_name) like '%url%'
      or lower(_column_name) like '%link%'
      or lower(_column_name) like '%path%' then 2048
    when lower(_column_name) = 'ip'
      or lower(_column_name) like 'ip\_%' escape '\'
      or lower(_column_name) like '%\_ip' escape '\'
      or lower(_column_name) like '%ip_address%' then 45
    when lower(_column_name) like '%locale%'
      or lower(_column_name) like '%timezone%'
      or lower(_column_name) like '%provider%'
      or lower(_column_name) like '%status%'
      or lower(_column_name) like '%type%'
      or lower(_column_name) like '%period%'
      or lower(_column_name) like '%color%' then 64
    when lower(_column_name) = 'name'
      or lower(_column_name) = 'title'
      or lower(_column_name) = 'subject'
      or lower(_column_name) like '%\_name' escape '\'
      or lower(_column_name) like '%\_title' escape '\' then 128
    when lower(_column_name) like '%summary%'
      or lower(_column_name) like '%description%'
      or lower(_column_name) like '%bio%'
      or lower(_column_name) like '%note%'
      or lower(_column_name) like '%reason%'
      or lower(_column_name) like '%hint%' then 512
    when lower(_column_name) like '%content%'
      or lower(_column_name) like '%message%'
      or lower(_column_name) like '%prompt%'
      or lower(_column_name) like '%body%' then 512
    else 512
  end;
$$;

create or replace function public.strict_text_field_byte_limit(
  _table_name text,
  _column_name text
)
returns integer
language sql
immutable
as $$
  select case
    when lower(_column_name) like '%email%' then 320
    when lower(_column_name) like '%token%' then 4096
    when lower(_column_name) like '%hash%'
      or lower(_column_name) like '%salt%' then 1024
    when lower(_column_name) = 'user_agent'
      or lower(_column_name) like '%agent%' then 1024
    when lower(_column_name) = 'endpoint' then 2048
    when lower(_column_name) = 'html'
      or lower(_column_name) like '%html%' then 16384
    when lower(_column_name) = 'text'
      or lower(_column_name) like '%\_text' escape '\' then 2048
    when lower(_column_name) = 'input'
      or lower(_column_name) = 'output'
      or lower(_column_name) = 'data'
      or lower(_column_name) like '%\_input' escape '\'
      or lower(_column_name) like '%\_output' escape '\' then 2048
    when lower(_column_name) like '%url%'
      or lower(_column_name) like '%link%'
      or lower(_column_name) like '%path%' then 2048
    when lower(_column_name) = 'ip'
      or lower(_column_name) like 'ip\_%' escape '\'
      or lower(_column_name) like '%\_ip' escape '\'
      or lower(_column_name) like '%ip_address%' then 64
    else public.strict_text_field_char_limit(_table_name, _column_name) * 4
  end;
$$;

create or replace function public.strict_payload_field_byte_limit(
  _table_name text,
  _column_name text
)
returns integer
language sql
immutable
as $$
  select case
    when lower(_table_name) = 'workspace_whiteboards'
      and lower(_column_name) = 'snapshot' then 65536
    when lower(_column_name) = 'content'
      or lower(_column_name) like '%\_content' escape '\'
      or lower(_column_name) like '%record%'
      or lower(_column_name) like '%snapshot%'
      or lower(_column_name) like '%segments%'
      or lower(_column_name) like '%instruction%'
      or lower(_column_name) like '%settings%'
      or lower(_column_name) like '%theme%'
      or lower(_column_name) like '%session_data%'
      or lower(_column_name) like '%agenda%'
      or lower(_column_name) like '%cells%'
      or lower(_column_name) like '%statuses%' then 65536
    when lower(_column_name) like '%metadata%'
      or lower(_column_name) like '%data%'
      or lower(_column_name) like '%json%'
      or lower(_column_name) like '%fields%'
      or lower(_column_name) like '%condition%'
      or lower(_column_name) like '%groups%'
      or lower(_column_name) like '%tags%'
      or lower(_column_name) like '%scores%'
      or lower(_column_name) like '%notification%'
      or lower(_column_name) like '%adjustments%'
      or lower(_column_name) like '%deductions%' then 16384
    else 8192
  end;
$$;

create or replace function public.enforce_strict_text_field_limits()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  r record;
  v_value text;
  v_old_value text;
  v_char_limit integer;
  v_byte_limit integer;
  v_effective_char_limit integer;
  v_payload jsonb;
  v_old_payload jsonb;
  v_payload_byte_limit integer;
begin
  for r in
    select
      a.attname as column_name,
      case
        when a.atttypid in ('character varying'::regtype, 'bpchar'::regtype)
          and a.atttypmod > 4
        then a.atttypmod - 4
        else null
      end as declared_max_length
    from pg_attribute a
    where a.attrelid = tg_relid
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid in (
        'text'::regtype,
        'character varying'::regtype,
        'bpchar'::regtype
      )
  loop
    v_value := v_new ->> r.column_name;

    if v_value is null then
      continue;
    end if;

    if tg_op = 'UPDATE' then
      v_old_value := v_old ->> r.column_name;

      if v_old_value is not distinct from v_value then
        continue;
      end if;
    end if;

    v_char_limit := public.strict_text_field_char_limit(tg_table_name, r.column_name);
    v_byte_limit := public.strict_text_field_byte_limit(tg_table_name, r.column_name);
    v_effective_char_limit := coalesce(
      least(v_char_limit, r.declared_max_length),
      v_char_limit
    );

    if char_length(v_value) > v_effective_char_limit then
      raise exception
        'TEXT_FIELD_LENGTH_EXCEEDED: %.% exceeds % characters',
        tg_table_name,
        r.column_name,
        v_effective_char_limit
        using errcode = '22001';
    end if;

    if octet_length(v_value) > v_byte_limit then
      raise exception
        'TEXT_FIELD_BYTES_EXCEEDED: %.% exceeds % bytes',
        tg_table_name,
        r.column_name,
        v_byte_limit
        using errcode = '22001';
    end if;
  end loop;

  for r in
    select a.attname as column_name
    from pg_attribute a
    where a.attrelid = tg_relid
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid in ('json'::regtype, 'jsonb'::regtype)
  loop
    v_payload := v_new -> r.column_name;

    if v_payload is null then
      continue;
    end if;

    if tg_op = 'UPDATE' then
      v_old_payload := v_old -> r.column_name;

      if v_old_payload is not distinct from v_payload then
        continue;
      end if;
    end if;

    v_payload_byte_limit := public.strict_payload_field_byte_limit(
      tg_table_name,
      r.column_name
    );

    if octet_length(v_payload::text) > v_payload_byte_limit then
      raise exception
        'PAYLOAD_FIELD_BYTES_EXCEEDED: %.% exceeds % bytes',
        tg_table_name,
        r.column_name,
        v_payload_byte_limit
        using errcode = '22001';
    end if;
  end loop;

  return new;
end;
$$;

do $$
declare
  r record;
  existing_constraint record;
  v_constraint_definition text;
  v_effective_char_limit integer;
begin
  for r in
    select
      cols.table_name,
      cols.column_name,
      cols.character_maximum_length
    from information_schema.columns cols
    join information_schema.tables t
      on t.table_schema = cols.table_schema
      and t.table_name = cols.table_name
    where cols.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and cols.data_type in ('text', 'character varying', 'character')
  loop
    for existing_constraint in
      select con.conname
      from pg_constraint con
      join pg_class cls
        on cls.oid = con.conrelid
      join pg_namespace ns
        on ns.oid = cls.relnamespace
      where ns.nspname = 'public'
        and cls.relname = r.table_name
        and con.contype = 'c'
        and (
          con.conname = any (array[
            format('%s_length_check', r.column_name),
            format('%s_%s_length_check', r.table_name, r.column_name),
            format('%s_strict_length_check', r.column_name),
            format('%s_%s_strict_length_check', r.table_name, r.column_name),
            format('%s_bytes_check', r.column_name),
            format('%s_%s_bytes_check', r.table_name, r.column_name),
            format('%s_strict_bytes_check', r.column_name),
            format('%s_%s_strict_bytes_check', r.table_name, r.column_name)
          ])
          or position(
            format('char_length(%I)', r.column_name)
            in pg_get_constraintdef(con.oid)
          ) > 0
          or position(
            format('octet_length(%I)', r.column_name)
            in pg_get_constraintdef(con.oid)
          ) > 0
        )
    loop
      execute format(
        'alter table public.%I drop constraint if exists %I',
        r.table_name,
        existing_constraint.conname
      );
    end loop;

    v_effective_char_limit := coalesce(
      least(
        public.strict_text_field_char_limit(r.table_name, r.column_name),
        r.character_maximum_length
      ),
      public.strict_text_field_char_limit(r.table_name, r.column_name)
    );

    v_constraint_definition := format(
      'alter table public.%I add constraint %I check (char_length(%I) <= %s) not valid',
      r.table_name,
      format('%s_strict_length_check', r.column_name),
      r.column_name,
      v_effective_char_limit
    );
    execute v_constraint_definition;

    v_constraint_definition := format(
      'alter table public.%I add constraint %I check (octet_length(%I) <= %s) not valid',
      r.table_name,
      format('%s_strict_bytes_check', r.column_name),
      r.column_name,
      public.strict_text_field_byte_limit(r.table_name, r.column_name)
    );
    execute v_constraint_definition;
  end loop;

  for r in
    select
      cols.table_name,
      cols.column_name
    from information_schema.columns cols
    join information_schema.tables t
      on t.table_schema = cols.table_schema
      and t.table_name = cols.table_name
    where cols.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and cols.data_type in ('json', 'jsonb')
  loop
    for existing_constraint in
      select con.conname
      from pg_constraint con
      join pg_class cls
        on cls.oid = con.conrelid
      join pg_namespace ns
        on ns.oid = cls.relnamespace
      where ns.nspname = 'public'
        and cls.relname = r.table_name
        and con.contype = 'c'
        and (
          con.conname = any (array[
            format('%s_payload_size_check', r.column_name),
            format('%s_%s_payload_size_check', r.table_name, r.column_name),
            format('%s_strict_payload_size_check', r.column_name),
            format('%s_%s_strict_payload_size_check', r.table_name, r.column_name)
          ])
          or position(
            format('octet_length((%I)::text)', r.column_name)
            in pg_get_constraintdef(con.oid)
          ) > 0
          or position(
            format('octet_length(%I::text)', r.column_name)
            in pg_get_constraintdef(con.oid)
          ) > 0
        )
    loop
      execute format(
        'alter table public.%I drop constraint if exists %I',
        r.table_name,
        existing_constraint.conname
      );
    end loop;

    v_constraint_definition := format(
      'alter table public.%I add constraint %I check (octet_length((%I)::text) <= %s) not valid',
      r.table_name,
      format('%s_strict_payload_size_check', r.column_name),
      r.column_name,
      public.strict_payload_field_byte_limit(r.table_name, r.column_name)
    );
    execute v_constraint_definition;
  end loop;
end;
$$;
