import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';
import { e2eClientHeaders, e2eClientIpForTest } from './helpers/rate-limits';

const databaseOrigin =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;
const databaseHeaders = {
  apikey: secretKey,
  authorization: `Bearer ${secretKey}`,
  'content-type': 'application/json',
  prefer: 'return=minimal',
};

async function insert(
  request: APIRequestContext,
  table: string,
  data: unknown
) {
  const response = await request.post(`${databaseOrigin}/rest/v1/${table}`, {
    headers: databaseHeaders,
    data,
  });
  expect(response.status(), `create disposable ${table} fixture`).toBe(201);
}

test.describe('Programming catalog with actual Next auth and disposable database', () => {
  test.beforeAll(() => assertSafeE2EEnvironment());

  test('author RPC writes preserve revisions, hidden cases and workspace isolation', async ({
    browser,
    request,
    baseURL,
  }, testInfo) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 293));
    const author = await browser.newContext({ extraHTTPHeaders: headers });
    const outsider = await browser.newContext({ extraHTTPHeaders: headers });
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const runId = randomUUID();
    const ownedUsers: string[] = [];
    const ownedWorkspaces: string[] = [];
    const payload = {
      slug: `e2e-programming-${runId}`,
      title: { en: 'Disposable Programming problem', vi: 'Bài tập kiểm thử' },
      prompt: {
        en: 'Return the supplied value.',
        vi: 'Trả về giá trị đầu vào.',
      },
      difficulty: 'easy',
      topic: 'arrays',
      starterCode: 'console.log("synthetic");',
      status: 'published',
      cases: [
        { input: 'visible-input', expected: 'visible-output', visible: true },
        { input: 'hidden-input', expected: 'hidden-output', visible: false },
      ],
    };

    try {
      for (const [context, suffix] of [
        [author, 'author'],
        [outsider, 'outsider'],
      ] as const) {
        const session = await context.request.post(
          `${origin}/api/auth/dev-session`,
          {
            data: {
              completeOnboarding: true,
              email: `e2e-programming-${suffix}-${runId}@example.com`,
              locale: DEFAULT_LOCALE,
            },
          }
        );
        expect(session.status()).toBe(200);
        const profile = await context.request.get(
          `${origin}/api/v1/users/me/profile`
        );
        expect(profile.status()).toBe(200);
        const user = (await profile.json()) as { id: string };
        expect(user.id).toEqual(expect.any(String));
        ownedUsers.push(user.id);
      }
      for (const id of [workspaceId, otherWorkspaceId]) {
        await insert(request, 'workspaces', {
          id,
          creator_id: ownedUsers[0],
          handle: `e2e-programming-${id.slice(0, 8)}`,
          name: 'Disposable Programming workspace',
          personal: false,
        });
        ownedWorkspaces.push(id);
        await insert(request, 'workspace_secrets', {
          ws_id: id,
          name: 'ENABLE_EDUCATION',
          value: 'true',
        });
      }
      // The real membership trigger creates the creator's virtual-user link.
      // Reuse it: inserting a second link would violate (platform_user_id, ws_id).
      const linked = await request.get(
        `${databaseOrigin}/rest/v1/workspace_user_linked_users?ws_id=eq.${workspaceId}&platform_user_id=eq.${ownedUsers[0]}&select=virtual_user_id`,
        { headers: databaseHeaders }
      );
      expect(linked.status()).toBe(200);
      const links = (await linked.json()) as Array<{ virtual_user_id: string }>;
      expect(links).toHaveLength(1);
      expect(links[0]?.virtual_user_id).toEqual(expect.any(String));

      const catalog = `${origin}/api/v1/workspaces/${workspaceId}/programming/problems`;
      const created = await author.request.post(catalog, { data: payload });
      expect(created.status()).toBe(201);
      const identity = (await created.json()) as {
        id: string;
        revision: number;
      };
      expect(identity.revision).toBe(1);
      const detail = `${catalog}/${identity.id}`;

      const authorDetail = await author.request.get(`${detail}?mode=author`);
      expect(authorDetail.status()).toBe(200);
      const authorText = await authorDetail.text();
      expect(authorText).toContain('hidden-input');
      expect(authorText).toContain('hidden-output');

      const learnerDetail = await author.request.get(detail);
      expect(learnerDetail.status()).toBe(200);
      expect(learnerDetail.headers()['cache-control']).toBe(
        'private, no-store'
      );
      const learnerText = await learnerDetail.text();
      expect(learnerText).toContain('visible-input');
      expect(learnerText).not.toContain('hidden-input');
      expect(learnerText).not.toContain('hidden-output');

      const listing = await author.request.get(catalog);
      expect(listing.status()).toBe(200);
      const page = (await listing.json()) as {
        problems: Array<{ id: string }>;
        nextCursor: string | null;
      };
      expect(page.problems.some((problem) => problem.id === identity.id)).toBe(
        true
      );
      expect(page.problems.length).toBeLessThanOrEqual(50);
      expect(await listing.text()).not.toContain('hidden-input');
      expect(
        (await author.request.get(`${catalog}?cursor=invalid`)).status()
      ).toBe(400);

      expect(
        (await outsider.request.get(`${detail}?mode=author`)).status()
      ).toBe(403);
      expect(
        (await outsider.request.post(catalog, { data: payload })).status()
      ).toBe(403);
      const foreignDetail = `${origin}/api/v1/workspaces/${otherWorkspaceId}/programming/problems/${identity.id}?mode=author`;
      expect((await author.request.get(foreignDetail)).status()).toBe(404);

      const nextPayload = {
        ...payload,
        expectedRevision: identity.revision,
        title: { en: 'Revised Programming problem', vi: 'Bài tập đã sửa' },
      };
      const revised = await author.request.patch(detail, { data: nextPayload });
      expect(revised.status()).toBe(200);
      expect((await revised.json()).revision).toBe(2);
      expect(
        (await author.request.patch(detail, { data: nextPayload })).status()
      ).toBe(409);
      const preserved = await author.request.get(detail);
      expect(await preserved.text()).toContain('Revised Programming problem');

      const oversized = await author.request.post(catalog, {
        data: {
          ...payload,
          slug: `e2e-capacity-${runId}`,
          cases: Array.from({ length: 10 }, () => payload.cases[0]),
        },
      });
      expect(oversized.status()).toBe(400);
    } finally {
      for (const id of ownedWorkspaces.reverse()) {
        const removed = await request.delete(
          `${databaseOrigin}/rest/v1/workspaces?id=eq.${id}`,
          { headers: databaseHeaders }
        );
        expect(removed.status(), 'remove only owned disposable workspace').toBe(
          204
        );
      }
      for (const id of ownedUsers) {
        const removed = await request.delete(
          `${databaseOrigin}/auth/v1/admin/users/${id}`,
          { headers: databaseHeaders }
        );
        expect(removed.status(), 'remove only owned disposable auth user').toBe(
          200
        );
      }
      await author.close();
      await outsider.close();
    }
  });
});
