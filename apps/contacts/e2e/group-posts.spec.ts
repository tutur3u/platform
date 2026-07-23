import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionToken,
  WEB_APP_SESSION_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';
import { assertSafeContactsE2EEnvironment } from './helpers/environment';

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const TEST_USER = {
  email: 'local@tuturuuu.com',
  id: '00000000-0000-0000-0000-000000000001',
} as const;
const APP_COORDINATION_SECRET =
  process.env.TUTURUUU_APP_COORDINATION_SECRET ??
  'local-e2e-app-coordination-secret';

function getSupabaseSecretKey() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error(
      'SUPABASE_SECRET_KEY is required for Contacts E2E fixtures'
    );
  }
  return secret;
}

function serviceHeaders(schema: 'private' | 'public' = 'public') {
  const supabaseSecretKey = getSupabaseSecretKey();
  return {
    apikey: supabaseSecretKey,
    authorization: `Bearer ${supabaseSecretKey}`,
    'content-profile': schema,
    'content-type': 'application/json',
    prefer: 'return=minimal',
  };
}

test.describe('Contacts group posts API', () => {
  const { contactsUrl, supabaseUrl } = assertSafeContactsE2EEnvironment();

  test('rejects an unauthenticated daily report creation', async ({
    request,
  }) => {
    const response = await request.post(
      `/api/v1/workspaces/${ROOT_WORKSPACE_ID}/user-groups/${randomUUID()}/posts`,
      {
        data: { title: 'Unauthorized E2E report' },
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  test('creates a report and persists completed, incomplete, and reset states from the UI', async ({
    page,
    request,
  }) => {
    const workspaceId = randomUUID();
    const groupId = randomUUID();
    const virtualUserId = randomUUID();
    const title = `Contacts E2E daily report ${groupId}`;
    const { token } = createAppSessionToken(
      {
        email: TEST_USER.email,
        originApp: 'web',
        targetApp: 'contacts',
        userId: TEST_USER.id,
      },
      { secret: APP_COORDINATION_SECRET }
    );
    const appHeaders = { authorization: `Bearer ${token}` };
    let postId: string | null = null;
    let periodicReportId: string | null = null;

    try {
      const workspaceResponse = await request.post(
        `${supabaseUrl}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `contacts-e2e-${workspaceId.slice(0, 8)}`,
            id: workspaceId,
            name: 'Contacts group posts E2E',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const memberResponse = await request.post(
        `${supabaseUrl}/rest/v1/workspace_members`,
        {
          data: { type: 'MEMBER', user_id: TEST_USER.id, ws_id: workspaceId },
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(memberResponse.status()).toBe(201);

      const virtualUserResponse = await request.post(
        `${supabaseUrl}/rest/v1/workspace_users`,
        {
          data: {
            email: TEST_USER.email,
            full_name: 'Contacts E2E Actor',
            id: virtualUserId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(virtualUserResponse.status()).toBe(201);

      const fixtureResponse = await request.post(
        `${supabaseUrl}/rest/v1/workspace_user_groups`,
        {
          data: { id: groupId, name: title, ws_id: workspaceId },
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(fixtureResponse.status()).toBe(201);

      const groupMemberResponse = await request.post(
        `${supabaseUrl}/rest/v1/workspace_user_groups_users`,
        {
          data: {
            group_id: groupId,
            role: 'STUDENT',
            user_id: virtualUserId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
      expect(groupMemberResponse.status()).toBe(201);

      const createResponse = await request.post(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts`,
        {
          data: {
            content: 'Lesson completed',
            notes: 'Created by Contacts E2E',
            title,
          },
          failOnStatusCode: false,
          headers: appHeaders,
        }
      );
      const createBody = (await createResponse.json()) as unknown;
      expect(createResponse.status(), JSON.stringify(createBody)).toBe(200);

      const listResponse = await request.get(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts?limit=10`,
        { failOnStatusCode: false, headers: appHeaders }
      );
      expect(listResponse.status()).toBe(200);
      const list = (await listResponse.json()) as {
        data: Array<{ id: string; title: string | null }>;
      };
      postId = list.data.find((post) => post.title === title)?.id ?? null;
      expect(postId).toBeTruthy();

      const updateResponse = await request.put(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts/${postId}`,
        {
          data: { notes: 'Updated by Contacts E2E' },
          failOnStatusCode: false,
          headers: appHeaders,
        }
      );
      expect(updateResponse.status()).toBe(200);

      const statusResponse = await request.get(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts/${postId}/status`,
        { failOnStatusCode: false, headers: appHeaders }
      );
      expect(statusResponse.status()).toBe(200);
      await expect(statusResponse.json()).resolves.toEqual(
        expect.objectContaining({
          count: expect.any(Number),
          queue: expect.any(Object),
        })
      );

      await page.context().addCookies([
        {
          httpOnly: true,
          name: APP_SESSION_COOKIE_NAME,
          sameSite: 'Lax',
          url: contactsUrl,
          value: token,
        },
        {
          httpOnly: true,
          name: WEB_APP_SESSION_COOKIE_NAME,
          sameSite: 'Lax',
          url: contactsUrl,
          value: token,
        },
      ]);
      await page.context().setExtraHTTPHeaders(appHeaders);
      await page.goto(
        `/${workspaceId}/users/groups/${groupId}/posts/${postId}`
      );
      await expect(
        page.getByRole('heading', { exact: true, level: 2, name: title })
      ).toBeVisible();

      const recipientCard = () =>
        page
          .locator('[data-slot="card"]')
          .filter({ hasText: 'Contacts E2E Actor' });
      await expect(recipientCard()).toHaveCount(1);

      const createCheckResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response
            .url()
            .endsWith(
              `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/group-checks`
            )
      );
      await recipientCard()
        .getByRole('button', { exact: true, name: 'Completed' })
        .click();
      expect((await createCheckResponse).status()).toBe(200);
      await expect(page.getByText('Completion status saved')).toBeVisible();

      const readChecks = async () => {
        const response = await request.get(
          `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/group-checks?postId=${postId}`,
          { failOnStatusCode: false, headers: appHeaders }
        );
        expect(response.status()).toBe(200);
        return (await response.json()) as Array<{
          is_completed: boolean;
          user_id: string;
        }>;
      };

      await expect
        .poll(async () => (await readChecks())[0]?.is_completed)
        .toBe(true);
      await expect(
        recipientCard().getByRole('button', { exact: true, name: 'Reset' })
      ).toBeVisible();

      const updateCheckResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          response
            .url()
            .endsWith(
              `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/group-checks/${postId}`
            )
      );
      await recipientCard()
        .getByRole('button', { exact: true, name: 'Incomplete' })
        .click();
      expect((await updateCheckResponse).status()).toBe(200);
      await expect
        .poll(async () => (await readChecks())[0]?.is_completed)
        .toBe(false);

      const historyResponse = await request.get(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/group-checks/${postId}/logs`,
        { failOnStatusCode: false, headers: appHeaders }
      );
      expect(historyResponse.status()).toBe(200);
      const history = (await historyResponse.json()) as {
        logs: Array<{
          new_is_completed: boolean | null;
          previous_is_completed: boolean | null;
          user_id: string;
        }>;
      };
      expect(history.logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            new_is_completed: true,
            previous_is_completed: null,
            user_id: virtualUserId,
          }),
          expect.objectContaining({
            new_is_completed: false,
            previous_is_completed: true,
            user_id: virtualUserId,
          }),
        ])
      );

      const resetCheckResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          response
            .url()
            .endsWith(
              `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/group-checks/${postId}`
            )
      );
      await recipientCard()
        .getByRole('button', { exact: true, name: 'Reset' })
        .click();
      expect((await resetCheckResponse).status()).toBe(200);
      await expect.poll(async () => (await readChecks()).length).toBe(0);
      await expect(page.getByText('Completion status reset')).toBeVisible();

      const periodicTitle = `Contacts E2E monthly report ${groupId}`;
      const createPeriodicResponse = await request.post(
        `/api/v1/workspaces/${workspaceId}/users/reports`,
        {
          data: {
            cadence: 'monthly',
            content: 'A manually authored monthly summary.',
            feedback: 'Continue the current learning plan.',
            generation_mode: 'manual',
            group_id: groupId,
            period_end: '2026-07-31',
            period_start: '2026-07-01',
            title: periodicTitle,
            user_id: virtualUserId,
          },
          failOnStatusCode: false,
          headers: appHeaders,
        }
      );
      const createPeriodicBody = (await createPeriodicResponse.json()) as {
        id?: string;
      };
      expect(
        createPeriodicResponse.status(),
        JSON.stringify(createPeriodicBody)
      ).toBe(200);
      periodicReportId = createPeriodicBody.id ?? null;
      expect(periodicReportId).toBeTruthy();

      const listPeriodicResponse = await request.get(
        `/api/v1/workspaces/${workspaceId}/users/reports?cadence=monthly&page=1&pageSize=10&q=${encodeURIComponent(periodicTitle)}`,
        { failOnStatusCode: false, headers: appHeaders }
      );
      expect(listPeriodicResponse.status()).toBe(200);
      await expect(listPeriodicResponse.json()).resolves.toEqual(
        expect.objectContaining({
          counts: expect.objectContaining({ total: 1 }),
          data: expect.arrayContaining([
            expect.objectContaining({
              cadence: 'monthly',
              id: periodicReportId,
              title: periodicTitle,
            }),
          ]),
        })
      );

      const approvePeriodicResponse = await request.put(
        `/api/v1/workspaces/${workspaceId}/users/reports/${periodicReportId}`,
        {
          data: { report_approval_status: 'APPROVED' },
          failOnStatusCode: false,
          headers: appHeaders,
        }
      );
      expect(approvePeriodicResponse.status()).toBe(200);

      const previewPeriodicResponse = await request.post(
        `/api/v1/workspaces/${workspaceId}/users/reports/${periodicReportId}/delivery`,
        {
          data: { action: 'preview' },
          failOnStatusCode: false,
          headers: appHeaders,
        }
      );
      expect(previewPeriodicResponse.status()).toBe(200);
      await expect(previewPeriodicResponse.json()).resolves.toEqual(
        expect.objectContaining({
          preview: expect.objectContaining({
            recipient: TEST_USER.email,
            title: periodicTitle,
          }),
          queued: false,
        })
      );

      const blockedDeliveryResponse = await request.post(
        `/api/v1/workspaces/${workspaceId}/users/reports/${periodicReportId}/delivery`,
        {
          data: { action: 'send' },
          failOnStatusCode: false,
          headers: appHeaders,
        }
      );
      expect(blockedDeliveryResponse.status()).toBe(409);
      await expect(blockedDeliveryResponse.json()).resolves.toEqual(
        expect.objectContaining({
          message:
            'Both workspace email gates must be enabled before periodic reports can send.',
        })
      );

      await page.goto(`/${workspaceId}/posts?status=published&q=lesson`);
      await expect(page).toHaveURL(
        new RegExp(
          `/${workspaceId}/reports\\?(?=.*view=daily)(?=.*status=published)(?=.*q=lesson)`
        )
      );

      const deletePeriodicResponse = await request.delete(
        `/api/v1/workspaces/${workspaceId}/users/reports/${periodicReportId}`,
        { failOnStatusCode: false, headers: appHeaders }
      );
      expect(deletePeriodicResponse.status()).toBe(200);
      periodicReportId = null;

      const deleteResponse = await request.delete(
        `/api/v1/workspaces/${workspaceId}/user-groups/${groupId}/posts/${postId}`,
        { failOnStatusCode: false, headers: appHeaders }
      );
      expect(deleteResponse.status()).toBe(200);
      postId = null;
    } finally {
      if (periodicReportId) {
        await request.delete(
          `${supabaseUrl}/rest/v1/external_user_monthly_reports?id=eq.${periodicReportId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders('private'),
          }
        );
      }
      if (postId) {
        await request.delete(
          `${supabaseUrl}/rest/v1/user_group_posts?id=eq.${postId}`,
          {
            failOnStatusCode: false,
            headers: serviceHeaders('private'),
          }
        );
      }
      await request.delete(
        `${supabaseUrl}/rest/v1/workspace_user_groups_users?group_id=eq.${groupId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await request.delete(
        `${supabaseUrl}/rest/v1/workspace_user_groups?id=eq.${groupId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await request.delete(
        `${supabaseUrl}/rest/v1/workspace_user_linked_users?ws_id=eq.${workspaceId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await request.delete(
        `${supabaseUrl}/rest/v1/workspace_users?id=eq.${virtualUserId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await request.delete(
        `${supabaseUrl}/rest/v1/workspace_members?ws_id=eq.${workspaceId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await request.delete(
        `${supabaseUrl}/rest/v1/workspaces?id=eq.${workspaceId}`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
    }
  });
});
