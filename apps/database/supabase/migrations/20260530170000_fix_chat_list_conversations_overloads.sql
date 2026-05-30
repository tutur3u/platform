-- PostgREST cannot resolve named-argument calls when legacy overloads remain
-- beside the current paginated chat_list_conversations signature.
drop function if exists private.chat_list_conversations(uuid, uuid);
drop function if exists private.chat_list_conversations(uuid, uuid, text);

notify pgrst, 'reload schema';
