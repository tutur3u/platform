-- AI Studio access policy, isolated credentials, traces, usage, and retention.
-- All tables are private and service-role-only; workspace authorization happens
-- in the satellite/API service layer using the dedicated permissions.

CREATE TABLE private.ai_studio_global_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  globally_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  workspace_default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  default_models TEXT[] NOT NULL DEFAULT '{}',
  capture_default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_retention_days INTEGER NOT NULL DEFAULT 365
    CHECK (metadata_retention_days BETWEEN 30 AND 2555),
  content_retention_days INTEGER NOT NULL DEFAULT 30
    CHECK (content_retention_days BETWEEN 1 AND 365),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO private.ai_studio_global_settings (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE private.workspace_ai_studio_policies (
  ws_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'inherit'
    CHECK (state IN ('inherit', 'enabled', 'disabled')),
  allowed_models TEXT[] NOT NULL DEFAULT '{}',
  denied_models TEXT[] NOT NULL DEFAULT '{}',
  capture_enabled BOOLEAN,
  metadata_retention_days INTEGER CHECK (metadata_retention_days BETWEEN 30 AND 2555),
  content_retention_days INTEGER CHECK (content_retention_days BETWEEN 1 AND 365),
  requests_per_minute INTEGER CHECK (requests_per_minute BETWEEN 1 AND 10000),
  monthly_credit_budget NUMERIC(14,4) CHECK (monthly_credit_budget > 0),
  no_training_enforced BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE private.ai_studio_workspace_model_grants (
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'root'
    CHECK (source IN ('root', 'plan', 'workspace')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_id, model_id, source)
);

CREATE TABLE private.ai_studio_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  prefix TEXT NOT NULL UNIQUE CHECK (left(prefix, 7) = 'ttr_ai_'),
  secret_hash TEXT NOT NULL UNIQUE,
  environment TEXT NOT NULL DEFAULT 'development'
    CHECK (environment IN ('development', 'staging', 'production')),
  allowed_models TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  requests_per_minute INTEGER CHECK (requests_per_minute BETWEEN 1 AND 10000),
  credit_budget NUMERIC(14,4) CHECK (credit_budget > 0),
  credits_used NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  credits_reserved NUMERIC(14,4) NOT NULL DEFAULT 0
    CHECK (credits_reserved >= 0),
  last_used_at TIMESTAMPTZ,
  last_used_ip_hash TEXT,
  revoked_at TIMESTAMPTZ,
  rotated_to UUID REFERENCES private.ai_studio_api_keys(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE private.ai_studio_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE,
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES private.ai_studio_api_keys(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  model_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'running', 'succeeded', 'failed', 'aborted')),
  reservation_id UUID REFERENCES private.ai_credit_reservations(id) ON DELETE SET NULL,
  reserved_credits NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  billed_credits NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (billed_credits >= 0),
  provider_cost_usd NUMERIC(16,8) NOT NULL DEFAULT 0 CHECK (provider_cost_usd >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  embedding_units INTEGER NOT NULL DEFAULT 0 CHECK (embedding_units >= 0),
  image_units INTEGER NOT NULL DEFAULT 0 CHECK (image_units >= 0),
  latency_ms INTEGER CHECK (latency_ms >= 0),
  first_token_latency_ms INTEGER CHECK (first_token_latency_ms >= 0),
  prompt_version_id UUID,
  agent_version_id UUID,
  idempotency_key TEXT,
  error_class TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE private.ai_studio_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES private.ai_studio_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('model', 'tool', 'grader', 'system')),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'aborted')),
  model_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  billed_credits NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (billed_credits >= 0),
  provider_cost_usd NUMERIC(16,8) NOT NULL DEFAULT 0 CHECK (provider_cost_usd >= 0),
  latency_ms INTEGER CHECK (latency_ms >= 0),
  error_class TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (run_id, sequence)
);

CREATE TABLE private.ai_studio_run_content (
  run_id UUID PRIMARY KEY REFERENCES private.ai_studio_runs(id) ON DELETE CASCADE,
  prompt JSONB,
  output JSONB,
  tool_arguments JSONB,
  tool_results JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE private.ai_studio_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL UNIQUE REFERENCES private.ai_studio_runs(id) ON DELETE CASCADE,
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES private.ai_studio_api_keys(id) ON DELETE SET NULL,
  model_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  billed_credits NUMERIC(14,4) NOT NULL CHECK (billed_credits >= 0),
  provider_cost_usd NUMERIC(16,8) NOT NULL DEFAULT 0 CHECK (provider_cost_usd >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_studio_keys_ws_created_idx
  ON private.ai_studio_api_keys (ws_id, created_at DESC);
CREATE INDEX ai_studio_keys_active_prefix_idx
  ON private.ai_studio_api_keys (prefix) WHERE revoked_at IS NULL;
CREATE INDEX ai_studio_runs_ws_created_idx
  ON private.ai_studio_runs (ws_id, created_at DESC, id);
CREATE INDEX ai_studio_runs_ws_model_created_idx
  ON private.ai_studio_runs (ws_id, model_id, created_at DESC);
CREATE INDEX ai_studio_runs_key_created_idx
  ON private.ai_studio_runs (api_key_id, created_at DESC) WHERE api_key_id IS NOT NULL;
CREATE INDEX ai_studio_runs_status_created_idx
  ON private.ai_studio_runs (status, created_at) WHERE status IN ('reserved', 'running');
CREATE UNIQUE INDEX ai_studio_runs_idempotency_idx
  ON private.ai_studio_runs (ws_id, api_key_id, idempotency_key)
  NULLS NOT DISTINCT
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX ai_studio_steps_run_sequence_idx
  ON private.ai_studio_run_steps (run_id, sequence);
CREATE INDEX ai_studio_content_expiry_idx
  ON private.ai_studio_run_content (expires_at);
CREATE INDEX ai_studio_usage_ws_created_idx
  ON private.ai_studio_usage (ws_id, created_at DESC);

ALTER TABLE private.ai_studio_global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.workspace_ai_studio_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_workspace_model_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_run_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  private.ai_studio_global_settings,
  private.workspace_ai_studio_policies,
  private.ai_studio_workspace_model_grants,
  private.ai_studio_api_keys,
  private.ai_studio_runs,
  private.ai_studio_run_steps,
  private.ai_studio_run_content,
  private.ai_studio_usage
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  private.ai_studio_global_settings,
  private.workspace_ai_studio_policies,
  private.ai_studio_workspace_model_grants,
  private.ai_studio_api_keys,
  private.ai_studio_runs,
  private.ai_studio_run_steps,
  private.ai_studio_run_content,
  private.ai_studio_usage
TO service_role;

COMMENT ON COLUMN private.ai_studio_api_keys.secret_hash IS
  'Hash only. The ttr_ai_ credential is revealed once and never stored.';
COMMENT ON TABLE private.ai_studio_run_content IS
  'Optional captured customer content. Disabled by default and separately retained.';
