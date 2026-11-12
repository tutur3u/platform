-- Workspace custom domains: hostnames a workspace binds to its public web
-- presence (published CMS site or landing page), served by the
-- tuturuuu-workspace-domains edge Worker.
--
-- * Deny by default. A domain may be added only when
--   private.workspace_domain_entitlement allows it: a verified staff actor
--   (public.is_verified_tuturuuu_staff with p_allow_xwf = false, the SQL
--   twin of isVerifiedTuturuuuStaffSession: confirmed email in exactly
--   @tuturuuu.com and a pinned Azure tenant) holding
--   manage_workspace_domains (staff bypass), or a paid
--   workspace whose custom-domain add-on quantity covers its domains while
--   paid add-ons are enabled. Bypass never skips verification.
-- * private.workspace_domain_settings is the global kill switch, cap,
--   grace and quarantine configuration (one row).
-- * Members read through RLS (view or manage permission). Every write goes
--   through apps/web with the service role after a permission and
--   entitlement check, so client roles get SELECT only.
-- * One live row per normalized hostname across all workspaces. Removed
--   platform subdomains stay quarantined for other workspaces.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.workspace_domain_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Kill switch: false blocks new domains, verification and serving.
  enabled boolean NOT NULL DEFAULT true,
  -- Paid add-on entitlement counts only while true (billing launch gate).
  paid_addon_enabled boolean NOT NULL DEFAULT false,
  default_domain_cap integer NOT NULL DEFAULT 10
    CHECK (default_domain_cap BETWEEN 0 AND 1000),
  lapse_grace_days integer NOT NULL DEFAULT 7
    CHECK (lapse_grace_days BETWEEN 0 AND 90),
  quarantine_days integer NOT NULL DEFAULT 30
    CHECK (quarantine_days BETWEEN 0 AND 365),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

INSERT INTO private.workspace_domain_settings (id) VALUES (true);

ALTER TABLE private.workspace_domain_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workspace_domain_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON private.workspace_domain_settings TO service_role;

-- Root override of the per-workspace cap.
CREATE TABLE private.workspace_domain_caps (
  ws_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain_cap integer NOT NULL CHECK (domain_cap BETWEEN 0 AND 1000),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE private.workspace_domain_caps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workspace_domain_caps FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.workspace_domain_caps TO service_role;

-- Custom-domain add-on subscriptions reconciled from Polar webhooks
-- (product metadata product_kind = custom_domain_addon). quantity = domains.
CREATE TABLE private.workspace_domain_addons (
  polar_subscription_id text PRIMARY KEY
    CHECK (char_length(polar_subscription_id) BETWEEN 1 AND 200),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  polar_product_id text NOT NULL CHECK (char_length(polar_product_id) <= 200),
  quantity integer NOT NULL CHECK (quantity BETWEEN 0 AND 1000),
  status text NOT NULL CHECK (char_length(status) <= 50),
  current_period_end timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX workspace_domain_addons_ws_idx
  ON private.workspace_domain_addons (ws_id);

ALTER TABLE private.workspace_domain_addons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workspace_domain_addons FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private.workspace_domain_addons TO service_role;

CREATE TABLE public.workspace_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  hostname text NOT NULL CHECK (
    char_length(hostname) <= 253
    AND hostname = lower(hostname)
    AND hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  kind text NOT NULL CHECK (kind IN ('custom', 'platform_subdomain')),
  status text NOT NULL DEFAULT 'pending_verification' CHECK (
    status IN ('pending_verification', 'verifying', 'active', 'suspended', 'removed')
  ),
  verification_txt_name text NOT NULL CHECK (char_length(verification_txt_name) <= 300),
  verification_txt_value text NOT NULL CHECK (
    verification_txt_value ~ '^tuturuuu-domain-verification=[A-Za-z0-9_-]{32,64}$'
  ),
  ownership_status text CHECK (char_length(ownership_status) <= 50),
  ssl_status text CHECK (char_length(ssl_status) <= 50),
  -- Cloudflare for SaaS DCV / ownership records to show the customer.
  dns_records jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(dns_records) = 'array' AND pg_column_size(dns_records) <= 16384
  ),
  cloudflare_custom_hostname_id text CHECK (char_length(cloudflare_custom_hostname_id) <= 100),
  cloudflare_dns_record_id text CHECK (char_length(cloudflare_dns_record_id) <= 100),
  cloudflare_worker_route_id text CHECK (char_length(cloudflare_worker_route_id) <= 100),
  entitlement_source text NOT NULL CHECK (entitlement_source IN ('paid_addon', 'staff_bypass')),
  error text CHECK (char_length(error) <= 500),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_checked_at timestamp with time zone,
  activated_at timestamp with time zone,
  removed_at timestamp with time zone,
  CONSTRAINT workspace_domains_removed_check
    CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);

-- One live binding per hostname across every workspace.
CREATE UNIQUE INDEX workspace_domains_live_hostname_key
  ON public.workspace_domains (hostname)
  WHERE status <> 'removed';
CREATE INDEX workspace_domains_ws_idx
  ON public.workspace_domains (ws_id, status);
CREATE INDEX workspace_domains_removed_hostname_idx
  ON public.workspace_domains (hostname, removed_at)
  WHERE status = 'removed';

ALTER TABLE public.workspace_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_required_mfa
ON public.workspace_domains
AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT public.account_required_mfa_satisfied()))
WITH CHECK ((SELECT public.account_required_mfa_satisfied()));

CREATE POLICY "Workspace domain viewers can read domains"
ON public.workspace_domains
FOR SELECT
TO authenticated
USING (
  status <> 'removed'
  AND (
    public.has_workspace_permission(ws_id, (SELECT auth.uid()), 'view_workspace_domains')
    OR public.has_workspace_permission(ws_id, (SELECT auth.uid()), 'manage_workspace_domains')
  )
);

-- No client INSERT/UPDATE/DELETE: apps/web writes with the service role
-- after its permission, entitlement and provider checks.
REVOKE ALL ON public.workspace_domains FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workspace_domains TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workspace_domains TO service_role;

-- Append-only audit without DNS tokens, provider credentials or secrets.
CREATE TABLE private.workspace_domain_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL,
  domain_id uuid,
  hostname text NOT NULL CHECK (char_length(hostname) <= 253),
  action text NOT NULL CHECK (action IN (
    'add', 'verify', 'activate', 'suspend', 'remove', 'denied', 'provider_error'
  )),
  actor_id uuid,
  entitlement_source text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(detail) = 'object' AND pg_column_size(detail) <= 4096
  ),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX workspace_domain_audit_ws_idx
  ON private.workspace_domain_audit (ws_id, created_at DESC);

ALTER TABLE private.workspace_domain_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workspace_domain_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON private.workspace_domain_audit TO service_role;

-- Entitlement policy. Fails closed: kill switch off, missing workspace or
-- settings row, or no qualifying source all deny. Returns
-- { allowed, reason, source, cap, used, total, remaining }.
-- reason: ok | kill_switch | workspace_missing | cap_reached | no_slots |
--         paid_plan_required | billing_unavailable | addon_required.
CREATE FUNCTION private.workspace_domain_entitlement(
  p_ws_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_settings private.workspace_domain_settings;
  v_cap integer;
  v_used integer;
  v_total integer := 0;
  v_source text;
  v_reason text;
  v_tier text;
  v_addon_quantity integer;
BEGIN
  SELECT * INTO v_settings FROM private.workspace_domain_settings WHERE id;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'kill_switch',
      'source', null, 'cap', 0, 'used', 0, 'total', 0, 'remaining', 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = p_ws_id AND coalesce(deleted, false) = false
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'workspace_missing',
      'source', null, 'cap', 0, 'used', 0, 'total', 0, 'remaining', 0);
  END IF;

  SELECT coalesce(
    (SELECT domain_cap FROM private.workspace_domain_caps WHERE ws_id = p_ws_id),
    v_settings.default_domain_cap
  ) INTO v_cap;

  SELECT count(*) INTO v_used
  FROM public.workspace_domains
  WHERE ws_id = p_ws_id AND status <> 'removed';

  IF p_actor_id IS NOT NULL
    AND public.is_verified_tuturuuu_staff(p_actor_id, false)
    AND public.has_workspace_permission(p_ws_id, p_actor_id, 'manage_workspace_domains')
  THEN
    v_source := 'staff_bypass';
    v_total := v_cap;
  ELSE
    v_tier := coalesce(public._resolve_workspace_tier(p_ws_id)::text, 'FREE');
    IF v_tier = 'FREE' THEN
      v_reason := 'paid_plan_required';
    ELSIF NOT v_settings.paid_addon_enabled THEN
      v_reason := 'billing_unavailable';
    ELSE
      SELECT coalesce(sum(quantity), 0) INTO v_addon_quantity
      FROM private.workspace_domain_addons
      WHERE ws_id = p_ws_id
        AND status IN ('active', 'trialing')
        AND (current_period_end IS NULL OR current_period_end > now());
      IF v_addon_quantity > 0 THEN
        v_source := 'paid_addon';
        v_total := least(v_addon_quantity, v_cap);
      ELSE
        v_reason := 'addon_required';
      END IF;
    END IF;
  END IF;

  IF v_source IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', v_reason,
      'source', null, 'cap', v_cap, 'used', v_used, 'total', 0, 'remaining', 0);
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_used < v_total,
    'reason', CASE
      WHEN v_used < v_total THEN 'ok'
      WHEN v_total >= v_cap THEN 'cap_reached'
      ELSE 'no_slots'
    END,
    'source', v_source,
    'cap', v_cap,
    'used', v_used,
    'total', v_total,
    'remaining', greatest(v_total - v_used, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.workspace_domain_entitlement(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.workspace_domain_entitlement(uuid,uuid) review=workspace-domains-service-only-entitlement
GRANT EXECUTE ON FUNCTION private.workspace_domain_entitlement(uuid, uuid) TO service_role;

-- Whether an active domain may keep serving: kill switch on and either a
-- staff-bypass binding whose creator is still verified staff, or a paid
-- workspace whose add-on covers the domain until period end plus grace.
CREATE FUNCTION private.workspace_domain_serving_allowed(p_domain_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_settings private.workspace_domain_settings;
  v_domain public.workspace_domains;
  v_rank integer;
  v_quantity integer;
BEGIN
  SELECT * INTO v_settings FROM private.workspace_domain_settings WHERE id;
  IF NOT FOUND OR NOT v_settings.enabled THEN RETURN false; END IF;

  SELECT * INTO v_domain FROM public.workspace_domains WHERE id = p_domain_id;
  IF NOT FOUND OR v_domain.status <> 'active' THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = v_domain.ws_id AND coalesce(deleted, false) = false
  ) THEN
    RETURN false;
  END IF;

  IF v_domain.entitlement_source = 'staff_bypass' THEN
    RETURN coalesce(public.is_verified_tuturuuu_staff(v_domain.created_by, false), false);
  END IF;

  IF NOT v_settings.paid_addon_enabled
    OR coalesce(public._resolve_workspace_tier(v_domain.ws_id)::text, 'FREE') = 'FREE'
  THEN
    RETURN false;
  END IF;

  SELECT coalesce(sum(quantity), 0) INTO v_quantity
  FROM private.workspace_domain_addons
  WHERE ws_id = v_domain.ws_id
    AND status IN ('active', 'trialing', 'past_due', 'canceled')
    AND (
      current_period_end IS NULL
      OR current_period_end + make_interval(days => v_settings.lapse_grace_days) > now()
    );

  -- Oldest paid-addon bindings keep serving when quantity drops.
  SELECT count(*) INTO v_rank
  FROM public.workspace_domains d
  WHERE d.ws_id = v_domain.ws_id
    AND d.status = 'active'
    AND d.entitlement_source = 'paid_addon'
    AND (d.created_at, d.id) <= (v_domain.created_at, v_domain.id);

  RETURN v_rank <= v_quantity;
END;
$$;

REVOKE ALL ON FUNCTION private.workspace_domain_serving_allowed(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.workspace_domain_serving_allowed(uuid) review=workspace-domains-service-only-serving
GRANT EXECUTE ON FUNCTION private.workspace_domain_serving_allowed(uuid) TO service_role;

-- Persistence guard for new bindings: per-workspace cap (serialized per
-- workspace) and quarantine of removed platform subdomains for other
-- workspaces. Custom hostnames always need fresh TXT ownership proof before
-- activation, so a re-claim by another workspace proves control again.
CREATE FUNCTION private.guard_workspace_domain_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_settings private.workspace_domain_settings;
  v_cap integer;
  v_used integer;
BEGIN
  SELECT * INTO v_settings FROM private.workspace_domain_settings WHERE id;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RAISE EXCEPTION 'workspace domains are disabled' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('workspace_domains:' || NEW.ws_id::text, 0));

  SELECT coalesce(
    (SELECT domain_cap FROM private.workspace_domain_caps WHERE ws_id = NEW.ws_id),
    v_settings.default_domain_cap
  ) INTO v_cap;

  SELECT count(*) INTO v_used
  FROM public.workspace_domains
  WHERE ws_id = NEW.ws_id AND status <> 'removed';

  IF v_used >= v_cap THEN
    RAISE EXCEPTION 'workspace domain cap reached' USING ERRCODE = '23514';
  END IF;

  IF NEW.kind = 'platform_subdomain' AND EXISTS (
    SELECT 1 FROM public.workspace_domains removed
    WHERE removed.hostname = NEW.hostname
      AND removed.status = 'removed'
      AND removed.ws_id <> NEW.ws_id
      AND removed.removed_at > now() - make_interval(days => v_settings.quarantine_days)
  ) THEN
    RAISE EXCEPTION 'hostname is quarantined' USING ERRCODE = '23505';
  END IF;

  NEW.status := 'pending_verification';
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.activated_at := NULL;
  NEW.removed_at := NULL;
  RETURN NEW;
END;
$$;

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION private.guard_workspace_domain_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER workspace_domains_guard_insert
  BEFORE INSERT ON public.workspace_domains
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_workspace_domain_insert();

-- Hostname, workspace, kind and verification token are immutable; a
-- removed binding stays removed (re-adding creates a new row).
CREATE FUNCTION private.guard_workspace_domain_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.hostname IS DISTINCT FROM OLD.hostname
    OR NEW.ws_id IS DISTINCT FROM OLD.ws_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.verification_txt_name IS DISTINCT FROM OLD.verification_txt_name
    OR NEW.verification_txt_value IS DISTINCT FROM OLD.verification_txt_value
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.status = 'removed' AND NEW.status <> 'removed')
  THEN
    RAISE EXCEPTION 'workspace domain identity is immutable' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION private.guard_workspace_domain_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER workspace_domains_guard_update
  BEFORE UPDATE ON public.workspace_domains
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_workspace_domain_update();

COMMIT;
