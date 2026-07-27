-- AI Studio datasets, evaluation suites, and immutable experiment results.

CREATE TABLE private.ai_studio_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description TEXT,
  schema JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(schema) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE private.ai_studio_dataset_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES private.ai_studio_datasets(id) ON DELETE CASCADE,
  input JSONB NOT NULL,
  expected JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE private.ai_studio_evaluation_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description TEXT,
  dataset_id UUID REFERENCES private.ai_studio_datasets(id) ON DELETE SET NULL,
  graders JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(graders) = 'array'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE private.ai_studio_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  suite_id UUID NOT NULL REFERENCES private.ai_studio_evaluation_suites(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  target_type TEXT NOT NULL CHECK (target_type IN ('model', 'prompt', 'agent')),
  target_version_id UUID,
  model_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  summary JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(summary) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE private.ai_studio_evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES private.ai_studio_experiments(id) ON DELETE CASCADE,
  dataset_item_id UUID REFERENCES private.ai_studio_dataset_items(id) ON DELETE SET NULL,
  run_id UUID REFERENCES private.ai_studio_runs(id) ON DELETE SET NULL,
  grader_name TEXT NOT NULL,
  score NUMERIC,
  passed BOOLEAN,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_studio_datasets_ws_updated_idx
  ON private.ai_studio_datasets (ws_id, updated_at DESC);
CREATE INDEX ai_studio_dataset_items_dataset_idx
  ON private.ai_studio_dataset_items (dataset_id, created_at, id);
CREATE INDEX ai_studio_eval_suites_ws_updated_idx
  ON private.ai_studio_evaluation_suites (ws_id, updated_at DESC);
CREATE INDEX ai_studio_experiments_ws_created_idx
  ON private.ai_studio_experiments (ws_id, created_at DESC);
CREATE INDEX ai_studio_eval_results_experiment_idx
  ON private.ai_studio_evaluation_results (experiment_id, created_at, id);

ALTER TABLE private.ai_studio_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_dataset_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_evaluation_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_studio_evaluation_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  private.ai_studio_datasets,
  private.ai_studio_dataset_items,
  private.ai_studio_evaluation_suites,
  private.ai_studio_experiments,
  private.ai_studio_evaluation_results
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  private.ai_studio_datasets,
  private.ai_studio_dataset_items,
  private.ai_studio_evaluation_suites,
  private.ai_studio_experiments,
  private.ai_studio_evaluation_results
TO service_role;
