-- A shared public identity for satellite apps. Existing usernames remain valid.
ALTER TABLE public.users ADD COLUMN banner_url text;
ALTER TABLE public.users ADD CONSTRAINT users_banner_url_check
  CHECK (banner_url IS NULL OR (length(banner_url) <= 2000 AND banner_url ~ '^https://[^[:space:]]+$'));

-- Reserved words are server-owned and mirrored by the shared client policy.
CREATE TABLE private.reserved_usernames (
  value text PRIMARY KEY CHECK(value ~ '^[a-z0-9]+$'),
  category text NOT NULL CHECK(category IN ('common','brand'))
);
ALTER TABLE private.reserved_usernames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.reserved_usernames FROM PUBLIC, anon, authenticated;
INSERT INTO private.reserved_usernames(value,category) SELECT jsonb_array_elements_text('["admin", "administrator", "anonymous", "account", "accounts", "artist", "artists", "creator", "creators", "dashboard", "default", "everyone", "example", "guest", "help", "home", "login", "logout", "moderator", "moderation", "official", "owner", "personal", "privacy", "profile", "public", "root", "security", "settings", "staff", "support", "system", "terms", "test", "testing", "unknown", "user", "username", "users", "website", "webmaster"]'::jsonb),'common';
INSERT INTO private.reserved_usernames(value,category) SELECT jsonb_array_elements_text('["adobe", "amazon", "android", "apple", "chatgpt", "claude", "cloudflare", "discord", "exocorpse", "facebook", "github", "gmail", "google", "instagram", "linkedin", "meta", "microsoft", "netflix", "nintendo", "nvidia", "openai", "paypal", "samsung", "slack", "snapchat", "sony", "spotify", "stripe", "telegram", "tesla", "tiktok", "tulletin", "tulettin", "tuturuuu", "twitch", "twitter", "vercel", "whatsapp", "windows", "youtube"]'::jsonb),'brand';
CREATE TABLE private.user_profile_change_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  field text NOT NULL CHECK(field IN ('handle','display_name')),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_profile_change_events_lookup ON private.user_profile_change_events(user_id,field,changed_at DESC);
ALTER TABLE private.user_profile_change_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.user_profile_change_events FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.is_reserved_username(p_value text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM private.reserved_usernames r
    WHERE (r.category='common' AND r.value=regexp_replace(lower(p_value),'_','','g'))
    OR (r.category='brand' AND regexp_replace(lower(p_value),'_','','g') ~ ('^(official)?'||r.value||'(official|support|admin|team|[0-9]+)?$')));
$$;
REVOKE ALL ON FUNCTION public.is_reserved_username(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_reserved_username(text) TO service_role;

-- All new reservations belong to the atomic server RPC. The legacy permissive
-- INSERT policy otherwise lets any authenticated actor reserve arbitrary names
-- or assign a reservation to another creator outside profile quotas.
CREATE POLICY handles_require_atomic_claim ON public.handles AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK (false);

-- Row-level locking serializes RPC and direct authenticated updates alike.
CREATE FUNCTION public.enforce_public_user_profile_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  last_change timestamptz;
  next_change timestamptz;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Profile identity cannot change' USING ERRCODE='22023';
  END IF;
  IF NEW.handle IS DISTINCT FROM OLD.handle THEN
    IF NEW.handle IS NOT NULL AND (NEW.handle !~ '^[a-z0-9][a-z0-9_]{4,31}$' OR public.is_reserved_username(NEW.handle)) THEN
      RAISE EXCEPTION 'Invalid or reserved username' USING ERRCODE='22023';
    END IF;
    IF NEW.handle IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.handles WHERE value=NEW.handle AND creator_id=NEW.id) THEN
      RAISE EXCEPTION 'Username is unavailable' USING ERRCODE='23505';
    END IF;
    SELECT max(changed_at) INTO last_change FROM private.user_profile_change_events WHERE user_id=NEW.id AND field='handle';
    IF last_change > now()-interval '14 days' THEN
      RAISE EXCEPTION 'Username can be changed every 14 days' USING ERRCODE='PT429', HINT='username_change_cooldown', DETAIL=ceil(extract(epoch FROM last_change+interval '14 days'-now()))::text;
    END IF;
    INSERT INTO private.user_profile_change_events(user_id,field) VALUES(NEW.id,'handle');
  END IF;
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF (SELECT count(*) FROM private.user_profile_change_events WHERE user_id=NEW.id AND field='display_name' AND changed_at>now()-interval '7 days') >= 2 THEN
      SELECT min(changed_at)+interval '7 days' INTO next_change FROM private.user_profile_change_events WHERE user_id=NEW.id AND field='display_name' AND changed_at>now()-interval '7 days';
      RAISE EXCEPTION 'Display name can be changed twice every 7 days' USING ERRCODE='PT429', HINT='display_name_change_limit', DETAIL=ceil(extract(epoch FROM next_change-now()))::text;
    END IF;
    INSERT INTO private.user_profile_change_events(user_id,field) VALUES(NEW.id,'display_name');
  END IF;
  DELETE FROM private.user_profile_change_events WHERE user_id=NEW.id AND changed_at<now()-interval '28 days';
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_public_user_profile_policy BEFORE UPDATE OF handle,display_name
  ON public.users FOR EACH ROW EXECUTE FUNCTION public.enforce_public_user_profile_policy();
REVOKE ALL ON FUNCTION public.enforce_public_user_profile_policy() FROM PUBLIC, anon, authenticated;

-- Called only by an authenticated API after resolving its actor. Handle claims
-- and profile changes share one transaction, so failed saves reserve nothing.
CREATE FUNCTION public.update_public_user_profile(p_user_id uuid, p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  requested_handle text;
  reserved_owner uuid;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
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
    IF requested_handle IS DISTINCT FROM (SELECT handle FROM public.users WHERE id=p_user_id) AND p_patch->'handle' <> 'null'::jsonb AND (jsonb_typeof(p_patch->'handle') <> 'string' OR (requested_handle !~ '^[a-z0-9][a-z0-9_]{4,31}$' OR public.is_reserved_username(requested_handle))) THEN
      RAISE EXCEPTION 'Invalid username' USING ERRCODE = '22023';
    END IF;
    IF requested_handle IS NOT NULL AND requested_handle IS DISTINCT FROM (SELECT handle FROM public.users WHERE id=p_user_id) THEN
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
