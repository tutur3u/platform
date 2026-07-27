-- Immutable, workspace-scoped AI Studio prompt and agent assets.

CREATE TABLE private.ai_studio_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description TEXT,
  latest_version INTEGER NOT NULL DEFAULT 0 CHECK (latest_version >= 0),
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ws_id, slug)
);

CREATE TABLE private.ai_studio_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES private.ai_studio_prompts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(variables) = 'array'),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  change_note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prompt_id, version)
);

CREATE TABLE private.ai_studio_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description TEXT,
  latest_version INTEGER NOT NULL DEFAULT 0 CHECK (latest_version >= 0),
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ws_id, slug)
);

CREATE TABLE private.ai_studio_agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES private.ai_studio_agents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  model_id TEXT NOT NULL,
  instructions TEXT NOT NULL,
  prompt_version_id UUID REFERENCES private.ai_studio_prompt_versions(id) ON DELETE RESTRICT,
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  change_note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version)
);

CREATE TABLE private.ai_studio_curated_tools (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_.-]+$'),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  capability TEXT NOT NULL,
  input_schema JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_schema) = 'object'),
  globally_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE private.ai_studio_agent_version_tools (
  agent_version_id UUID NOT NULL REFERENCES private.ai_studio_agent_versions(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES private.ai_studio_curated_tools(id) ON DELETE RESTRICT,
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  PRIMARY KEY (agent_version_id, tool_id)
);

CREATE INDEX ai_studio_prompts_ws_updated_idx
  ON private.ai_studio_prompts (ws_id, updated_at DESC);
CREATE INDEX ai_studio_prompt_versions_prompt_idx
  ON private.ai_studio_prompt_versions (prompt_id, version DESC);
CREATE INDEX ai_studio_agents_ws_updated_idx
  ON private.ai_studio_agents (ws_id, updated_at DESC);
CREATE INDEX ai_studio_agent_versions_agent_idx
  ON private.ai_studio_agent_versions (agent_id, version DESC);

ALTER TABLE private.ai_studio_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_curated_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_agent_version_tools ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  private.ai_studio_prompts,
  private.ai_studio_prompt_versions,
  private.ai_studio_agents,
  private.ai_studio_agent_versions,
  private.ai_studio_curated_tools,
  private.ai_studio_agent_version_tools
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  private.ai_studio_prompts,
  private.ai_studio_prompt_versions,
  private.ai_studio_agents,
  private.ai_studio_agent_versions,
  private.ai_studio_curated_tools,
  private.ai_studio_agent_version_tools
TO service_role;

COMMENT ON TABLE private.ai_studio_curated_tools IS
  'Allowlisted Tuturuuu capabilities. Arbitrary HTTP and code execution are deliberately unsupported.';
