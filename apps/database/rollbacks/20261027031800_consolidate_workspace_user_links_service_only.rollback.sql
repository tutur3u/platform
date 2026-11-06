-- Rollback for 20261027031800_consolidate_workspace_user_links_service_only.sql.
-- Restores the 20260503123000 definition (search_path = public, no caller
-- check) and the previous EXECUTE grants (PUBLIC, anon, authenticated, service_role).
-- This REOPENS anonymous and signed-in access to a data-writing repair RPC;
-- apply manually only with release-authority approval.
-- Not a migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.consolidate_workspace_user_links(target_ws_id uuid DEFAULT NULL)
RETURNS TABLE(
  platform_user_id uuid,
  ws_id uuid,
  action text
) AS $$
DECLARE
  rec RECORD;
  new_workspace_user_id uuid;
  matching_workspace_user_count integer := 0;
  matching_workspace_user_id uuid;
  user_display_name text;
  user_email text;
BEGIN
  FOR rec IN
    SELECT wm.user_id, wm.ws_id
    FROM public.workspace_members wm
    WHERE (target_ws_id IS NULL OR wm.ws_id = target_ws_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_user_linked_users wul
        WHERE wul.platform_user_id = wm.user_id
          AND wul.ws_id = wm.ws_id
      )
  LOOP
    matching_workspace_user_count := 0;
    matching_workspace_user_id := NULL;
    new_workspace_user_id := NULL;

    SELECT u.display_name, NULLIF(TRIM(COALESCE(upd.email, '')), '')
    INTO user_display_name, user_email
    FROM public.users u
    LEFT JOIN public.user_private_details upd ON upd.user_id = u.id
    WHERE u.id = rec.user_id;

    IF user_display_name IS NULL THEN
      CONTINUE;
    END IF;

    IF user_email IS NOT NULL THEN
      SELECT COUNT(*), (ARRAY_AGG(wu.id ORDER BY wu.id::text))[1]
      INTO matching_workspace_user_count, matching_workspace_user_id
      FROM public.workspace_users wu
      WHERE wu.ws_id = rec.ws_id
        AND wu.email IS NOT NULL
        AND LOWER(TRIM(wu.email)) = LOWER(user_email)
        AND NOT EXISTS (
          SELECT 1
          FROM public.workspace_user_linked_users wul
          WHERE wul.virtual_user_id = wu.id
        );
    END IF;

    IF matching_workspace_user_count = 1 AND matching_workspace_user_id IS NOT NULL THEN
      new_workspace_user_id := matching_workspace_user_id;
      action := 'linked_existing';
    ELSE
      new_workspace_user_id := gen_random_uuid();
      action := 'created';

      INSERT INTO public.workspace_users (id, ws_id, display_name, email)
      VALUES (new_workspace_user_id, rec.ws_id, user_display_name, COALESCE(user_email, ''));
    END IF;

    INSERT INTO public.workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
    VALUES (rec.user_id, new_workspace_user_id, rec.ws_id);

    platform_user_id := rec.user_id;
    ws_id := rec.ws_id;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

grant execute on function public.consolidate_workspace_user_links(uuid)
to public, anon, authenticated, service_role;

commit;
