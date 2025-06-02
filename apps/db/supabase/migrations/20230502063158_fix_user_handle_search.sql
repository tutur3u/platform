DROP FUNCTION public.search_users_by_name(search_query character varying);
CREATE FUNCTION public.search_users_by_name(search_query character varying) RETURNS TABLE(
    id uuid,
    handle text,
    display_name text,
    avatar_url text
) LANGUAGE plpgsql AS $$ begin return query
SELECT u.id,
    u.handle,
    u.display_name,
    u.avatar_url
FROM public.users u
WHERE search_query % ANY(STRING_TO_ARRAY(u.handle, ' '))
    OR search_query % ANY(STRING_TO_ARRAY(u.display_name, ' '))
ORDER BY u.created_at
LIMIT 5;
end;
$$;