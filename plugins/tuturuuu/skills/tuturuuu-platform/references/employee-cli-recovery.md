# CLI employee recovery authorization

Keep CLI employee admission confined to the operation-scoped `cli-recovery`
route. Verify the unchanged platform CLI access token and CLI origin, freshly
check required MFA, and reuse current employee administrator checks with actor
bound only to verified subject. Preserve ordinary Infra audience behavior.
Inspect the owned existing operation before any claim; resume requires an exact
fresh `retry_ready` version-3 tuple, path/key binding and retained audit identity.
Reuse explicit adjudication/readback and journal phase authorization through DI;
never substitute an authorized literal or actor from payload. Clients must make
one explicit dispatch without automatic 401 refresh/replay. See the
[CLI recovery runbook](../../../../../apps/docs/build/development-tools/employee-cli-recovery.mdx)
and the focused CLI recovery authorization/boundary/client tests. Independent
review and exact Web build CI precede release-owner runtime acceptance.
