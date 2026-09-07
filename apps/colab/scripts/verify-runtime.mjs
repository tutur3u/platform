import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { Miniflare } from 'miniflare';
import { verifyDirectory } from './verify-directory.mjs';
import { verifyShowcase } from './verify-showcase.mjs';

const workerDir =
  process.env.COLAB_TEST_WORKER_DIR ?? '/private/tmp/colab-worker';
const secret = 'local-test-only-secret-not-for-production';
let centralStatus = 200;
let centralChecks = 0;
const mf = new Miniflare({
  port: 8795,
  workers: [
    {
      name: 'colab',
      modules: true,
      scriptPath: `${workerDir}/worker.js`,
      modulesRoot: workerDir,
      compatibilityDate: '2026-06-20',
      compatibilityFlags: ['nodejs_compat'],
      durableObjects: { ROOMS: { className: 'ColabRoom', useSQLite: true } },
      bindings: {
        COLAB_SESSION_SECRET: secret,
        APP_ORIGIN: 'http://127.0.0.1:8795',
        AUTH_ORIGIN: 'https://tuturuuu.com',
      },
      outboundService: async (request) => {
        if (new URL(request.url).pathname === '/api/v1/users/me/profile') {
          assert.match(
            request.headers.get('cookie') ?? '',
            /auth-token=rotated/
          );
          return Response.json({
            id: 'host',
            display_name: 'host',
            avatar_url: null,
          });
        }
        if (new URL(request.url).pathname !== '/api/auth/me')
          return new Response(null, { status: 401 });
        centralChecks++;
        assert.match(
          request.headers.get('cookie') ?? '',
          /sb-project-auth-token/
        );
        assert.ok(!request.headers.get('cookie').includes('colab_session'));
        return Response.json(
          {
            user: {
              id: 'host',
              email: 'host@tuturuuu.com',
              email_confirmed_at: '2026-01-01',
              user_metadata: { full_name: 'host' },
            },
          },
          {
            status: centralStatus,
            headers:
              centralStatus === 200
                ? {
                    'Set-Cookie':
                      'sb-project-auth-token=rotated; Path=/; HttpOnly; SameSite=Lax',
                  }
                : {},
          }
        );
      },
      serviceBindings: {
        AI: 'mock-ai',
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
    {
      name: 'mock-ai',
      modules: true,
      scriptPath: './scripts/mock-ai-worker.mjs',
      compatibilityDate: '2026-06-20',
    },
  ],
});
const token = (id, email, expires = Date.now() + 3600000) => {
  const payload = Buffer.from(
    JSON.stringify({ id, email, name: id, expires })
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
  assert.equal(aliceView.teams.length, 2);
  await request(`${path}/action`, owner, {
    action: 'showcase',
    enabled: false,
  });
  assert.equal((await (await request(path, alice)).json()).teams.length, 1);
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
  await page.route('https://tuturuuu.com/api/v1/auth/accounts', (route) =>
    route.fulfill({
      headers: {
        'Access-Control-Allow-Origin': 'http://127.0.0.1:8795',
        'Access-Control-Allow-Credentials': 'true',
      },
      json: {
        accounts: [
          {
            id: 'owner',
            email: 'owner@tuturuuu.com',
            metadata: { displayName: 'Owner' },
          },
          {
            id: 'other',
            email: 'other@example.com',
            metadata: { displayName: 'Other' },
          },
        ],
        activeAccountId: 'owner',
      },
    })
  );
  const rootResponse = await mf.dispatchFetch('http://127.0.0.1:8795/', {
    redirect: 'manual',
  });
  assert.equal(rootResponse.status, 302);
  assert.match(rootResponse.headers.get('location'), /\/auth\/login/);
  for (const destination of ['/join', '/host', '/guide']) {
    const response = await mf.dispatchFetch(
      `http://127.0.0.1:8795${destination}`,
      { redirect: 'manual' }
    );
    assert.equal(response.status, 302);
    assert.equal(
      new URL(response.headers.get('location')).searchParams.get('returnTo'),
      destination
    );
    const login = await mf.dispatchFetch(
      `http://127.0.0.1:8795/auth/login?returnTo=${encodeURIComponent(destination)}`,
      { redirect: 'manual' }
    );
    assert.match(
      login.headers.get('set-cookie'),
      new RegExp(`colab_return=${encodeURIComponent(destination)}`)
    );
  }
  const renewalHeaders = {
    Cookie: `colab_session=${token('host', 'host@tuturuuu.com', Date.now() - 1)}; sb-project-auth-token=fixture`,
  };
  const resumed = await mf.dispatchFetch('http://127.0.0.1:8795/guide?host=1', {
    headers: renewalHeaders,
    redirect: 'manual',
  });
  assert.equal(
    resumed.status,
    200,
    'expired app sessions resume without a login redirect'
  );
  assert.match(resumed.headers.get('set-cookie'), /colab_session=/);
  centralStatus = 503;
  const unavailable = await mf.dispatchFetch(
    'http://127.0.0.1:8795/api/session',
    { headers: renewalHeaders }
  );
  assert.equal(unavailable.status, 503);
  assert.equal(
    unavailable.headers.get('set-cookie'),
    null,
    'outages must not erase credentials'
  );
  centralStatus = 200;
  const guestDocument = await mf.dispatchFetch(
    `http://127.0.0.1:8795/?room=${room.id}`
  );
  assert.equal(guestDocument.status, 200);
  await page
    .context()
    .addCookies([
      { name: 'colab_session', value: owner, domain: '127.0.0.1', path: '/' },
    ]);
  let notificationRead = false;
  await page.route('**/api/v1/notifications**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'PATCH') {
      notificationRead = JSON.parse(route.request().postData()).read ?? true;
      return route.fulfill({ json: { success: true } });
    }
    if (url.pathname.endsWith('unread-count'))
      return route.fulfill({ json: { count: notificationRead ? 0 : 1 } });
    const show =
      url.searchParams.get('readOnly') === 'true'
        ? notificationRead
        : !notificationRead;
    return route.fulfill({
      json: {
        notifications: show
          ? [
              {
                id: '00000000-0000-4000-8000-000000000001',
                user_id: 'owner',
                ws_id: null,
                type: 'system_announcement',
                title: 'Workshop notification fixture',
                description: 'A controlled notification for this test.',
                data: {},
                entity_type: null,
                entity_id: null,
                read_at: notificationRead ? new Date().toISOString() : null,
                created_at: new Date().toISOString(),
                created_by: null,
                actor: null,
              },
            ]
          : [],
        count: show ? 1 : 0,
        limit: 15,
        offset: 0,
      },
    });
  });
  await page.clock.install();
  await page.goto('http://127.0.0.1:8795/');
  await page.getByRole('heading', { name: 'Workshops', exact: true }).waitFor();
  assert.equal(await page.locator('.colab-toolbar').count(), 0);
  assert.match(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
    /Noto Sans/
  );
  await page.evaluate(() => {
    window.__colabSidebar = document.querySelector('aside');
    window.__colabDocumentStart = performance.timeOrigin;
  });
  const nav = (name) =>
    page.getByRole('navigation').getByRole('link', { name, exact: true });
  const assertStableShell = async () => {
    assert.equal(
      await page.evaluate(
        () =>
          window.__colabSidebar === document.querySelector('aside') &&
          window.__colabDocumentStart === performance.timeOrigin
      ),
      true,
      'navigation must preserve the document and sidebar'
    );
  };
  await nav('Join a room').click();
  const joinDialog = page.getByRole('dialog', {
    name: 'Join a room',
    exact: true,
  });
  await joinDialog
    .getByRole('textbox', { name: 'Room link or ID' })
    .fill('invalid');
  await joinDialog
    .getByRole('button', { name: 'Join a room', exact: true })
    .click();
  await joinDialog.getByRole('alert').waitFor();
  await page.keyboard.press('Escape');
  await joinDialog.waitFor({ state: 'hidden' });
  await assertStableShell();
  await nav('Host a workshop').click();
  const hostDialog = page.getByRole('dialog', {
    name: 'Host a workshop',
    exact: true,
  });
  await hostDialog
    .locator('input[name=title]')
    .fill('Keep this workshop draft');
  await page.keyboard.press('Escape');
  await hostDialog.waitFor({ state: 'hidden' });
  await nav('Join a room').click();
  await joinDialog.waitFor();
  await page.keyboard.press('Escape');
  await joinDialog.waitFor({ state: 'hidden' });
  await nav('Host a workshop').click();
  assert.equal(
    await hostDialog.locator('input[name=title]').inputValue(),
    'Keep this workshop draft'
  );
  await page.context().addCookies([
    {
      name: 'colab_session',
      value: token('host', 'host@tuturuuu.com', Date.now() + 60_000),
      domain: '127.0.0.1',
      path: '/',
    },
    {
      name: 'sb-project-auth-token',
      value: 'central-fixture',
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
  const renewResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/session')
  );
  await page.clock.fastForward(61_000);
  assert.equal((await renewResponse).status(), 200);
  assert.ok(centralChecks > 0);
  assert.equal(
    await hostDialog.locator('input[name=title]').inputValue(),
    'Keep this workshop draft'
  );
  await assertStableShell();
  const browserCookies = await page.context().cookies();
  assert.equal(
    browserCookies.find((cookie) => cookie.name === 'sb-project-auth-token')
      ?.value,
    'rotated'
  );
  await page.keyboard.press('Escape');
  await hostDialog.waitFor({ state: 'hidden' });
  await nav('Practice guide').click();
  await page.getByRole('button', { name: 'Add a little clarity' }).click();
  await page.getByText('Ready for your review', { exact: true }).waitFor();
  await nav('Join a room').click();
  await joinDialog.waitFor();
  await page.goBack();
  await joinDialog.waitFor({ state: 'hidden' });
  await page.getByText('Ready for your review', { exact: true }).waitFor();
  await page.goForward();
  await joinDialog.waitFor();
  await page.keyboard.press('Escape');
  await joinDialog.waitFor({ state: 'hidden' });
  await assertStableShell();
  await nav('Workshops').click();
  await page.getByRole('heading', { name: 'Workshops', exact: true }).waitFor();
  await assertStableShell();
  await page
    .getByRole('button', { name: 'Notifications', exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByText('Workshop notification fixture', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Mark as read', exact: true }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page
    .getByText('Workshop notification fixture', { exact: true })
    .waitFor();
  assert.equal(notificationRead, true);
  await page.keyboard.press('Escape');
  const openAccount = async () => {
    const trigger = page
      .getByRole('button', { name: 'Account and preferences', exact: true })
      .filter({ visible: true });
    if ((await trigger.getAttribute('data-state')) !== 'open')
      await trigger.click();
  };
  await openAccount();
  assert.equal(
    await page
      .getByRole('menuitem', { name: 'Reconnect account', exact: true })
      .count(),
    0
  );
  await page
    .getByRole('menuitem', { name: 'Leave a Feedback', exact: true })
    .click();
  assert.equal(
    await page.getByRole('dialog').locator('input[type=file]').count(),
    1
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Control+,');
  await page
    .getByRole('dialog')
    .getByText('Preferences', { exact: true })
    .first()
    .waitFor();
  await page.keyboard.press('Escape');
  await openAccount();
  await page.getByRole('menuitem', { name: 'Theme', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Dark', exact: true }).click();
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('dark')
  );
  await page.screenshot({
    path: '/private/tmp/colab-workspace-dark.png',
    fullPage: true,
  });
  await page.reload();
  await page.getByRole('heading', { name: 'Workshops', exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    ),
    true
  );
  await openAccount();
  await page.getByRole('menuitem', { name: 'Theme', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Light', exact: true }).click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('dark')
  );
  await page.screenshot({
    path: '/private/tmp/colab-workspace-light.png',
    fullPage: true,
  });
  await openAccount();
  await page.getByRole('menuitem', { name: 'Language', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Tiếng Việt', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Buổi thực hành', exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page
    .getByRole('heading', { name: 'Buổi thực hành', exact: true })
    .waitFor();
  const closeNav = page
    .locator('aside')
    .getByRole('button', { name: 'Thu gọn điều hướng', exact: true })
    .filter({ visible: true });
  if (await closeNav.count()) await closeNav.first().click();
  await page.waitForFunction(
    () => document.querySelector('aside')?.getBoundingClientRect().width <= 1
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    'mobile horizontal overflow'
  );
  await page.screenshot({
    path: '/private/tmp/colab-workspace-mobile.png',
    fullPage: true,
  });
  await page.goto('http://127.0.0.1:8795/join');
  await page
    .getByRole('dialog', { name: 'Tham gia phòng', exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page
    .getByRole('dialog', { name: 'Tham gia phòng', exact: true })
    .evaluate(async (dialog) => {
      await Promise.all(
        dialog
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {}))
      );
    });
  await page.screenshot({
    path: '/private/tmp/colab-join-dialog-mobile.png',
    fullPage: false,
  });
  await page.keyboard.press('Escape');
  await page
    .getByRole('heading', { name: 'Buổi thực hành', exact: true })
    .waitFor();
  await page.goto('http://127.0.0.1:8795/host');
  const mobileHost = page.getByRole('dialog', {
    name: 'Tổ chức buổi thực hành',
    exact: true,
  });
  await mobileHost.waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await mobileHost.evaluate(async (dialog) => {
    await Promise.all(
      dialog
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {}))
    );
  });
  await page.screenshot({ path: '/private/tmp/colab-host-dialog-mobile.png' });
  await page.keyboard.press('Escape');
  await request(`${path}/action`, owner, { action: 'mode', mode: 'open' });
  const initialSocket = page.waitForEvent('websocket');
  await page.goto(`http://127.0.0.1:8795/?room=${room.id}`);
  await page.getByRole('heading', { name: 'Runtime verification' }).waitFor();
  await initialSocket;
  await page.getByRole('tab', { name: /^(Prompt|Câu lệnh)$/ }).click();
  await page.locator('#prompt').fill('Unsaved prompt survives session renewal');
  await page.context().addCookies([
    {
      name: 'colab_session',
      value: token('host', 'host@tuturuuu.com', Date.now() + 60_000),
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
  const refreshedSocket = page.waitForEvent('websocket');
  await page.clock.fastForward(61_000);
  await refreshedSocket;
  assert.equal(
    await page.locator('#prompt').inputValue(),
    'Unsaved prompt survives session renewal'
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({
    path: '/private/tmp/colab-workshop.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await verifyDirectory({ request, owner, alice, browser });
  await verifyShowcase({ browser, request, owner, alice, bob });
  console.log(
    'PASS: runtime auth, CSRF, invitations, team isolation, showcase broadcast, concurrent edits, guest rotation, read-only, private revocation, desktop/mobile and Vietnamese UI.'
  );
} finally {
  await browser?.close();
  await mf.dispose();
}
