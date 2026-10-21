# CLI employee recovery authorization

Keep CLI employee admission confined to the operation-scoped `cli-recovery`
route. Verify the unchanged platform CLI access token and CLI origin, freshly
check required MFA, and reuse current employee administrator checks with actor
bound only to verified subject. Require the canonical valid signed email to match
the fresh confirmed Auth email for CLI recovery reads and writes, even across
internal address changes. Preserve ordinary Infra authorization behavior.
Inspect the owned existing operation before any claim; resume requires an exact
fresh `retry_ready` version-3 tuple, path/key binding and retained audit identity.
Reuse explicit adjudication/readback and journal phase authorization through DI;
never substitute an authorized literal or actor from payload. Clients must make
one explicit dispatch without automatic 401 refresh/replay. Reauthorize after all
awaited resume work before disclosure; denial can follow a committed mutation,
so withhold the result, retain original evidence and guide inspection without
replay. Typed clients accept only 200 adjudication readback, 201 created, 202
pending and 409 conflict with matching payloads. See the
[CLI recovery runbook](../../../../../apps/docs/build/development-tools/employee-cli-recovery.mdx)
and the focused CLI recovery authorization/boundary/client tests. Independent
review and exact Web build CI precede release-owner runtime acceptance.
