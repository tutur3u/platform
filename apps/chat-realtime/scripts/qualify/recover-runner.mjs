// Runs the Cron Control revocation processor once under Bun, which resolves
// its extensionless TypeScript imports. Reads its context from stdin and
// prints only the processor result.
import { recoverChatRevocations } from '../../../cron-control/src/processors/chat-realtime-revocations.ts';

const input = JSON.parse(await new Response(Bun.stdin.stream()).text());
const recoveryHost = new URL(input.recoveryUrl).hostname;
const result = await recoverChatRevocations({
  deadline: Date.now() + 30_000,
  env: {
    SUPABASE_SECRET_KEY: input.secretKey,
    SUPABASE_URL: input.recoveryUrl,
  },
  fetch: (resource, init) => {
    const url = new URL(resource instanceof Request ? resource.url : resource);
    // The processor requires an HTTPS database origin; route that fixed host
    // to the loopback PostgREST of the isolated stack.
    if (url.hostname === recoveryHost) {
      return fetch(`${input.supabaseUrl}${url.pathname}${url.search}`, init);
    }
    return fetch(url, init);
  },
  fence: async () => true,
  now: Date.now,
  pending: {
    add: async () => undefined,
    fail: async () => [],
    list: async () => [],
    quarantined: async () => [],
    settle: async () => undefined,
  },
  target: { secret: input.realtimeSecret, url: new URL(input.publishUrl) },
  userAgent: 'Tuturuuu-Chat-Qualification/1.0',
});
const detail = result?.detail ?? {};
console.log(
  JSON.stringify({
    detail: {
      capped: Number(detail.capped) || 0,
      delivered: Number(detail.delivered) || 0,
      failed: Number(detail.failed) || 0,
    },
    outcome: typeof result?.outcome === 'string' ? result.outcome : 'unknown',
  })
);
