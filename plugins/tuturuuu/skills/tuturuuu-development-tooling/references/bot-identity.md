# Local agent GitHub identity

The [tuturuuu-bot runbook](../../../../../apps/docs/build/devops/tuturuuu-bot.mdx)
owns provisioning, permissions, threat model and revocation. The App is only for
local agent task-branch pushes and PR creation. Release automation keeps its own
PAT/job identity. No workflow currently mints this App token and no Actions App
private-key secret should exist.

The owner imports the key into macOS Keychain without `-A`/`-T`, removes trusted
application access and never chooses Always Allow. Same-user processes can still
prompt; a separate-user or biometric signing broker is the recommended future
boundary. Never inspect or request the key in an agent session.

Local writers use `scripts/tuturuuu-bot-token.js --permissions ... -- gh|git ...`.
Only contents/pull_requests scope inputs, `gh pr create` and exactly one
`git push origin HEAD:<task-branch>` refspec are permitted. Never add approval,
force/deletion/tag push options, raw-token output or file/env key inputs.
Credentials stay in process memory and the child environment; normal cleanup
revokes but crashes may require owner suspension/expiry.

The bot never approves PRs or bypasses rules. The release approval guard pins the
exact release identities and rejects arbitrary Bot authors and agent-bot commits.
After the classifier lane merges, it owns a default-branch-code check rejecting
agent-bot approvals. Sensitive paths require human CODEOWNERS review.

Any future Actions use needs separate owner approval and a dedicated environment
with main/production-only deployment-branch policy before storing its key there.
Every minting job must declare that environment; repo secrets are forbidden.
Generate the inventory on demand; do not add global snapshot equality gates for
unrelated workflows. Run focused tests through the resource queue, and preserve
independent review and exact-head CI before integration.
