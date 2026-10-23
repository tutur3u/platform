# GitHub automation identity

The [tuturuuu-bot runbook](../../../../../apps/docs/build/devops/tuturuuu-bot.mdx)
owns manifest permissions, owner-only provisioning, migration inventory, local
agent usage and revocation. Never request or inspect the App private key in an
agent session. Store it through owner-controlled GitHub/Keychain interfaces.

Mint workflow tokens only on trusted main/production refs with explicit
`permission-*` inputs and a fixed platform repository selection. Preserve each
consumer's existing fallback while the App ID variable is empty. Configured but
broken credentials must fail closed. Keep permissions, triggers and action pins
intact. Fork-visible jobs and jobs executing untrusted checkout/code cannot mint.

Local writers use `scripts/tuturuuu-bot-token.js --permissions ... -- gh|git ...`.
The token goes to the trusted child environment; never add raw-token output,
file/env private-key inputs or persistent Git/gh authentication configuration.
The wrapper is not a sandbox against same-user tools, hooks or hostile children.
Normal cleanup revokes; crashes require expiry or owner suspension/revocation.

The bot never approves PRs or bypasses repository rules. PR author identity comes
from the token used at creation, independent of commit coauthor trailers.
Protected branch synchronization remains a separate owner-authorized workflow.

Run focused token/workflow tests and regenerate the runbook inventory after
scope changes. Independent credential/security review and exact-head CI remain
integration gates; mocked tests do not prove hosted App acceptance.
