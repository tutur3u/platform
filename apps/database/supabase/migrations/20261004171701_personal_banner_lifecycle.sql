-- Public banner object retirement is atomic with profile state, not best-effort.
CREATE TABLE private.profile_banner_retirements (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  public_url text NOT NULL,
  file_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  scrubbed_at timestamptz,
  not_before timestamptz NOT NULL DEFAULT now() + interval '3 hours',
  PRIMARY KEY (user_id, public_url)
);
CREATE TABLE private.profile_banner_operations (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  file_path text,
  public_url text,
  expected_url text,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','issued','committed','conflict')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ticket_until timestamptz,
  PRIMARY KEY (user_id, operation_id)
);
ALTER TABLE private.profile_banner_retirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.profile_banner_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.profile_banner_retirements, private.profile_banner_operations FROM PUBLIC, anon, authenticated;

-- Object identity ignores URL query/fragment and canonicalizes encoded path aliases.
CREATE FUNCTION private.banner_url_key(p_url text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE raw text; authority text; path text; bytes bytea := ''::bytea;
  i integer:=1; segments text[]:='{}'; segment text;
BEGIN
  raw:=split_part(split_part(p_url,'#',1),'?',1);
  authority:=substring(raw FROM '^https?://[^/]+');
  IF authority IS NULL THEN RETURN raw; END IF;
  path:=substring(raw FROM length(authority)+1);
  WHILE i<=length(path) LOOP
    IF substring(path FROM i FOR 3) ~ '^%[0-9A-Fa-f]{2}$' THEN
      bytes:=bytes||decode(substring(path FROM i+1 FOR 2),'hex'); i:=i+3;
    ELSE bytes:=bytes||convert_to(substring(path FROM i FOR 1),'UTF8'); i:=i+1;
    END IF;
  END LOOP;
  path:=convert_from(bytes,'UTF8');
  bytes:=''::bytea; i:=1;
  WHILE i<=length(authority) LOOP
    IF substring(authority FROM i FOR 3) ~ '^%[0-9A-Fa-f]{2}$' THEN
      bytes:=bytes||decode(substring(authority FROM i+1 FOR 2),'hex'); i:=i+3;
    ELSE bytes:=bytes||convert_to(substring(authority FROM i FOR 1),'UTF8'); i:=i+1; END IF;
  END LOOP;
  authority:=convert_from(bytes,'UTF8');
  authority:=regexp_replace(authority,'^(https?://).*@','\1');
  FOREACH segment IN ARRAY string_to_array(path,'/') LOOP
    IF segment='..' THEN segments:=segments[1:greatest(cardinality(segments)-1,0)];
    ELSIF segment<>'.' AND segment<>'' THEN segments:=array_append(segments,segment);
    END IF;
  END LOOP;
  authority:=lower(authority);
  IF authority LIKE 'https://%' THEN authority:=regexp_replace(authority,':443$','');
  ELSE authority:=regexp_replace(authority,':80$',''); END IF;
  RETURN authority||'/'||array_to_string(segments,'/');
EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN RETURN raw;
END;
$$;
REVOKE ALL ON FUNCTION private.banner_url_key(text) FROM PUBLIC,anon,authenticated;
-- Retired URLs remain tombstoned after deletion, closing the check/delete ABA gap.
CREATE FUNCTION private.prevent_retired_banner_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.banner_url IS DISTINCT FROM OLD.banner_url AND NEW.banner_url IS NOT NULL
     AND EXISTS (SELECT 1 FROM private.profile_banner_retirements r
                 WHERE r.user_id = NEW.id AND private.banner_url_key(r.public_url) = private.banner_url_key(NEW.banner_url)) THEN
    RAISE EXCEPTION 'Banner URL has been retired' USING ERRCODE = '22023';
  END IF;
  IF NEW.banner_url IS DISTINCT FROM OLD.banner_url AND NEW.banner_url IS NOT NULL
     AND EXISTS(SELECT 1 FROM private.profile_banner_operations o
       WHERE o.user_id=NEW.id AND o.public_url<>NEW.banner_url
       AND private.banner_url_key(o.public_url)=private.banner_url_key(NEW.banner_url)) THEN
    RAISE EXCEPTION 'Managed banner URL must be canonical' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_retired_banner_assignment BEFORE UPDATE OF banner_url ON public.users
FOR EACH ROW EXECUTE FUNCTION private.prevent_retired_banner_assignment();

CREATE FUNCTION private.retire_owned_banner(p_user_id uuid, p_url text, p_origin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE prefix text; path text;
BEGIN
  -- Origin is supplied only by authenticated server code from its configured Storage URL.
  IF p_origin IS NULL OR p_origin !~ '^https?://[^/?#]+$' THEN
    RAISE EXCEPTION 'Invalid storage origin' USING ERRCODE = '22023';
  END IF;
  prefix := p_origin || '/storage/v1/object/public/banners/';
  IF p_url IS NULL OR left(p_url, length(prefix)) <> prefix THEN RETURN; END IF;
  path := substring(p_url FROM length(prefix) + 1);
  IF path !~ ('^' || p_user_id::text || '/([0-9]{13}|[0-9a-f-]{36})[.](png|jpg|jpeg|gif|webp)$') THEN RETURN; END IF;
  INSERT INTO private.profile_banner_retirements(user_id,public_url,file_path,not_before)
    VALUES(p_user_id,p_url,path,greatest(now()+interval '3 hours',
      (SELECT max(ticket_until) FROM private.profile_banner_operations WHERE user_id=p_user_id AND public_url=p_url)))
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE FUNCTION public.update_public_user_profile_with_banner_lifecycle(
  p_user_id uuid, p_patch jsonb, p_storage_origin text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous text; current_url text;
BEGIN
  SELECT banner_url INTO previous FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.update_public_user_profile(p_user_id,p_patch);
  SELECT banner_url INTO current_url FROM public.users WHERE id=p_user_id;
  IF previous IS DISTINCT FROM current_url THEN
    PERFORM private.retire_owned_banner(p_user_id,previous,p_storage_origin);
  END IF;
END;
$$;

CREATE FUNCTION public.claim_profile_banner_upload(
  p_user_id uuid, p_operation_id uuid, p_file_path text, p_public_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous text; receipt private.profile_banner_operations; inserted boolean;
BEGIN
  SELECT banner_url INTO previous FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
  IF p_file_path !~ ('^' || p_user_id::text || '/' || p_operation_id::text || '[.](png|jpg|jpeg|gif|webp)$') THEN
    RAISE EXCEPTION 'Invalid banner path' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.profile_banner_operations WHERE user_id=p_user_id AND operation_id=p_operation_id)
     AND (SELECT count(*) FROM private.profile_banner_operations WHERE user_id=p_user_id AND created_at>=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) >= 100 THEN
    RAISE EXCEPTION 'Banner operation limit reached' USING ERRCODE='PT429';
  END IF;
  INSERT INTO private.profile_banner_operations(user_id,operation_id,file_path,public_url,expected_url)
    VALUES(p_user_id,p_operation_id,p_file_path,p_public_url,previous) ON CONFLICT DO NOTHING;
  inserted := FOUND;
  SELECT * INTO receipt FROM private.profile_banner_operations WHERE user_id=p_user_id AND operation_id=p_operation_id;
  IF receipt.file_path IS DISTINCT FROM p_file_path OR receipt.public_url IS DISTINCT FROM p_public_url THEN
    RAISE EXCEPTION 'Operation parameters changed' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('state',receipt.state,'claimed',inserted);
END;
$$;
CREATE FUNCTION public.issue_profile_banner_upload(p_user_id uuid,p_operation_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE private.profile_banner_operations SET state='issued'
  WHERE user_id=p_user_id AND operation_id=p_operation_id AND state='reserved';
$$;

-- The server never returns a freshly signed token until this lease commits.
CREATE FUNCTION public.record_profile_banner_ticket(p_user_id uuid,p_operation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
  UPDATE private.profile_banner_operations o SET ticket_until=now()+interval '3 hours'
    WHERE o.user_id=p_user_id AND o.operation_id=p_operation_id AND o.state='issued'
      AND NOT EXISTS(SELECT 1 FROM private.profile_banner_retirements r WHERE r.user_id=p_user_id AND r.public_url=o.public_url);
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.record_profile_banner_ticket(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_profile_banner_ticket(uuid,uuid) TO service_role;
CREATE FUNCTION public.commit_profile_banner_operation(
  p_user_id uuid,p_operation_id uuid,p_storage_origin text,p_remove boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_url text; receipt private.profile_banner_operations;
BEGIN
  -- Always take the user lock first, including uploads and removals.
  SELECT banner_url INTO current_url FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
  IF p_remove THEN
    IF NOT EXISTS(SELECT 1 FROM private.profile_banner_operations WHERE user_id=p_user_id AND operation_id=p_operation_id)
       AND (SELECT count(*) FROM private.profile_banner_operations WHERE user_id=p_user_id AND created_at>=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) >= 100 THEN
      RAISE EXCEPTION 'Banner operation limit reached' USING ERRCODE='PT429';
    END IF;
    INSERT INTO private.profile_banner_operations(user_id,operation_id,expected_url)
      VALUES(p_user_id,p_operation_id,current_url) ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO receipt FROM private.profile_banner_operations
    WHERE user_id=p_user_id AND operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR (p_remove <> (receipt.file_path IS NULL)) THEN
    RAISE EXCEPTION 'Invalid banner operation' USING ERRCODE='22023';
  END IF;
  IF receipt.state IN ('committed','conflict') THEN
    RETURN jsonb_build_object('state',receipt.state);
  END IF;
  IF NOT p_remove AND receipt.state <> 'issued' THEN
    RAISE EXCEPTION 'Upload ticket is not ready' USING ERRCODE='55000';
  END IF;
  IF NOT p_remove AND current_url = receipt.public_url THEN
    UPDATE private.profile_banner_operations SET state='committed' WHERE user_id=p_user_id AND operation_id=p_operation_id;
    RETURN jsonb_build_object('state','committed');
  END IF;
  IF current_url IS DISTINCT FROM receipt.expected_url THEN
    -- A stale upload never overwrites a later edit, and its immutable object is retired.
    PERFORM private.retire_owned_banner(p_user_id,receipt.public_url,p_storage_origin);
    UPDATE private.profile_banner_operations SET state='conflict' WHERE user_id=p_user_id AND operation_id=p_operation_id;
    RETURN jsonb_build_object('state','conflict');
  END IF;
  PERFORM public.update_public_user_profile_with_banner_lifecycle(
    p_user_id,jsonb_build_object('banner_url',receipt.public_url),p_storage_origin);
  UPDATE private.profile_banner_operations SET state='committed' WHERE user_id=p_user_id AND operation_id=p_operation_id;
  RETURN jsonb_build_object('state','committed');
END;
$$;
CREATE FUNCTION public.abandon_profile_banner_operation(p_user_id uuid,p_operation_id uuid,p_storage_origin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_url text; receipt private.profile_banner_operations;
BEGIN
  SELECT banner_url INTO current_url FROM public.users WHERE id=p_user_id FOR UPDATE;
  SELECT * INTO receipt FROM private.profile_banner_operations
    WHERE user_id=p_user_id AND operation_id=p_operation_id FOR UPDATE;
  IF receipt.state IN ('reserved','issued') AND receipt.public_url IS DISTINCT FROM current_url THEN
    PERFORM private.retire_owned_banner(p_user_id,receipt.public_url,p_storage_origin);
    UPDATE private.profile_banner_operations SET state='conflict' WHERE user_id=p_user_id AND operation_id=p_operation_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.abandon_profile_banner_operation(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_profile_banner_operation(uuid,uuid,text) TO service_role;
-- Abandoned staged files have a bounded 30-day replay window, then are retired.
CREATE FUNCTION public.expire_profile_banner_operations(p_user_id uuid,p_storage_origin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE receipt record; current_url text;
BEGIN
  SELECT banner_url INTO current_url FROM public.users WHERE id=p_user_id FOR UPDATE;
  FOR receipt IN SELECT * FROM private.profile_banner_operations
    WHERE user_id=p_user_id AND state IN ('reserved','issued') AND created_at<now()-interval '30 days'
    ORDER BY created_at LIMIT 20 FOR UPDATE LOOP
    IF receipt.public_url IS DISTINCT FROM current_url THEN
      PERFORM private.retire_owned_banner(p_user_id,receipt.public_url,p_storage_origin);
      UPDATE private.profile_banner_operations SET state='conflict' WHERE user_id=p_user_id AND operation_id=receipt.operation_id;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_profile_banner_operations(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_profile_banner_operations(uuid,text) TO service_role;
CREATE FUNCTION public.pending_profile_banner_retirements(p_user_id uuid)
RETURNS TABLE(public_url text,file_path text,scrubbed_at timestamptz,delete_ready boolean) LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.public_url,r.file_path,r.scrubbed_at,r.not_before<=now() FROM private.profile_banner_retirements r
  WHERE r.user_id=p_user_id AND r.deleted_at IS NULL
    AND (r.scrubbed_at IS NULL OR r.not_before<=now())
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_user_id AND u.banner_url=r.public_url)
  ORDER BY r.created_at,r.public_url LIMIT 20;
$$;
CREATE FUNCTION public.complete_profile_banner_retirement(p_user_id uuid,p_public_url text,p_deleted boolean DEFAULT false)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE private.profile_banner_retirements SET scrubbed_at=coalesce(scrubbed_at,now()),
    deleted_at=CASE WHEN p_deleted AND not_before<=now() THEN now() ELSE deleted_at END
  WHERE user_id=p_user_id AND public_url=p_public_url AND deleted_at IS NULL;
$$;
CREATE FUNCTION public.profile_banner_operation_status(p_user_id uuid,p_operation_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('state',state,'file_path',file_path,'public_url',public_url)
  FROM private.profile_banner_operations WHERE user_id=p_user_id AND operation_id=p_operation_id;
$$;
REVOKE ALL ON FUNCTION public.profile_banner_operation_status(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.profile_banner_operation_status(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.prevent_retired_banner_assignment(), private.retire_owned_banner(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_public_user_profile_with_banner_lifecycle(uuid,jsonb,text), public.claim_profile_banner_upload(uuid,uuid,text,text), public.issue_profile_banner_upload(uuid,uuid), public.commit_profile_banner_operation(uuid,uuid,text,boolean), public.pending_profile_banner_retirements(uuid), public.complete_profile_banner_retirement(uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_public_user_profile_with_banner_lifecycle(uuid,jsonb,text), public.claim_profile_banner_upload(uuid,uuid,text,text), public.issue_profile_banner_upload(uuid,uuid), public.commit_profile_banner_operation(uuid,uuid,text,boolean), public.pending_profile_banner_retirements(uuid), public.complete_profile_banner_retirement(uuid,text,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
