# Parley

Private multiplayer scenario training built on `@tuturuuu/meet-core`.

- Tuturuuu sign-in; verified internal accounts and Infrastructure-managed access.
- Database-backed published scenarios and immutable session snapshots.
- Shared Meet calls, Mira voice/chat roleplay, and playback-driven avatars.
- Private source documents and facilitator observations.

Run `bun dev` in this directory after configuring the environment. Build with
`bun run build`. Cloudflare configuration owns `parley.tuturuuu.com`; production
requires the additive schema migration and central auth registration first.
See `apps/docs/platform/apps/parley.mdx` for the release and privacy contract.
