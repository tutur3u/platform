-- Rollback for 20261029012300_tighten_legacy_table_grants.sql (SR-828).
--
-- Restores only the authenticated privileges that the forward migration
-- removed. anon and TRUNCATE are intentionally not restored (least privilege),
-- even when this rollback is applied. MAINTAIN, a PostgreSQL 17 privilege, is
-- not restored either.
-- This file never grants anything to anon or PUBLIC. Policies, RLS and
-- service_role grants are unchanged by both directions. Apply manually.

-- Forward kept SELECT only; restore the other authenticated table privileges
-- except TRUNCATE.
GRANT INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON TABLE
  public.hive_npc_memories,
  public.hive_npcs
TO authenticated;

-- Forward kept SELECT, INSERT, UPDATE and DELETE; restore the remainder except
-- TRUNCATE.
GRANT REFERENCES, TRIGGER ON TABLE
  public.hive_servers,
  public.hive_workflows,
  public.hive_research_sessions,
  public.workspace_external_project_field_definitions
TO authenticated;
