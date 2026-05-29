-- AI chat messages can include long assistant responses, markdown, tool
-- summaries, and multimodal file descriptions. Remove the remaining generic
-- check constraints that were added by strict public text-field hardening.

do $$
declare
  existing_constraint record;
begin
  for existing_constraint in
    select con.conname
    from pg_constraint con
    join pg_class cls
      on cls.oid = con.conrelid
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = 'ai_chat_messages'
      and con.contype = 'c'
      and (
        con.conname = any (array[
          'content_length_check',
          'ai_chat_messages_content_length_check',
          'content_strict_length_check',
          'ai_chat_messages_content_strict_length_check',
          'content_bytes_check',
          'ai_chat_messages_content_bytes_check',
          'content_strict_bytes_check',
          'ai_chat_messages_content_strict_bytes_check'
        ])
        or position(
          format('char_length(%I)', 'content')
          in pg_get_constraintdef(con.oid)
        ) > 0
        or position(
          format('octet_length(%I)', 'content')
          in pg_get_constraintdef(con.oid)
        ) > 0
      )
  loop
    execute format(
      'alter table public.ai_chat_messages drop constraint if exists %I',
      existing_constraint.conname
    );
  end loop;
end;
$$;
