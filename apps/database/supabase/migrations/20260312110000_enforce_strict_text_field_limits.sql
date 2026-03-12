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
    when lower(_table_name) = 'tasks' and lower(_column_name) = 'description' then 2000
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
    when lower(_table_name) = 'handles' and lower(_column_name) = 'value' then 80
    when lower(_column_name) like '%email%' then 320
    when lower(_column_name) like '%token%' then 2048
    when lower(_column_name) like '%hash%'
      or lower(_column_name) like '%salt%' then 512
    when lower(_column_name) like '%agent%' then 1024
    when lower(_column_name) = 'html'
      or lower(_column_name) like '%html%' then 10000
    when lower(_column_name) = 'text'
      or lower(_column_name) like '%_text' then 1000
    when lower(_column_name) = 'input'
      or lower(_column_name) = 'output'
      or lower(_column_name) = 'data'
      or lower(_column_name) like '%_input'
      or lower(_column_name) like '%_output' then 1000
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
      or lower(_column_name) like 'ip_%'
      or lower(_column_name) like '%_ip'
      or lower(_column_name) like '%ip_address%' then 45
    when lower(_column_name) like '%locale%'
      or lower(_column_name) like '%timezone%'
      or lower(_column_name) like '%provider%'
      or lower(_column_name) like '%status%'
      or lower(_column_name) like '%type%'
      or lower(_column_name) like '%color%' then 64
    when lower(_column_name) = 'name'
      or lower(_column_name) = 'title'
      or lower(_column_name) = 'subject'
      or lower(_column_name) like '%_name'
      or lower(_column_name) like '%_title' then 128
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
    else 1000
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
    when lower(_column_name) like '%agent%' then 1024
    when lower(_column_name) = 'html'
      or lower(_column_name) like '%html%' then 40000
    when lower(_column_name) = 'text'
      or lower(_column_name) like '%_text' then 16000
    when lower(_column_name) = 'input'
      or lower(_column_name) = 'output'
      or lower(_column_name) = 'data'
      or lower(_column_name) like '%_input'
      or lower(_column_name) like '%_output' then 16000
    when lower(_column_name) like '%url%'
      or lower(_column_name) like '%link%'
      or lower(_column_name) like '%path%' then 2048
    when lower(_column_name) = 'ip'
      or lower(_column_name) like 'ip_%'
      or lower(_column_name) like '%_ip'
      or lower(_column_name) like '%ip_address%' then 64
    else public.strict_text_field_char_limit(_table_name, _column_name) * 4
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

  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on c.table_schema = t.table_schema
      and c.table_name = t.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'character')
  loop
    execute format(
      'drop trigger if exists enforce_strict_text_field_limits on public.%I',
      r.table_name
    );

    execute format(
      'create trigger enforce_strict_text_field_limits before insert or update on public.%I for each row execute function public.enforce_strict_text_field_limits()',
      r.table_name
    );
  end loop;
end;
$$;
