import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { HOSTS } from '../policy';
import type { UpskiiIdentity } from '../upskii';
import {
  ABSENT,
  adminStatus,
  ANONYMOUS,
  anonymousStatus,
  API_COVERAGE,
  field,
  getJson,
  INVENTORY_FAMILIES,
  type Json,
  renderPage,
  sendJson,
  upskiiActors,
  withResources,
} from './upskii-helpers';

/**
 * admin.upskii.com refuses every QA identity: QA users never hold an Upskii
 * admin role. Mutations carry same-origin headers so they pass the Worker's
 * origin check and reach the admin guard (`requireApiAdmin`): signed out is
 * 401, signed in without an admin role is 403. Probe bodies are empty, and
 * every probed handler calls the guard before reading its body.
 */

test.describe.configure({ mode: 'serial', retries: 0, timeout: 120_000 });

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Probe = { family: string; method: Method; path: string };

const NON_ADMIN = [403];
const someId = randomUUID();

function adminProbes(userId: string): Probe[] {
  const A = '/api/admin';
  return [
    { family: 'users', method: 'GET', path: `${A}/users` },
    { family: 'users', method: 'POST', path: `${A}/users` },
    { family: 'users/[userId]', method: 'GET', path: `${A}/users/${userId}` },
    { family: 'users/[userId]', method: 'PATCH', path: `${A}/users/${userId}` },
    {
      family: 'classes',
      method: 'PATCH',
      path: `${A}/classes/${someId}/marketplace-approval`,
    },
    { family: 'class-reviews', method: 'GET', path: `${A}/class-reviews` },
    { family: 'content', method: 'GET', path: `${A}/content` },
    {
      family: 'moderation',
      method: 'PATCH',
      path: `${A}/content/lesson/${someId}`,
    },
    { family: 'feedback', method: 'GET', path: `${A}/feedback` },
    { family: 'access-policy', method: 'GET', path: `${A}/access-policy` },
    { family: 'access-policy', method: 'PUT', path: `${A}/access-policy` },
    { family: 'bots', method: 'GET', path: `${A}/bots` },
    { family: 'bots', method: 'POST', path: `${A}/bots` },
    { family: 'demo-data', method: 'GET', path: `${A}/demo-data` },
    { family: 'demo-data', method: 'POST', path: `${A}/demo-data/seed` },
    { family: 'audit', method: 'GET', path: `${A}/audit` },
    { family: 'reports', method: 'GET', path: `${A}/reports` },
    { family: 'snapshot', method: 'GET', path: `${A}/snapshot` },
  ];
}

async function expectRefused(identity: UpskiiIdentity, probes: Probe[]) {
  for (const probe of probes)
    await expect
      .soft(
        adminStatus(identity, probe.method, probe.path, NON_ADMIN),
        `${probe.family} ${probe.method}`
      )
      .resolves.toBe(403);
}

test('every admin API family refuses the teacher', async ({ actors }) => {
  const { teacher, student } = upskiiActors(actors);
  await expectRefused(teacher, adminProbes(student.userId));
});

test('every admin API family refuses the student', async ({ actors }) => {
  const { teacher, student } = upskiiActors(actors);
  await expectRefused(student, adminProbes(teacher.userId));
});

test('every admin API family refuses anonymous callers', async ({ actors }) => {
  for (const probe of adminProbes(upskiiActors(actors).student.userId))
    await expect
      .soft(
        anonymousStatus('upskiiAdmin', probe.method, probe.path, ANONYMOUS),
        `${probe.family} ${probe.method}`
      )
      .resolves.toBe(401);
});

test('QA provisioner refuses a session without the bearer token', async ({
  actors,
}) => {
  const { teacher, student } = upskiiActors(actors);
  // A cookie (or Origin) is refused before admission counting: 403, or 404
  // when the provisioner is disabled.
  for (const who of [teacher, student]) {
    await adminStatus(who, 'GET', '/api/admin/qa/users', [403, 404]);
    await adminStatus(
      who,
      'GET',
      `/api/admin/qa/users/${who.userId}`,
      [403, 404]
    );
  }
  await anonymousStatus(
    'upskiiAdmin',
    'GET',
    '/api/admin/qa/users',
    [401, 403, 404]
  );
});

test('experimental-features kill switch refuses QA users', async ({
  actors,
}) => {
  const { teacher, student } = upskiiActors(actors);
  const path = '/api/admin/experimental-features';
  // 404 while UPSKII_EXPERIMENTAL_FLAG_ADMIN_ENABLED is off (checked before
  // the guard); 403 from the guard when it is on.
  for (const who of [teacher, student]) {
    await adminStatus(who, 'GET', path, [403, 404]);
    await adminStatus(who, 'PUT', path, [403, 404]);
  }
  await anonymousStatus('upskiiAdmin', 'GET', path, ANONYMOUS);
  await anonymousStatus('upskiiAdmin', 'PUT', path, ANONYMOUS);
});

test('app-side admin APIs refuse QA users', async ({ actors, upskiiApi }) => {
  const { teacher, student } = upskiiActors(actors);
  const t = await upskiiApi(teacher);
  const s = await upskiiApi(student);
  // Educator experience: the access gate requires an active admin role.
  await t('teacher demo data', '/api/upskii/admin/demo-data', {
    expect: [403],
  });
  await t('teacher demo seed', '/api/upskii/admin/demo-data/seed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    expect: [403],
  });
  // Learn experience has no demo-data family.
  await s('student demo data', '/api/upskii/admin/demo-data', {
    expect: ABSENT,
  });
  for (const [who, api] of [
    ['teacher', t],
    ['student', s],
  ] as const) {
    const capability = await getJson(
      api,
      `${who} export capability`,
      '/api/upskii/admin/page-export-capability'
    );
    expect(capability.allowed, `${who} page export capability`).toBe(false);
  }
});

test('admin UI shell refuses or redirects non-admins', async ({
  actors,
  upskiiContext,
  anonymousContext,
}) => {
  const { teacher, student } = upskiiActors(actors);
  for (const who of [teacher, student]) {
    const page = await renderPage(await upskiiContext(who), 'upskiiAdmin', '/');
    expect
      .soft(page.origin, `${who.role} stays on admin`)
      .toBe(HOSTS.upskiiAdmin);
    expect
      .soft(page.pathname, `${who.role} lands on /forbidden`)
      .toBe('/forbidden');
    expect.soft(page.serverErrors, `${who.role} network 5xx`).toEqual([]);
  }
  const anonymous = await renderPage(
    await anonymousContext(),
    'upskiiAdmin',
    '/'
  );
  expect(anonymous.origin, 'anonymous leaves the admin host').not.toBe(
    HOSTS.upskiiAdmin
  );
  expect(anonymous.pathname).toMatch(/^\/login/u);
});

test('capacity-viewer read-only routes', async () => {
  test.skip(
    true,
    'Capacity-viewer sessions come only from /api/internal/capacity-test/session, which is disabled on production and needs the load-test secret; the guard on users/audit/snapshot is covered above'
  );
});

test('feedback: the teacher submits; the admin inbox refuses them', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const { teacher } = upskiiActors(actors);
  const t = await upskiiApi(teacher);
  await withResources(track, async (res) => {
    // No DELETE API for feedback; the teacher purge removes it.
    const feedback = await res.create(
      {
        what: 'feedback',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'feedback.id'),
      },
      () =>
        sendJson(
          t,
          'submit feedback',
          'POST',
          '/api/upskii/feedback',
          { message: label('feedback'), path: '/' },
          [201]
        )
    );
    expect((feedback.value.feedback as Json).status).toBe('new');
    await adminStatus(teacher, 'GET', '/api/admin/feedback', NON_ADMIN);
    await adminStatus(
      teacher,
      'PATCH',
      `/api/admin/feedback/${feedback.id}`,
      NON_ADMIN
    );
    await anonymousStatus(
      'upskiiAdmin',
      'PATCH',
      `/api/admin/feedback/${feedback.id}`,
      ANONYMOUS
    );
  });
});

test('API coverage census classifies every inventory family once', async () => {
  const covered = Object.keys(API_COVERAGE.covered);
  const skipped = Object.keys(API_COVERAGE.skipped);
  expect(
    covered.filter((family) => skipped.includes(family)),
    'covered and skipped'
  ).toEqual([]);
  expect([...covered, ...skipped].sort()).toEqual(
    [...INVENTORY_FAMILIES].sort()
  );
  test.info().annotations.push({
    type: 'upskii-api-coverage',
    description: `${covered.length} covered, ${skipped.length} skipped of ${INVENTORY_FAMILIES.length} families`,
  });
});
