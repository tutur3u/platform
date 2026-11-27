const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const test = require('node:test');

const {
  getRealtimeChannelsPortlessEnv,
  getRealtimeChannelsReadinessUrl,
} = require('./e2e-realtime-channels-fixture');
const {
  parseJoinTicket,
  parsePublishTicket,
  verifyRealtimePayload,
} = require('./e2e-realtime-channels-server');

function signTicket(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

test('realtime channels fixture portless env targets channels.tuturuuu on DOCKER_WEB_PROXY_HOST_PORT', () => {
  const env = getRealtimeChannelsPortlessEnv({
    DOCKER_WEB_PROXY_HOST_PORT: '7803',
    E2E_REALTIME_CHANNELS_PORT: '7829',
  });
  assert.equal(env.PORTLESS_ROUTE_NAME, 'channels.tuturuuu');
  assert.equal(env.DOCKER_WEB_FRONTEND, 'next');
  assert.equal(env.DOCKER_WEB_PROXY_HOST_PORT, '7829');
  assert.equal(
    getRealtimeChannelsReadinessUrl({ E2E_REALTIME_CHANNELS_PORT: '7829' }),
    'http://127.0.0.1:7829/health'
  );
});

test('parseJoinTicket accepts valid HMAC-signed join tickets and rejects tampered, expired, or wrong-kind tickets', () => {
  const secret = 'test-e2e-realtime-secret';
  const nowSec = Math.floor(Date.now() / 1000);
  const validPayload = {
    aud: 'tuturuuu.channels',
    kind: 'join',
    topic: 'board-realtime-board-1',
    userId: '00000000-0000-4000-8000-000000000001',
    role: 'editor',
    exp: nowSec + 60,
  };

  const token = signTicket(validPayload, secret);
  assert.deepEqual(verifyRealtimePayload(token, secret), validPayload);
  assert.deepEqual(parseJoinTicket(token, secret), validPayload);

  assert.equal(parseJoinTicket(token, 'wrong-secret'), null);
  assert.equal(
    parseJoinTicket(
      signTicket({ ...validPayload, exp: nowSec - 10 }, secret),
      secret
    ),
    null
  );
  assert.equal(
    parseJoinTicket(
      signTicket({ ...validPayload, kind: 'publish' }, secret),
      secret
    ),
    null
  );
  assert.equal(
    parseJoinTicket(
      signTicket({ ...validPayload, aud: 'wrong.aud' }, secret),
      secret
    ),
    null
  );

  const publishPayload = { ...validPayload, kind: 'publish' };
  assert.deepEqual(
    parsePublishTicket(signTicket(publishPayload, secret), secret),
    publishPayload
  );
  assert.equal(
    parsePublishTicket(
      signTicket({ ...publishPayload, role: 'viewer' }, secret),
      secret
    ),
    null
  );
  assert.equal(parsePublishTicket(token, secret), null);
});
