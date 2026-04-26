-- AI gateway model metadata is copied from public provider catalogs.
-- Descriptions and names can legitimately exceed the generic public text limits,
-- so keep payload-size checks for json/jsonb columns but skip text-field limits
-- on this catalog table.

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
  if tg_table_name <> 'ai_gateway_models' then
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
  end if;

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
begin
  for r in
    select con.conname
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
  loop
    execute format(
      'alter table public.ai_gateway_models drop constraint if exists %I',
      r.conname
    );
  end loop;
end;
$$;
