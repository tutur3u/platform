BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(7);

INSERT INTO public.users (id, display_name)
VALUES (
  '30000000-0000-4000-8000-000000001100',
  'AI policy search owner'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (id, name, creator_id, personal)
VALUES
  (
    '30000000-0000-4000-8000-000000001101',
    'AI Policy Fixture Alpha',
    '30000000-0000-4000-8000-000000001100',
    FALSE
  ),
  (
    '30000000-0000-4000-8000-000000001102',
    'AI Policy Fixture Beta',
    '30000000-0000-4000-8000-000000001100',
    FALSE
  ),
  (
    '30000000-0000-4000-8000-000000001103',
    'AI Policy Fixture Gamma',
    '30000000-0000-4000-8000-000000001100',
    FALSE
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.workspace_ai_studio_policies (
  ws_id,
  allowed_models,
  api_key_creation_approved,
  monthly_credit_budget
)
VALUES (
  '30000000-0000-4000-8000-000000001102',
  ARRAY['openai/gpt-5'],
  TRUE,
  25
)
ON CONFLICT (ws_id) DO UPDATE
SET
  allowed_models = EXCLUDED.allowed_models,
  api_key_creation_approved = EXCLUDED.api_key_creation_approved,
  monthly_credit_budget = EXCLUDED.monthly_credit_budget;

SELECT ok(
  to_regprocedure(
    'private.search_ai_studio_policy_workspaces(text,integer,integer)'
  ) IS NOT NULL,
  'AI Studio workspace policy search RPC exists'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'private.search_ai_studio_policy_workspaces(text,integer,integer)',
    'execute'
  ),
  'service role can execute workspace policy search'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.search_ai_studio_policy_workspaces(text,integer,integer)',
    'execute'
  ),
  'authenticated clients cannot execute workspace policy search'
);

SELECT results_eq(
  $$
    SELECT ws_id
    FROM private.search_ai_studio_policy_workspaces(
      'AI Policy Fixture Alpha',
      10,
      0
    )
    WHERE ws_id::TEXT LIKE '30000000-%'
  $$,
  $$
    VALUES ('30000000-0000-4000-8000-000000001101'::UUID)
  $$,
  'workspace names are searched server-side'
);

SELECT results_eq(
  $$
    SELECT ws_id
    FROM private.search_ai_studio_policy_workspaces('001102', 10, 0)
  $$,
  $$
    VALUES ('30000000-0000-4000-8000-000000001102'::UUID)
  $$,
  'partial workspace IDs are searchable'
);

SELECT is(
  (
    SELECT allowed_models
    FROM private.search_ai_studio_policy_workspaces('001102', 10, 0)
  ),
  ARRAY['openai/gpt-5']::TEXT[],
  'workspace policy values are merged into search rows'
);

SELECT results_eq(
  $$
    SELECT ws_id
    FROM private.search_ai_studio_policy_workspaces(
      'AI Policy Fixture',
      1,
      1
    )
    WHERE ws_id::TEXT LIKE '30000000-%'
  $$,
  $$
    VALUES ('30000000-0000-4000-8000-000000001102'::UUID)
  $$,
  'offset pages follow deterministic workspace ordering'
);

SELECT * FROM finish();

ROLLBACK;
