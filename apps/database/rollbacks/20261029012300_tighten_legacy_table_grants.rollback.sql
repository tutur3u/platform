-- Restore the table grants inherited from the historical defaults.
GRANT ALL ON TABLE
  public.hive_npc_memories,
  public.hive_npcs,
  public.hive_servers,
  public.hive_workflows,
  public.hive_research_sessions,
  public.workspace_external_project_field_definitions
TO anon, authenticated;
