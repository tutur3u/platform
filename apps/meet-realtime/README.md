# Tuturuuu Meet realtime

Room signaling for Tuturuuu Meet. Media never flows through this service — it
carries presence, chat, stage and admission state, and relays Cloudflare
Realtime SFU calls on a participant's behalf so the app secret never reaches a
browser.

Production uses a Cloudflare Worker and one Durable Object per meeting room.
Presence, chat, admission and SFU signaling run entirely on Cloudflare; no
internal machine, Docker server or Cloudflare Tunnel is required. The Bun
transport remains only for local protocol development and synthetic tests.

Canonical WebSocket endpoint: `wss://meet-realtime.tuturuuu.com/realtime`.
The frontend runs on the separate `tuturuuu-meet` Worker at `meet.tuturuuu.com`.

## Configuration

Set by name only — never commit values.

| variable | required | purpose |
| --- | --- | --- |
| `MEET_REALTIME_TOKEN_SECRET` | yes | HMAC secret for join tokens. Must match the Meet frontend Worker and the platform's compatibility token API. |
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

Clients default to the canonical Worker endpoint. `MEET_REALTIME_URL` may
override it for verification. Old `wss://meet.tuturuuu.com/realtime` settings
resolve to the Cloudflare endpoint automatically.

Run the protocol check directly against a Worker (a fresh synthetic room is
created per run, without database meeting writes):

```bash
MEET_CHECK_REALTIME_URL=wss://meet-realtime.tuturuuu.com/realtime \
  bun --env-file=apps/meet-realtime/.dev.vars apps/meet-realtime/src/integration-check.ts
```

The same variable makes `media-check.ts --call-controller` use the Worker for
signaling while localhost serves only the test page. Without it, the harness
starts the local Bun test transport. For normal local app development use
`bun wrangler dev -c apps/meet-realtime/wrangler.jsonc` (port 8786).

`.github/workflows/meet-cloudflare.yaml` builds and validates both Workers,
then deploys realtime before the frontend on the production branch. Runtime
secrets remain in Cloudflare. A successful health request alone does not verify
SFU access: the protocol check must also create a real SFU session.

## Protocol

Clients connect to `/realtime?token=<join token>`. The Meet frontend Worker mints
the initial token when rendering the invite route and refreshes it through
`/api/meet-call/[meetingId]/token`. Both paths recheck call access. Signed-in
external guests can join company-created meetings through the lobby without
receiving workspace membership or archive access.

The token carries the room id, role, scopes and admission mode; the realtime
server derives the room from the token, never from the query string. The platform
keeps its workspace-scoped compatibility token API, but Meet reconnects use the
call-specific endpoint so external guests retain access.

See `packages/realtime/src/meet/messages.ts` for the full message contract.
