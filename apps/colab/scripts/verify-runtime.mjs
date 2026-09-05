import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { Miniflare } from 'miniflare';

const secret = 'local-test-only-secret-not-for-production';
const mf = new Miniflare({
  port: 8795,
  workers: [
    {
      name: 'colab',
      modules: true,
      scriptPath: '/private/tmp/colab-worker/worker.js',
      modulesRoot: '/private/tmp/colab-worker',
      compatibilityDate: '2026-06-20',
      compatibilityFlags: ['nodejs_compat'],
      durableObjects: { ROOMS: { className: 'ColabRoom', useSQLite: true } },
      bindings: {
        COLAB_SESSION_SECRET: secret,
        APP_ORIGIN: 'http://127.0.0.1:8795',
        AUTH_ORIGIN: 'https://tuturuuu.com',
      },
      serviceBindings: {
        ASSETS: async (request) => {
          const pathname = new URL(request.url).pathname;
          const asset =
            pathname.startsWith('/assets/') && !pathname.includes('..')
              ? `./dist${pathname}`
              : './dist/index.html';
          return new Response(await readFile(asset), {
            headers: {
              'Content-Type': asset.endsWith('.js')
                ? 'text/javascript'
                : asset.endsWith('.css')
                  ? 'text/css'
                  : 'text/html',
            },
          });
        },
      },
    },
  ],
});
const token = (id, email) => {
  const payload = Buffer.from(
    JSON.stringify({ id, email, name: id, expires: Date.now() + 3600000 })
  ).toString('base64');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64')}`;
};
const owner = token('host', 'host@tuturuuu.com'),
  alice = token('alice', 'alice@example.com'),
  bob = token('bob', 'bob@example.com');
let browser;
try {
  await mf.ready;
  const request = (path, who, body, origin = 'http://127.0.0.1:8795') =>
    mf.dispatchFetch(`http://127.0.0.1:8795/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(who ? { Cookie: `colab_session=${who}` } : {}),
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const create = {
    title: 'Runtime verification',
    startsAt: Date.now() - 1000,
    endsAt: Date.now() + 3600000,
    maxUsers: 4,
    teamCount: 2,
  };
  const denied = await request('/rooms', alice, create);
  assert.equal(denied.status, 403, await denied.text());
  assert.equal(
    (await request('/rooms', owner, create, 'https://evil.example')).status,
    403
  );
  let response = await request('/rooms', owner, create);
  assert.equal(response.status, 201, await response.clone().text());
  const room = await response.json();
  const path = `/rooms/${room.id}`;
  assert.equal((await request(path, bob)).status, 403);
  for (const email of ['alice@example.com', 'bob@example.com'])
    assert.equal(
      (await request(`${path}/action`, owner, { action: 'invite', email }))
        .status,
      200
    );
  for (const [who, teamId] of [
    [alice, 'team-1'],
    [bob, 'team-2'],
  ])
    assert.equal((await request(`${path}/join`, who, { teamId })).status, 200);
  const aliceView = await (await request(path, alice)).json();
  assert.equal(aliceView.teams.length, 1);
  assert.equal(aliceView.invites, undefined);
  const wsResponse = await mf.dispatchFetch(
    `http://127.0.0.1:8795/api${path}/live`,
    {
      headers: {
        Cookie: `colab_session=${alice}`,
        Origin: 'http://127.0.0.1:8795',
        Upgrade: 'websocket',
      },
    }
  );
  assert.equal(
    wsResponse.status,
    101,
    wsResponse.status === 101 ? '' : await wsResponse.text()
  );
  const ws = wsResponse.webSocket;
  ws.accept();
  const events = [];
  ws.addEventListener('message', (e) => {
    if (e.data !== 'pong') events.push(JSON.parse(e.data));
  });
  await request(`${path}/action`, owner, { action: 'showcase', enabled: true });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(events.at(-1).teams.length, 2);
  const concurrent = await Promise.all([
    request(`${path}/action`, owner, {
      action: 'prompt',
      prompt: 'First concurrent draft',
      revision: 0,
    }),
    request(`${path}/action`, alice, {
      action: 'prompt',
      prompt: 'Second concurrent draft',
      revision: 0,
    }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  response = await request(`${path}/password`, owner, { minutes: 60 });
  const pass = await response.json();
  assert.equal(response.status, 200);
  response = await request(`${path}/join`, null, {
    name: 'Guest',
    teamId: 'team-2',
    password: pass.password,
  });
  assert.equal(response.status, 200);
  const guestCookie = response.headers
    .get('set-cookie')
    .split(';')[0]
    .slice('colab_session='.length);
  await request(`${path}/password`, owner, { minutes: 60 });
  assert.equal((await request(path, guestCookie)).status, 403);
  await request(`${path}/action`, owner, { action: 'mode', mode: 'readonly' });
  assert.equal(
    (
      await request(`${path}/action`, alice, {
        action: 'prompt',
        prompt: 'Forbidden',
        revision: 1,
      })
    ).status,
    400
  );
  const privateResult = await request(`${path}/action`, owner, {
    action: 'mode',
    mode: 'private',
  });
  assert.equal(privateResult.status, 200, await privateResult.clone().text());
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(events.at(-1).type, 'access_revoked');
  ws.close();
  assert.equal((await request(path, alice)).status, 403);
  await request(`${path}/action`, owner, { action: 'mode', mode: 'open' });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:8795/');
  await page
    .getByRole('heading', { name: 'Small prompts. Shared breakthroughs.' })
    .waitFor();
  await page.getByRole('button', { name: 'Add a little clarity' }).click();
  await page.getByText('Ready for your review', { exact: true }).waitFor();
  await page.goto('http://127.0.0.1:8795/auth/callback?state=expired');
  await page
    .getByRole('heading', { name: 'Let’s reconnect your account.' })
    .waitFor();
  await page.getByRole('button', { name: 'Continue exploring' }).click();
  await page.screenshot({
    path: '/private/tmp/colab-desktop.png',
    fullPage: true,
  });
  await page.selectOption('select[aria-label="Language"]', 'vi');
  await page
    .getByRole('heading', { name: 'Prompt nhỏ. Tiến bộ cùng nhau.' })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '/private/tmp/colab-mobile.png',
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    'mobile horizontal overflow'
  );
  await page
    .context()
    .addCookies([
      { name: 'colab_session', value: owner, domain: '127.0.0.1', path: '/' },
    ]);
  await page.goto(`http://127.0.0.1:8795/?room=${room.id}`);
  await page.getByRole('heading', { name: 'Runtime verification' }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({
    path: '/private/tmp/colab-workshop.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: runtime auth, CSRF, invitations, team isolation, showcase broadcast, concurrent edits, guest rotation, read-only, private revocation, desktop/mobile and Vietnamese UI.'
  );
} finally {
  await browser?.close();
  await mf.dispose();
}
