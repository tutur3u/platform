/**
 * Browser media check: proves audio and video actually traverse the Cloudflare
 * Realtime SFU, using the real client modules from `apps/meet`.
 *
 *   set -a && . apps/meet-realtime/.dev.vars && set +a \
 *     && bun apps/meet-realtime/src/media-check.ts
 *
 * Then open http://127.0.0.1:7898/?peer=a and .../?peer=b in two tabs.
 *
 * Tracks are synthesised from a canvas and an oscillator, so no camera or
 * microphone permission is needed and the run is deterministic. The page
 * reports progress in `#result` and mirrors the verdict into document.title so
 * it can be scraped by an automated browser.
 */
import {
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { signMeetRealtimeToken } from '../../../packages/realtime/src/meet/token';
import { createMeetRealtimeServer } from './server';

const ROOM_PORT = 7899;
const PAGE_PORT = 7898;
const WS_ID = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING_ID = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const PEERS: Record<string, { name: string; userId: string }> = {
  a: { name: 'Peer A', userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691' },
  b: { name: 'Peer B', userId: '4b320da6-6c8a-43fe-b1bf-09fbe77303f9' },
};
const SECRET = process.env.MEET_REALTIME_TOKEN_SECRET || 'integration-secret';

function mintToken(peer: keyof typeof PEERS) {
  const { name, userId } = PEERS[peer] as { name: string; userId: string };
  return signMeetRealtimeToken(
    meetRealtimeTokenPayloadSchema.parse({
      admission: 'open',
      displayName: name,
      exp: Math.floor(Date.now() / 1000) + 1800,
      limits: {},
      meetingId: MEETING_ID,
      mode: 'call',
      role: 'host',
      roomId: `${WS_ID}:${MEETING_ID}`,
      scopes: getMeetRealtimeScopesForRole('host'),
      userId,
      wsId: WS_ID,
    }),
    SECRET
  );
}

const HARNESS_ENTRY = new URL('./media-check-client.ts', import.meta.url)
  .pathname;

async function buildClientBundle() {
  const built = await Bun.build({
    entrypoints: [HARNESS_ENTRY],
    minify: false,
    target: 'browser',
  });

  if (!built.success) {
    throw new Error(
      `bundle failed: ${built.logs.map((log) => String(log)).join('\n')}`
    );
  }

  const [output] = built.outputs;
  if (!output) throw new Error('bundle produced no output');
  return output.text();
}

const PAGE = /* html */ `<!doctype html>
<meta charset="utf-8" />
<title>media check: starting</title>
<style>
  body { font: 14px ui-monospace, monospace; margin: 0; padding: 16px; background:#111; color:#eee }
  #result { white-space: pre-wrap; line-height: 1.6 }
  video { width: 240px; border-radius: 8px; background:#000; margin-top: 12px }
  .pass { color:#4ade80 } .fail { color:#f87171 }
</style>
<h1 id="who"></h1>
<div id="result">booting…</div>
<video id="remote" autoplay playsinline muted></video>
<script type="module" src="/bundle.js"></script>
`;

const room = createMeetRealtimeServer({ port: ROOM_PORT });
const bundle = await buildClientBundle();

const page = Bun.serve({
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/bundle.js') {
      return new Response(bundle, {
        headers: { 'Content-Type': 'text/javascript' },
      });
    }

    if (url.pathname === '/token') {
      const peer = url.searchParams.get('peer') === 'b' ? 'b' : 'a';
      return Response.json({
        roomUrl: `ws://127.0.0.1:${ROOM_PORT}/realtime`,
        selfUserId: PEERS[peer]?.userId,
        token: mintToken(peer),
      });
    }

    return new Response(PAGE, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
  port: PAGE_PORT,
});

process.stdout.write(
  `room server  ws://127.0.0.1:${room.port}/realtime\n` +
    `harness      http://127.0.0.1:${page.port}/?peer=a\n` +
    `             http://127.0.0.1:${page.port}/?peer=b\n\n` +
    'Open both, then read #result in each tab.\n'
);
