-- PUBLIC EXECUTE is inherited by anon; revoke both sources of access.
REVOKE EXECUTE ON FUNCTION public.get_workspace_storage_limit(uuid) FROM PUBLIC, anon;
-- tuturuuu: reviewed(function-grant): public.get_workspace_storage_limit(uuid) review=existing-authenticated-storage-contract
GRANT EXECUTE ON FUNCTION public.get_workspace_storage_limit(uuid) TO authenticated, service_role;
