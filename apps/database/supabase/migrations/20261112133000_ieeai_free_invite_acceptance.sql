CREATE TABLE IF NOT EXISTS private.ieeai_invite_acceptances (
  invite_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  app_id text NOT NULL CHECK (app_id = 'ieeai-stats'),
  workspace_id uuid NOT NULL CHECK (
    workspace_id = 'a65cebd7-3a8c-4883-a3d9-82f9703d652f'::uuid
  ),
  role_ids uuid[] NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.ieeai_invite_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ieeai_invite_acceptances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.ieeai_invite_acceptances FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.accept_ieeai_free_workspace_invite(
  p_app_id text,
  p_workspace_id uuid,
  p_actor_id uuid,
  p_allowed_workspace_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET lock_timeout = '3s'
SET statement_timeout = '8s'
AS $$
DECLARE
  v_email text;
  v_subscription public.workspace_subscriptions%ROWTYPE;
  v_product private.workspace_subscription_products%ROWTYPE;
  v_invite record;
  v_count integer;
  v_role_ids uuid[];
  v_invite_id uuid;
  v_existing_type public.workspace_member_type;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    OR p_app_id IS DISTINCT FROM 'ieeai-stats'
    OR p_workspace_id IS DISTINCT FROM 'a65cebd7-3a8c-4883-a3d9-82f9703d652f'::uuid
    OR p_actor_id IS NULL
    OR (p_workspace_id = ANY(p_allowed_workspace_ids)) IS DISTINCT FROM TRUE
  THEN
    RETURN false;
  END IF;

  -- Table locks fence subscription inserts and case-variant invitation phantoms.
  -- All locks precede the canonical actor lock; no network work runs inside them.
  LOCK TABLE public.workspace_subscriptions IN SHARE MODE;
  LOCK TABLE private.workspace_subscription_products IN SHARE MODE;
  LOCK TABLE private.pending_invitation_seat_revocations IN SHARE MODE;
  LOCK TABLE public.workspace_invites, public.workspace_email_invites,
    public.workspace_invite_roles, public.workspace_email_invite_roles
    IN SHARE ROW EXCLUSIVE MODE;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':', p_workspace_id::text, p_actor_id::text), 81427
    )
  );

  SELECT lower(au.email) INTO v_email
  FROM auth.users au
  WHERE au.id = p_actor_id AND au.email_confirmed_at IS NOT NULL
    AND au.email IS NOT NULL AND au.email <> ''
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT wm.type INTO v_existing_type FROM public.workspace_members wm
  WHERE wm.ws_id = p_workspace_id AND wm.user_id = p_actor_id
  FOR UPDATE;
  IF FOUND THEN
    -- Existing members keep the ordinary session authorization contract.
    RETURN v_existing_type = 'MEMBER';
  END IF;

  PERFORM 1 FROM public.workspaces w
  WHERE w.id = p_workspace_id AND w.deleted = false AND w.personal = false
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM private.pending_invitation_seat_revocations r
    WHERE r.ws_id = p_workspace_id AND r.user_id = p_actor_id)
  THEN RETURN false; END IF;

  SELECT count(*) INTO v_count FROM public.workspace_subscriptions s
  WHERE s.ws_id = p_workspace_id AND s.status IN ('active', 'trialing', 'past_due');
  IF v_count <> 1 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_subscriptions s
    WHERE s.ws_id = p_workspace_id AND (s.status IS NULL OR
      s.status NOT IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete_expired')))
  THEN RETURN false; END IF;
  SELECT s.* INTO STRICT v_subscription FROM public.workspace_subscriptions s
  WHERE s.ws_id = p_workspace_id AND s.status IN ('active', 'trialing', 'past_due');
  SELECT pr.* INTO v_product FROM private.workspace_subscription_products pr
  WHERE pr.id = v_subscription.product_id;
  IF NOT FOUND OR v_product.tier IS DISTINCT FROM 'FREE'
    OR v_product.archived IS DISTINCT FROM false
    OR v_product.price IS DISTINCT FROM 0
    OR v_product.pricing_model NOT IN ('free', 'fixed')
    OR coalesce(v_product.price_per_seat, 0) <> 0
    OR v_product.min_seats IS NOT NULL OR v_product.max_seats IS NOT NULL
  THEN RETURN false; END IF;

  -- The free-product branch of getSeatStatus has no capacity ceiling. Keep
  -- the canonical database capacity/policy predicate as an additional fence.
  IF public.workspace_has_available_seats(p_workspace_id) IS DISTINCT FROM TRUE
  THEN RETURN false; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.workspace_invites wi
    WHERE wi.ws_id = p_workspace_id AND wi.user_id = p_actor_id
    UNION ALL
    SELECT 1 FROM public.workspace_email_invites ei
    WHERE ei.ws_id = p_workspace_id AND lower(ei.email) = v_email
  ) matches;
  IF v_count <> 1 THEN RETURN false; END IF;

  SELECT * INTO STRICT v_invite FROM (
    SELECT 'direct'::text AS source, wi.created_at, wi.type, wi.role_id,
      NULL::text AS email
    FROM public.workspace_invites wi
    WHERE wi.ws_id = p_workspace_id AND wi.user_id = p_actor_id
    UNION ALL
    SELECT 'email'::text, ei.created_at, ei.type, ei.role_id, ei.email
    FROM public.workspace_email_invites ei
    WHERE ei.ws_id = p_workspace_id AND lower(ei.email) = v_email
  ) matches;
  IF v_invite.type IS DISTINCT FROM 'MEMBER' OR v_invite.created_at IS NULL
  THEN RETURN false; END IF;

  SELECT coalesce(array_agg(role_id ORDER BY role_id), ARRAY[]::uuid[])
  INTO v_role_ids FROM (
    SELECT r.role_id FROM public.workspace_invite_roles r
    WHERE v_invite.source = 'direct' AND r.ws_id = p_workspace_id
      AND r.user_id = p_actor_id
    UNION
    SELECT r.role_id FROM public.workspace_email_invite_roles r
    WHERE v_invite.source = 'email' AND r.ws_id = p_workspace_id
      AND r.email = v_invite.email
  ) roles;
  IF cardinality(v_role_ids) = 0 AND v_invite.role_id IS NOT NULL THEN
    v_role_ids := ARRAY[v_invite.role_id];
  ELSIF v_invite.role_id IS NOT NULL
    AND NOT (v_invite.role_id = ANY(v_role_ids)) THEN
    RETURN false;
  END IF;

  v_invite_id := pg_catalog.md5(pg_catalog.concat_ws(':',
    p_workspace_id::text, p_actor_id::text, v_invite.source,
    extract(epoch FROM v_invite.created_at)::text))::uuid;
  IF private.finalize_workspace_invitation_membership_v2(
    p_workspace_id, p_actor_id, 'MEMBER', v_role_ids
  ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Invitation acceptance failed';
  END IF;
  IF v_invite.source = 'direct' THEN
    DELETE FROM public.workspace_invites
    WHERE ws_id = p_workspace_id AND user_id = p_actor_id;
  ELSE
    DELETE FROM public.workspace_email_invites
    WHERE ws_id = p_workspace_id AND email = v_invite.email;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation acceptance failed'; END IF;
  INSERT INTO private.ieeai_invite_acceptances (
    invite_id, actor_id, app_id, workspace_id, role_ids
  ) VALUES (v_invite_id, p_actor_id, p_app_id, p_workspace_id, v_role_ids);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.accept_ieeai_free_workspace_invite(text, uuid, uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.accept_ieeai_free_workspace_invite(text, uuid, uuid, uuid[])
  TO service_role;
