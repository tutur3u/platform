import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ADMISSION_TTL_SECONDS,
  issueRoomAdmission,
} from '../../apps/worlds/src/multiplayer/admission.ts';
import {
  createTuturuuuWebE2EConfig,
  FLEET_IDENTITY_ENV_NAMES,
  offlineReplayExecutor,
  resolveFleetEmailFromEnv,
  resolveFleetPasswordFromEnv,
  TUTURUUU_HEADLESS_WEB_OPTIONS,
} from './shared-web-config.ts';
import { createFixtureServer } from './web-fixture-server.mjs';

async function withFixture(run) {
  const email = `fixture-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const server = createFixtureServer({
    E2E_USER_EMAIL: email,
    E2E_SECRET_PASSWORD: password,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    await run({
      get: (path, options) =>
        fetch(`http://127.0.0.1:${server.address().port}${path}`, {
          redirect: 'manual',
          ...options,
        }),
      email,
      password,
      server,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(body) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function sessionCookie(response) {
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /; HttpOnly; SameSite=Lax/u);
  return { headers: { cookie: cookie.split(';')[0] } };
}

async function dispatchFixtureRequest(server, request) {
  const [handler] = server.listeners('request');
  let status;
  let body;
  await handler(request, {
    writeHead(value) {
      status = value;
    },
    end(value) {
      body = value;
    },
  });
  return { status, body };
}

test('resolves fleet test identity strictly from env names without hardcoded defaults', () => {
  assert.equal(resolveFleetEmailFromEnv({}), '');
  assert.equal(resolveFleetPasswordFromEnv({}), '');

  const uuid = '11111111-2222-4333-8444-555555555555';
  const email = `fixture-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  assert.equal(
    resolveFleetEmailFromEnv({ TUTURUUU_FLEET_SMOKE_ID: uuid }),
    `qa-automation+${uuid}@smoke.tuturuuu.com`
  );
  assert.equal(
    resolveFleetEmailFromEnv({
      TUTURUUU_FLEET_SMOKE_ID: 'not-a-uuid',
    }),
    ''
  );
  assert.equal(
    resolveFleetEmailFromEnv({
      TUTURUUU_FLEET_SMOKE_ID: uuid,
      E2E_FLEET_EMAIL: email,
    }),
    email
  );
  assert.equal(
    resolveFleetPasswordFromEnv({
      TUTURUUU_FLEET_SMOKE_PASSWORD: password,
    }),
    password
  );
});

test('shared web config enforces headless Chromium defaults without UA spoofing or bypass headers', () => {
  assert.equal(TUTURUUU_HEADLESS_WEB_OPTIONS.browser, 'chromium');
  assert.equal('userAgent' in TUTURUUU_HEADLESS_WEB_OPTIONS, false);
  assert.equal('headers' in TUTURUUU_HEADLESS_WEB_OPTIONS, false);

  const config = createTuturuuuWebE2EConfig({
    tests: 'apps/web/e2e-agent/**/*.e2e.ts',
    env: { CI: '1' },
  });

  assert.equal(config.projectId, 'tuturuuu-platform');
  assert.equal(config.video, 'off');
  assert.equal(config.trace, 'retain-on-failure');
  assert.equal(config.workers, 1);
  assert.equal(config.retries, 0);
  assert.equal(config.credentials, undefined);
  assert.deepEqual(config.cache, { mode: 'read-only', dir: '.e2e/cache' });

  const email = `fixture-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const withFleet = createTuturuuuWebE2EConfig({
    tests: 'apps/web/e2e-agent/**/*.e2e.ts',
    env: {
      E2E_SECRET_FLEET_EMAIL: email,
      E2E_USER_FLEET_PASSWORD: password,
    },
  });
  assert.equal(withFleet.credentials?.fleet?.username, email);
  assert.equal(typeof withFleet.credentials?.fleet?.password, 'function');
});

test('offline replay executor fails closed on uncached steps without calling any model', async () => {
  const verdict = await offlineReplayExecutor.runStep({
    step: {
      kind: 'act',
      index: 0,
      instruction: 'uncached step',
      params: undefined,
      secrets: [],
    },
  });

  assert.equal(verdict.status, 'failed');
  assert.equal(verdict.errorCode, 'MODEL_UNREACHABLE');
  assert.match(verdict.summary, /--strict-cache/);
});

test('fixture identity names are inherited by the fixture process', () => {
  assert.ok(FLEET_IDENTITY_ENV_NAMES.email.includes('E2E_USER_EMAIL'));
  assert.ok(FLEET_IDENTITY_ENV_NAMES.password.includes('E2E_SECRET_PASSWORD'));
  const email = `fixture-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  assert.equal(resolveFleetEmailFromEnv({ E2E_USER_EMAIL: email }), email);
  assert.equal(
    resolveFleetPasswordFromEnv({ E2E_SECRET_PASSWORD: password }),
    password
  );
});

test('login fixtures check runtime credentials and protect both localized destinations', async () => {
  await withFixture(async ({ get, email, password }) => {
    for (const [locale, heading, passwordLabel, workspace] of [
      ['en', 'Welcome to Tuturuuu', 'Password', 'Personal Workspace'],
      [
        'vi',
        'Chào mừng đến với Tuturuuu',
        'Mật khẩu',
        'Không gian làm việc cá nhân',
      ],
    ]) {
      const login = await get(`/${locale}/login`);
      assert.equal(login.status, 200);
      const html = await login.text();
      assert.ok(html.includes(`<html lang="${locale}">`));
      assert.ok(html.includes(heading));
      assert.ok(html.includes(passwordLabel));
      assert.equal(html.includes(email), false);
      assert.equal(html.includes(password), false);
      const denied = await get(`/${locale}/personal`);
      assert.equal(denied.status, 302);
      assert.equal(denied.headers.get('location'), `/${locale}/login`);
      const invalid = await get(
        '/api/e2e-fixture/sign-in',
        post({ email, password: randomUUID() })
      );
      assert.equal(invalid.status, 401);
      assert.equal(invalid.headers.has('set-cookie'), false);
      const signedIn = await get(
        '/api/e2e-fixture/sign-in',
        post({ email, password })
      );
      assert.equal(signedIn.status, 200);
      const personal = await get(
        `/${locale}/personal`,
        sessionCookie(signedIn)
      );
      assert.equal(personal.status, 200);
      assert.ok((await personal.text()).includes(workspace));
    }
  });
});

const bypassHeaders = {
  'x-e2e-bypass': 'true',
  authorization: 'Bearer forged',
};

test('localized personal pages reject forged sessions and bypass inputs', async () => {
  await withFixture(async ({ get }) => {
    for (const locale of ['en', 'vi']) {
      const personal = `/${locale}/personal`;
      const forgedSession = { cookie: 'ttr_e2e_fixture_session=forged' };
      for (const [path, headers] of [
        [personal, forgedSession],
        [personal, { cookie: 'ttr_e2e_fixture_session=' }],
        [personal, bypassHeaders],
        [`${personal}?bypass=1`, {}],
        [`${personal}?bypass=1`, { ...bypassHeaders, ...forgedSession }],
      ]) {
        const denied = await get(path, { headers });
        assert.equal(denied.status, 302);
        assert.equal(denied.headers.get('location'), `/${locale}/login`);
      }
    }
  });
});

test('fixture rejects a non-loopback socket regardless of forwarded headers', async () => {
  const response = await dispatchFixtureRequest(createFixtureServer({}), {
    method: 'GET',
    url: '/en/login',
    socket: { remoteAddress: '203.0.113.10' },
    headers: { 'x-forwarded-for': '127.0.0.1' },
  });
  assert.deepEqual(response, { status: 403, body: 'Forbidden' });
});

test('Kanban fixture links to a board with cards and the filtered-empty controls', async () => {
  await withFixture(async ({ get }) => {
    const index = await get('/en/personal/tasks/boards');
    assert.equal(index.status, 200);
    assert.match(
      await index.text(),
      /href="\/en\/personal\/tasks\/boards\/default"/u
    );
    const board = await get('/en/personal/tasks/boards/default');
    assert.equal(board.status, 200);
    const html = await board.text();
    for (const label of [
      'Not Started',
      'Active',
      'Done',
      'Search tasks...',
      'No tasks match the current filters',
      'Clear filters',
    ]) {
      assert.ok(html.includes(label), label);
    }
    assert.equal([...html.matchAll(/data-testid="task-card"/gu)].length, 3);
  });
});

test('Meet fixture requires a display name and explicit media readiness before admission', async () => {
  await withFixture(async ({ get }) => {
    const room = await get('/en/r/e2e-guest-room');
    assert.equal(room.status, 200);
    assert.match(await room.text(), /aria-label="Camera preview"/u);
    const url = '/api/e2e-fixture/meet/guest';
    const ready = {
      displayName: 'Meet Guest',
      camera: false,
      microphone: false,
    };
    assert.equal(
      (await get(url, post({ ...ready, displayName: ' ' }))).status,
      400
    );
    assert.equal(
      (await get(url, post({ displayName: ready.displayName }))).status,
      400
    );
    const joined = await get(url, post(ready));
    assert.equal(joined.status, 200);
    assert.deepEqual(await joined.json(), { status: 'joined', ...ready });
  });
});

test('EduFest room rejects invalid admission cookies and bypass inputs', async () => {
  await withFixture(async ({ get }) => {
    const wrongKeyGrant = await issueRoomAdmission(
      { worldId: 'edufest-hall', revision: 'edufest-hall-v1', shard: 0 },
      async () => ({
        id: randomUUID(),
        sessionExpiresAt: Math.floor(Date.now() / 1000) + 60,
      }),
      randomUUID()
    );
    assert.ok(wrongKeyGrant);
    const room = '/api/e2e-fixture/worlds/room';
    for (const [path, headers] of [
      [room, {}],
      [room, { cookie: 'ttr_e2e_hall_admission=' }],
      [room, { cookie: 'ttr_e2e_hall_admission=forged' }],
      [room, { cookie: `ttr_e2e_hall_admission=${wrongKeyGrant}` }],
      [room, bypassHeaders],
      [`${room}?bypass=1`, {}],
    ]) {
      const denied = await get(path, { headers });
      assert.equal(denied.status, 401);
      assert.deepEqual(await denied.json(), { error: 'Admission required' });
    }
  });
});

test('EduFest fixture returns room presence only after guest admission', async () => {
  await withFixture(async ({ get }) => {
    const hall = await get('/worlds');
    assert.equal(hall.status, 200);
    assert.match(await hall.text(), /Hall floor plan/u);
    const readyUrl = '/api/e2e-fixture/worlds/room';
    const admissionUrl = '/api/e2e-fixture/worlds/admission';
    assert.equal((await get(readyUrl)).status, 401);
    assert.equal(
      (await get(admissionUrl, post({ displayName: ' ' }))).status,
      400
    );
    const admitted = await get(
      admissionUrl,
      post({ displayName: 'Hall Guest' })
    );
    assert.equal(admitted.status, 204);
    const ready = await get(readyUrl, sessionCookie(admitted));
    assert.equal(ready.status, 200);
    const frame = await ready.json();
    assert.equal(frame.type, 'ready');
    assert.equal(frame.self.displayName, 'Hall Guest');
    assert.ok(Number.isFinite(frame.self.x) && Number.isFinite(frame.self.z));
    assert.deepEqual(frame.peers, []);
    assert.equal((await get(readyUrl, sessionCookie(admitted))).status, 401);
  });
});

test('EduFest room checks pending guest expiry after verifying the admission', async (t) => {
  const start = Date.parse('2026-11-27T08:00:00Z');
  const expired = start + (ADMISSION_TTL_SECONDS + 1) * 1000;
  let checkingRoom = false;
  let reads = 0;
  t.mock.method(Date, 'now', () =>
    checkingRoom && reads++ > 0 ? expired : start
  );

  await withFixture(async ({ get, server }) => {
    const admitted = await get(
      '/api/e2e-fixture/worlds/admission',
      post({ displayName: 'Hall Guest' })
    );
    assert.equal(admitted.status, 204);
    // The admission is valid at token verification and expires before the guest lookup.
    checkingRoom = true;
    const response = await dispatchFixtureRequest(server, {
      method: 'GET',
      url: '/api/e2e-fixture/worlds/room',
      socket: { remoteAddress: '127.0.0.1' },
      ...sessionCookie(admitted),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(JSON.parse(response.body), {
      error: 'Admission required',
    });
    assert.equal(reads, 2);
    checkingRoom = false;
  });
});

test('fixture passes the room admission cookie directly to the verifier', () => {
  const source = readFileSync(
    new URL('./web-fixture-server.mjs', import.meta.url),
    'utf8'
  );
  assert.match(
    source,
    /const\s+admission\s*=\s*await\s+verifyRoomAdmission\(\s*getCookie\(req,\s*'ttr_e2e_hall_admission'\),\s*hallKey\s*\)/u
  );
});
