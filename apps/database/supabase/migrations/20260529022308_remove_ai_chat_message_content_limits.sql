-- AI chat assistant responses routinely exceed short UI text limits. Keep
-- structured payload checks in place, but do not apply generic text length
-- enforcement to the persisted assistant/user content body.

alter table public.ai_chat_messages
  drop constraint if exists ai_chat_messages_content_bytes_check;

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
      if (tg_table_name = 'calendar_auth_tokens'
          and r.column_name in ('access_token', 'refresh_token'))
        or (tg_table_name = 'ai_chat_messages'
          and r.column_name = 'content')
      then
        continue;
      end if;

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
