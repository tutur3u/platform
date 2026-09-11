import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { Miniflare } from 'miniflare';

const secret = 'isolated-test-session-not-for-production';
const workerDir =
  process.env.COLAB_TEST_WORKER_DIR ??
  '/private/tmp/colab-rise-learning-worker';
let proofs = 0;
const mf = new Miniflare({
  modules: true,
  scriptPath: `${workerDir}/worker.js`,
  modulesRoot: workerDir,
  compatibilityDate: '2026-06-20',
  compatibilityFlags: ['nodejs_compat'],
  durableObjects: { ROOMS: { className: 'ColabRoom', useSQLite: true } },
  bindings: {
    COLAB_SESSION_SECRET: secret,
    APP_ORIGIN: 'http://localhost',
    AUTH_ORIGIN: 'https://tuturuuu.com',
    COLAB_REQUIRE_SPONSORSHIP: 'true',
  },
  outboundService: async (request) => {
    try {
      assert.equal(request.url, 'https://ai.tuturuuu.com/v1/colab/responses');
      assert.equal(request.headers.has('authorization'), false);
      const raw = await request.text();
      const body = JSON.parse(raw);
      const token = request.headers.get('x-colab-grant');
      assert.match(token, /^[a-f0-9]{64}$/);
      const digest = createHash('sha256').update(raw).digest('hex');
      const verify = (checksum) =>
        mf.dispatchFetch('http://localhost/api/sponsorship/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            digest: checksum,
            roomId: body.sponsorship.workshopId,
          }),
        });
      assert.equal((await verify('0'.repeat(64))).status, 403);
      const results = await Promise.all([verify(digest), verify(digest)]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 403]);
      assert.equal((await verify(digest)).status, 403);
      proofs++;
      return Response.json(
        {
          id: `request-${proofs}`,
          choices: [
            {
              message: {
                content: JSON.stringify({
                  skills: [
                    {
                      name: 'rise-guide',
                      content:
                        '# RISE guide\n\nRead the approved event brief before drafting. Verify facts and obtain human approval before publishing.',
                    },
                  ],
                }),
              },
            },
          ],
          tuturuuu: { run_id: `run-${proofs}`, billing: { billedCredits: 1 } },
        },
        {
          headers: {
            'x-colab-sponsor-workspace': '00000000-0000-0000-0000-000000000000',
          },
        }
      );
    } catch (error) {
      console.error('Sponsorship fixture failed', error);
      throw error;
    }
  },
});
try {
  const payload = Buffer.from(
    JSON.stringify({
      id: 'host',
      email: 'host@tuturuuu.com',
      name: 'Host',
      expires: Date.now() + 60000,
    })
  ).toString('base64');
  const cookie = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64')}`;
  const call = (path, body) =>
    mf.dispatchFetch(`http://localhost/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
        Cookie: `colab_session=${cookie}`,
      },
      body: JSON.stringify(body),
    });
  const created = await call('/rooms', {
    title: 'Automatic sponsorship',
    startsAt: null,
    endsAt: null,
    maxUsers: 10,
    teamCount: 1,
  });
  assert.equal(created.status, 201, await created.clone().text());
  const room = await created.json();
  assert.equal(
    (
      await call(`/rooms/${room.id}/action`, {
        action: 'prompt',
        prompt:
          'You are a careful RISE editor. Read sources and ask before publishing.',
        revision: 0,
      })
    ).status,
    200
  );
  const result = await call(`/rooms/${room.id}/ai`, {
    action: 'compile',
    multiple: true,
  });
  assert.equal(result.status, 200, await result.clone().text());
  const view = await result.json();
  assert.ok(proofs > 0);
  assert.equal(view.sponsorship.credits, proofs);
  assert.ok(view.teams[0].skills.length > 0);
  console.log(
    'PASS: keyless sponsored skill generation, persisted one-use grants, tamper rejection, concurrent replay protection, confirmed credit receipts. Provider and AI Studio settlement mocked.'
  );
} finally {
  await mf.dispose();
}
