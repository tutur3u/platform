CREATE OR REPLACE FUNCTION public.get_available_referral_users(
  p_ws_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  full_name text,
  display_name text,
  email text,
  phone text
)
LANGUAGE sql
SECURITY INVOKER
AS $$
WITH current AS (
  SELECT referred_by
  FROM public.workspace_users
  WHERE id = p_user_id
  LIMIT 1
)
SELECT wu.id,
       wu.full_name,
       wu.display_name,
       wu.email,
       wu.phone
FROM public.workspace_users wu
CROSS JOIN current c
WHERE wu.ws_id = p_ws_id
  AND wu.archived = false
  AND wu.id <> p_user_id
  -- Exclude the current user's own referrer if any
  AND (c.referred_by IS NULL OR wu.id <> c.referred_by)
  -- Exclude users who have already been referred by someone
  AND wu.referred_by IS NULL
  AND is_org_member(auth.uid(), p_ws_id)
ORDER BY wu.full_name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_referral_users(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_available_referral_users(uuid, uuid) IS
'Returns available referral candidates: excludes self, and anyone already referred.';
