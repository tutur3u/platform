REVOKE ALL ON FUNCTION private.employee_creation_runtime_ready(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.employee_creation_runtime_ready(uuid) TO service_role;
