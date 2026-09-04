import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionToken,
  WEB_APP_SESSION_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';
import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
} from './helpers/environment';
import {
  deleteRestRows,
  postRestRow,
  SUPABASE_URL,
  serviceHeaders,
} from './helpers/supabase-rest';

const WORKSPACE_CREATOR_ID = '00000000-0000-0000-0000-000000000002';
const WEB_BASE_URL = process.env.BASE_URL ?? 'https://tuturuuu.localhost:1355';
const CONTACTS_BASE_URL = process.env.CONTACTS_BASE_URL;
const APP_SECRET =
  process.env.TUTURUUU_APP_COORDINATION_SECRET ??
  LOCAL_E2E_APP_COORDINATION_SECRET;
const WORKSPACE_SATELLITE_TARGETS = LAUNCHABLE_APPS.filter(
  (app) => app.slug !== 'platform' && 'workspacePathResolver' in app
).map((app) => app.portlessApp);

function appToken(targetApp: string) {
  return createAppSessionToken(
    {
      email: TEST_USER.email,
      originApp: 'web',
      targetApp,
      userId: TEST_USER.id,
    },
    { secret: APP_SECRET }
  ).token;
}

function appCookieHeader(token: string) {
  return [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME]
    .map((name) => `${name}=${token}`)
    .join('; ');
}

async function addAppCookies(
  context: import('@playwright/test').BrowserContext,
  url: string,
  token: string
) {
  await context.addCookies(
    [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME].map((name) => ({
      httpOnly: true,
      name,
      sameSite: 'Lax' as const,
      url,
      value: token,
    }))
  );
}

test.describe('accepted workspace invitation cross-app access', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    expect(
      CONTACTS_BASE_URL,
      'CONTACTS_BASE_URL must be provided by the E2E runner'
    ).toBeTruthy();
  });

  test('keeps linked profile, Contacts reports, and notifications available', async ({
    browser,
    request,
  }) => {
    // Exercise a data-backed list and report surface. API contracts and the
    // Contacts ownership matrix cover the remaining Contacts modules.
    test.setTimeout(600_000);

    const workspaceId = randomUUID();
    const roleId = randomUUID();
    const groupId = randomUUID();
    const groupTagId = randomUUID();
    const notificationId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    const reportTitle = `Invitation regression report ${suffix}`;
    const notificationTitle = `Cross-app access restored ${suffix}`;
    const permissions = [
      'approve_posts',
      'approve_reports',
      'check_user_attendance',
      'create_users',
      'manage_users',
      'view_users_private_info',
      'view_users_public_info',
      'view_user_groups',
      'view_user_groups_posts',
      'view_user_groups_reports',
      'view_user_groups_scores',
      'create_user_groups_reports',
    ];
    let contactsContext: import('@playwright/test').BrowserContext | null =
      null;

    try {
      await postRestRow({
        request,
        table: 'workspaces',
        data: {
          creator_id: WORKSPACE_CREATOR_ID,
          handle: `e2e-cross-app-${suffix}`,
          id: workspaceId,
          name: `E2E Cross-app ${suffix}`,
          personal: false,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_roles',
        data: { id: roleId, name: 'Cross-app member', ws_id: workspaceId },
      });
      await postRestRow({
        request,
        table: 'workspace_role_permissions',
        data: permissions.map((permission) => ({
          enabled: true,
          permission,
          role_id: roleId,
          ws_id: workspaceId,
        })),
      });
      await postRestRow({
        request,
        table: 'workspace_invites',
        data: {
          role_id: roleId,
          type: 'MEMBER',
          user_id: TEST_USER.id,
          ws_id: workspaceId,
        },
      });

      const acceptResponse = await request.post(
        `${WEB_BASE_URL}/api/workspaces/${workspaceId}/accept-invite`,
        {
          failOnStatusCode: false,
          headers: { authorization: `Bearer ${appToken('contacts')}` },
        }
      );
      expect(acceptResponse.status(), await acceptResponse.text()).toBe(200);

      const linkedProfileResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_linked_users?ws_id=eq.${workspaceId}&platform_user_id=eq.${TEST_USER.id}&select=virtual_user_id,workspace_users!inner(id,email)`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(linkedProfileResponse.status()).toBe(200);
      const linkedProfiles = (await linkedProfileResponse.json()) as Array<{
        virtual_user_id: string;
        workspace_users: { email: string | null; id: string };
      }>;
      expect(linkedProfiles).toHaveLength(1);
      expect(linkedProfiles[0]?.workspace_users).toEqual(
        expect.objectContaining({
          email: TEST_USER.email,
          id: linkedProfiles[0]?.virtual_user_id,
        })
      );
      const virtualUserId = linkedProfiles[0]!.virtual_user_id;

      // Reproduce a historical partial account: the membership and Contacts
      // profile both exist, but their linking row was lost or never created.
      // Profile-scoped pages must repair that link instead of returning 404.
      await deleteRestRows({
        request,
        table: 'workspace_user_linked_users',
        filter: `ws_id=eq.${workspaceId}&platform_user_id=eq.${TEST_USER.id}`,
      });
      const contactsToken = appToken('contacts');
      const contactsHeaders = { authorization: `Bearer ${contactsToken}` };
      const repairResponse = await request.get(
        `${CONTACTS_BASE_URL}/${workspaceId}/reports?view=periodic`,
        {
          failOnStatusCode: false,
          headers: {
            ...contactsHeaders,
            cookie: appCookieHeader(contactsToken),
          },
        }
      );
      expect(repairResponse.status(), await repairResponse.text()).toBe(200);
      expect(repairResponse.url()).not.toContain('/login');
      const repairedLinkResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_linked_users?ws_id=eq.${workspaceId}&platform_user_id=eq.${TEST_USER.id}&select=virtual_user_id`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(repairedLinkResponse.status()).toBe(200);
      await expect(repairedLinkResponse.json()).resolves.toEqual([
        { virtual_user_id: virtualUserId },
      ]);

      for (const targetApp of WORKSPACE_SATELLITE_TARGETS) {
        const workspacesResponse = await request.get(
          `${WEB_BASE_URL}/api/v1/workspaces?q=${encodeURIComponent(`E2E Cross-app ${suffix}`)}`,
          {
            failOnStatusCode: false,
            headers: { authorization: `Bearer ${appToken(targetApp)}` },
          }
        );
        expect(
          workspacesResponse.status(),
          `${targetApp}: ${await workspacesResponse.text()}`
        ).toBe(200);
        await expect(workspacesResponse.json()).resolves.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: workspaceId })])
        );
      }

      await postRestRow({
        request,
        table: 'workspace_user_groups',
        data: {
          id: groupId,
          name: `Assigned group ${suffix}`,
          ws_id: workspaceId,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_user_groups_users',
        data: { group_id: groupId, role: 'STUDENT', user_id: virtualUserId },
      });
      await postRestRow({
        request,
        table: 'workspace_user_group_tags',
        data: {
          id: groupTagId,
          name: `Visible tag ${suffix}`,
          ws_id: workspaceId,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_user_group_tag_groups',
        data: { group_id: groupId, tag_id: groupTagId },
      });
      await postRestRow({
        request,
        table: 'notifications',
        data: {
          description: 'Visible from every registered satellite',
          id: notificationId,
          title: notificationTitle,
          type: 'system_announcement',
          user_id: TEST_USER.id,
          ws_id: workspaceId,
        },
      });

      const createReportResponse = await request.post(
        `${CONTACTS_BASE_URL}/api/v1/workspaces/${workspaceId}/users/reports`,
        {
          data: {
            cadence: 'monthly',
            content: 'The invited member can read data-backed reports.',
            feedback: 'Continue the current cross-app workflow.',
            generation_mode: 'manual',
            group_id: groupId,
            period_end: '2026-07-31',
            period_start: '2026-07-01',
            title: reportTitle,
            user_id: virtualUserId,
          },
          failOnStatusCode: false,
          headers: contactsHeaders,
        }
      );
      expect(
        createReportResponse.status(),
        await createReportResponse.text()
      ).toBe(200);

      const reportsResponse = await request.get(
        `${CONTACTS_BASE_URL}/api/v1/workspaces/${workspaceId}/users/reports?cadence=monthly&q=${encodeURIComponent(reportTitle)}`,
        { failOnStatusCode: false, headers: contactsHeaders }
      );
      expect(reportsResponse.status()).toBe(200);
      await expect(reportsResponse.json()).resolves.toEqual(
        expect.objectContaining({
          counts: expect.objectContaining({ total: 1 }),
          data: expect.arrayContaining([
            expect.objectContaining({ title: reportTitle }),
          ]),
        })
      );

      const contactsApiChecks = [
        {
          method: 'get' as const,
          path: `/api/v1/workspaces/${workspaceId}/users/${virtualUserId}/emails?page=0&pageSize=10`,
        },
        {
          method: 'get' as const,
          path: `/api/v1/workspaces/${workspaceId}/users/database?page=1&pageSize=10`,
        },
        {
          method: 'get' as const,
          path: `/api/v1/workspaces/${workspaceId}/users/groups?page=1&pageSize=10`,
        },
        {
          method: 'get' as const,
          path: `/api/v1/workspaces/${workspaceId}/group-tags?page=1&pageSize=10`,
        },
        {
          data: {
            contentType: 'image/png',
            fileName: `invite-regression-${suffix}.png`,
          },
          method: 'post' as const,
          path: `/api/v1/workspaces/${workspaceId}/users/avatar`,
        },
      ];
      for (const check of contactsApiChecks) {
        const response = await request[check.method](
          `${CONTACTS_BASE_URL}${check.path}`,
          {
            data: check.data,
            failOnStatusCode: false,
            headers: contactsHeaders,
          }
        );
        const responseBody = await response.text();
        expect(
          response.status(),
          `${check.method.toUpperCase()} ${check.path}: ${responseBody}`
        ).toBe(200);
        if (check.path.includes('/group-tags?')) {
          expect(JSON.parse(responseBody)).toEqual(
            expect.objectContaining({
              data: expect.arrayContaining([
                expect.objectContaining({ name: `Visible tag ${suffix}` }),
              ]),
            })
          );
        }
      }

      contactsContext = await browser.newContext({
        extraHTTPHeaders: contactsHeaders,
        ignoreHTTPSErrors: true,
      });
      await addAppCookies(contactsContext, CONTACTS_BASE_URL!, contactsToken);
      const contactsPage = await contactsContext.newPage();
      for (const route of ['/users/groups', '/reports?view=periodic']) {
        const navigation = await contactsPage.goto(
          `${CONTACTS_BASE_URL}/${workspaceId}${route}`,
          { waitUntil: 'domcontentloaded' }
        );
        expect(navigation?.status(), route).toBeLessThan(400);
        await expect(contactsPage).not.toHaveURL(/\/404(?:\?|$)/u);
        if (route === '/users/groups') {
          await expect(
            contactsPage.getByText(`Assigned group ${suffix}`)
          ).toBeVisible({ timeout: 60_000 });
        }
        if (route === '/users/group-tags') {
          await expect(
            contactsPage.getByText(`Visible tag ${suffix}`)
          ).toBeVisible();
        }
      }
      await expect(contactsPage).toHaveURL(/\/reports\?view=periodic/u);
      await expect(contactsPage.getByText(reportTitle)).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        contactsPage.getByRole('button', { name: 'Notifications' })
      ).toBeEnabled({ timeout: 60_000 });
      await contactsPage.getByRole('button', { name: 'Notifications' }).click();
      await expect(contactsPage.getByText(notificationTitle)).toBeVisible({
        timeout: 30_000,
      });
      await contactsContext.close();
      contactsContext = null;
    } finally {
      await contactsContext?.close();
      await deleteRestRows({
        request,
        schema: 'private',
        table: 'external_user_monthly_reports',
        filter: `ws_id=eq.${workspaceId}`,
      });
      await deleteRestRows({
        request,
        table: 'workspaces',
        filter: `id=eq.${workspaceId}`,
      });
    }
  });

  test('shows assigned Contacts groups to an invited limited-scope member', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);

    const workspaceId = randomUUID();
    const roleId = randomUUID();
    const groupId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    const groupName = `Limited member group ${suffix}`;
    let contactsContext: import('@playwright/test').BrowserContext | null =
      null;

    try {
      await postRestRow({
        request,
        table: 'workspaces',
        data: {
          creator_id: WORKSPACE_CREATOR_ID,
          handle: `e2e-limited-contact-${suffix}`,
          id: workspaceId,
          name: `E2E Limited Contacts ${suffix}`,
          personal: false,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_roles',
        data: { id: roleId, name: 'Assigned group member', ws_id: workspaceId },
      });
      await postRestRow({
        request,
        table: 'workspace_role_permissions',
        data: ['view_user_groups', 'view_user_groups_reports'].map(
          (permission) => ({
            enabled: true,
            permission,
            role_id: roleId,
            ws_id: workspaceId,
          })
        ),
      });
      await postRestRow({
        request,
        table: 'workspace_invites',
        data: {
          role_id: roleId,
          type: 'MEMBER',
          user_id: TEST_USER.id,
          ws_id: workspaceId,
        },
      });

      const contactsToken = appToken('contacts');
      const contactsHeaders = { authorization: `Bearer ${contactsToken}` };
      const acceptResponse = await request.post(
        `${WEB_BASE_URL}/api/workspaces/${workspaceId}/accept-invite`,
        { failOnStatusCode: false, headers: contactsHeaders }
      );
      expect(acceptResponse.status(), await acceptResponse.text()).toBe(200);

      const linkResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_user_linked_users?ws_id=eq.${workspaceId}&platform_user_id=eq.${TEST_USER.id}&select=virtual_user_id`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(linkResponse.status()).toBe(200);
      const links = (await linkResponse.json()) as Array<{
        virtual_user_id: string;
      }>;
      expect(links).toHaveLength(1);

      await postRestRow({
        request,
        table: 'workspace_user_groups',
        data: { id: groupId, name: groupName, ws_id: workspaceId },
      });
      await postRestRow({
        request,
        table: 'workspace_user_groups_users',
        data: {
          group_id: groupId,
          role: 'STUDENT',
          user_id: links[0]!.virtual_user_id,
        },
      });

      const groupsResponse = await request.get(
        `${CONTACTS_BASE_URL}/api/v1/workspaces/${workspaceId}/users/groups?page=1&pageSize=10`,
        { failOnStatusCode: false, headers: contactsHeaders }
      );
      expect(groupsResponse.status(), await groupsResponse.text()).toBe(200);
      await expect(groupsResponse.json()).resolves.toEqual(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ id: groupId, name: groupName }),
          ]),
        })
      );

      contactsContext = await browser.newContext({
        extraHTTPHeaders: contactsHeaders,
        ignoreHTTPSErrors: true,
      });
      await addAppCookies(contactsContext, CONTACTS_BASE_URL!, contactsToken);
      const page = await contactsContext.newPage();
      for (const route of ['/users/groups', `/users/groups/${groupId}`]) {
        const navigation = await page.goto(
          `${CONTACTS_BASE_URL}/${workspaceId}${route}`,
          { waitUntil: 'domcontentloaded' }
        );
        expect(navigation?.status(), route).toBeLessThan(400);
        await expect(page).not.toHaveURL(/\/404(?:\?|$)/u);
        await expect(page.getByText(groupName).first()).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Notifications' })
        ).toBeVisible();
      }
    } finally {
      await contactsContext?.close();
      await deleteRestRows({
        request,
        table: 'workspaces',
        filter: `id=eq.${workspaceId}`,
      });
    }
  });
});
