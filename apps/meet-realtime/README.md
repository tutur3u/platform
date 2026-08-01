# Tuturuuu Meet realtime

Room signaling for Tuturuuu Meet. Media never flows through this service — it
carries presence, chat, stage and admission state, and relays Cloudflare
Realtime SFU calls on a participant's behalf so the app secret never reaches a
browser.

Room rules live in `@tuturuuu/realtime/meet` (`room.ts`) as a pure reducer, so
both transports below behave identically:

| transport | entry | host |
| --- | --- | --- |
| Cloudflare Worker + Durable Object | `src/worker.ts`, `src/room-do.ts` | `wrangler.jsonc` |
| Bun WebSocket server | `src/index.ts`, `src/server.ts` | `Dockerfile` (blue/green, port 7816) |

One Durable Object per room is the scalable path: the Bun server keeps rooms in
a module-level `Map`, which is only correct for a single replica.

## Configuration

Set by name only — never commit values.

| variable | required | purpose |
| --- | --- | --- |
| `MEET_REALTIME_TOKEN_SECRET` | yes | HMAC secret for join tokens. Must match the value `apps/web` signs with. |
| `CLOUDFLARE_REALTIME_APP_ID` | yes | Cloudflare Realtime SFU app id. Not sensitive. |
| `CLOUDFLARE_REALTIME_APP_SECRET` | yes | Cloudflare Realtime SFU app secret. **Sensitive** — treat as a bearer token. |
| `CLOUDFLARE_REALTIME_API_BASE_URL` | no | Defaults to `https://rtc.live.cloudflare.com/v1`. |

### Local

Create an SFU app under **Cloudflare dashboard → Realtime → SFU**, then write
the values to `apps/meet-realtime/.dev.vars`, which is gitignored:

```bash
CLOUDFLARE_REALTIME_APP_ID=...
CLOUDFLARE_REALTIME_APP_SECRET=...
MEET_REALTIME_TOKEN_SECRET=...
```

Generate a token secret with `openssl rand -hex 32`.

Confirm the credentials work. The check prints only pass/fail and never echoes
the secret, so its output is safe to share:

```bash
bun apps/meet-realtime/src/verify-credentials.ts
```

### Deployed

The Worker has no `package.json` on purpose: `scripts/check-docker-web.js`
requires every workspace manifest to be copied into each Dockerfile deps stage,
so adding one would force edits across unrelated Dockerfiles. Deploy from the
repo root instead:

```bash
bun wrangler secret put CLOUDFLARE_REALTIME_APP_SECRET -c apps/meet-realtime/wrangler.jsonc
```

```bash
bun wrangler deploy -c apps/meet-realtime/wrangler.jsonc
```

Point clients at the Worker with `NEXT_PUBLIC_MEET_REALTIME_URL`.

## Protocol

Clients connect to `/realtime?token=<join token>`. The token is minted by
`apps/web` at `/api/v1/workspaces/[wsId]/meetings/[meetingId]/realtime-token`
and carries the room id, role, scopes and admission mode; the server derives the
room from the token, never from the query string.

See `packages/realtime/src/meet/messages.ts` for the full message contract.
