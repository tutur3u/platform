-- Match client table privileges to the existing authenticated policies.
-- Policies and service_role grants are unchanged.
REVOKE ALL ON TABLE
  public.hive_npc_memories,
  public.hive_npcs,
  public.hive_servers,
  public.hive_workflows,
  public.hive_research_sessions,
  public.workspace_external_project_field_definitions
FROM anon, authenticated;

-- These tables have permissive SELECT policies only.
-- The restrictive account_required_mfa ALL policy grants no operations.
GRANT SELECT ON TABLE public.hive_npc_memories, public.hive_npcs
TO authenticated;

-- ALL policies authorize row operations, not TRUNCATE/REFERENCES/TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.hive_servers,
  public.hive_workflows,
  public.hive_research_sessions,
  public.workspace_external_project_field_definitions
TO authenticated;
