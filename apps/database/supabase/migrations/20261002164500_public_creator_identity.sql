-- A shared public identity for satellite apps. Existing usernames remain valid.
ALTER TABLE public.users ADD COLUMN banner_url text;
ALTER TABLE public.users ADD CONSTRAINT users_banner_url_check
  CHECK (banner_url IS NULL OR (length(banner_url) <= 2000 AND banner_url ~ '^https://[^[:space:]]+$'));

CREATE FUNCTION public.enforce_user_handle_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.handle IS NOT DISTINCT FROM OLD.handle THEN
    RETURN NEW;
  END IF;
  IF NEW.handle IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.handles WHERE value = NEW.handle AND creator_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Username is unavailable' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_user_handle_owner BEFORE UPDATE OF handle
  ON public.users FOR EACH ROW EXECUTE FUNCTION public.enforce_user_handle_owner();

-- Called only by an authenticated API after resolving its actor. Handle claims
-- and profile changes share one transaction, so failed saves reserve nothing.
CREATE FUNCTION public.update_public_user_profile(p_user_id uuid, p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  requested_handle text;
  reserved_owner uuid;
BEGIN
  IF jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('display_name','bio','avatar_url','banner_url','handle')) THEN
    RAISE EXCEPTION 'Invalid profile patch' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002'; END IF;
  IF p_patch ? 'display_name' AND (jsonb_typeof(p_patch->'display_name') <> 'string' OR length(p_patch->>'display_name') NOT BETWEEN 1 AND 100) THEN
    RAISE EXCEPTION 'Invalid display name' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'bio' AND p_patch->'bio' <> 'null'::jsonb AND (jsonb_typeof(p_patch->'bio') <> 'string' OR length(p_patch->>'bio') > 1000) THEN
    RAISE EXCEPTION 'Invalid biography' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key IN ('avatar_url','banner_url') AND e.value <> 'null'::jsonb
    AND (jsonb_typeof(e.value) <> 'string' OR length(e.value #>> '{}') > 2000 OR e.value #>> '{}' !~ '^https://[^[:space:]]+$')) THEN
    RAISE EXCEPTION 'Invalid image URL' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'handle' THEN
    requested_handle := p_patch->>'handle';
    IF p_patch->'handle' <> 'null'::jsonb AND (jsonb_typeof(p_patch->'handle') <> 'string' OR requested_handle !~ '^[a-z0-9][a-z0-9_]{2,31}$') THEN
      RAISE EXCEPTION 'Invalid username' USING ERRCODE = '22023';
    END IF;
    IF requested_handle IS NOT NULL THEN
      INSERT INTO public.handles(value, creator_id) VALUES (requested_handle, p_user_id) ON CONFLICT DO NOTHING;
      SELECT creator_id INTO reserved_owner FROM public.handles WHERE value = requested_handle FOR UPDATE;
      IF reserved_owner IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'Username is unavailable' USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;
  UPDATE public.users SET
    display_name = CASE WHEN p_patch ? 'display_name' THEN p_patch->>'display_name' ELSE display_name END,
    bio = CASE WHEN p_patch ? 'bio' THEN p_patch->>'bio' ELSE bio END,
    avatar_url = CASE WHEN p_patch ? 'avatar_url' THEN p_patch->>'avatar_url' ELSE avatar_url END,
    banner_url = CASE WHEN p_patch ? 'banner_url' THEN p_patch->>'banner_url' ELSE banner_url END,
    handle = CASE WHEN p_patch ? 'handle' THEN requested_handle ELSE handle END
  WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_public_user_profile(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_public_user_profile(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_user_handle_owner() FROM PUBLIC, anon, authenticated;
