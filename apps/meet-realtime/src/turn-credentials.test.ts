import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateTurnCredentials } from './turn-credentials.ts';

const env = {
  CLOUDFLARE_TURN_KEY_ID: 'meet-key',
  CLOUDFLARE_TURN_API_TOKEN: 'server-only',
};
const payload = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:53?transport=udp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'temporary-user',
      credential: 'temporary-password',
    },
  ],
};

test('returns expiring relay credentials with TLS443 and without blocked ports or permanent secrets', async () => {
  const request = (async (url, init) => {
    assert.equal(
      url,
      'https://rtc.live.cloudflare.com/v1/turn/keys/meet-key/credentials/generate-ice-servers'
    );
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      'Bearer server-only'
    );
    assert.deepEqual(JSON.parse(String(init?.body)), { ttl: 86400 });
    return Response.json(payload, { status: 201 });
  }) as typeof fetch;
  const servers = await generateTurnCredentials(env, request);
  assert.deepEqual(servers[0]?.urls, ['stun:stun.cloudflare.com:3478']);
  assert.deepEqual(servers[1]?.urls, [
    'turns:turn.cloudflare.com:443?transport=tcp',
  ]);
  assert.equal(servers[1]?.credential, 'temporary-password');
  assert.equal(JSON.stringify(servers).includes('server-only'), false);
});

test('fails safely when configuration, provider, or response cannot supply relays', async () => {
  await assert.rejects(
    generateTurnCredentials({}),
    /^Error: turn_not_configured$/
  );
  for (const request of [
    async () => Response.json({ secret: 'never-print' }, { status: 403 }),
    async () =>
      Response.json({
        iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
      }),
    async () => Response.json({ iceServers: [{ urls: null }] }),
    async () => {
      throw new Error('never-print');
    },
  ])
    await assert.rejects(
      generateTurnCredentials(env, request as typeof fetch),
      /^Error: turn_credentials_unavailable$/
    );
});
