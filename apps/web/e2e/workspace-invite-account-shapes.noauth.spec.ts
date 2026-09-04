import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  test,
} from '@playwright/test';
import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionToken,
  WEB_APP_SESSION_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';
import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
  LOCAL_E2E_DOCKER_SUPABASE_URL,
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
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
const FINANCE_BASE_URL = process.env.FINANCE_BASE_URL;
const APP_SECRET =
  process.env.TUTURUUU_APP_COORDINATION_SECRET ??
  LOCAL_E2E_APP_COORDINATION_SECRET;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY;
const ACCOUNT_PASSWORD = 'Account-shape-e2e-password-123';
const WORKSPACE_SATELLITE_TARGETS = LAUNCHABLE_APPS.filter(
  (app) => app.slug !== 'platform' && 'workspacePathResolver' in app
).map((app) => app.portlessApp);

type LocalAuthUser = {
  email: string;
  id: string;
};

type LocalSupabaseSession = {
  access_token: string;
  expires_at?: number;
  refresh_token?: string;
  [key: string]: unknown;
};

function appToken(user: LocalAuthUser, targetApp: string) {
  return createAppSessionToken(
    {
      email: user.email,
      originApp: 'web',
      targetApp,
      userId: user.id,
    },
    { secret: APP_SECRET }
  ).token;
}

async function addAppCookies(
  context: BrowserContext,
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

async function createLocalAuthUser(
  request: APIRequestContext,
  { confirmed, email }: { confirmed: boolean; email: string }
) {
  const response = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    data: {
      email,
      email_confirm: confirmed,
      password: ACCOUNT_PASSWORD,
      user_metadata: { locale: 'en', origin: 'TUTURUUU' },
    },
    failOnStatusCode: false,
    headers: serviceHeaders(),
  });
  expect([200, 201], await response.text()).toContain(response.status());
  const body = (await response.json()) as {
    id?: string;
    user?: { id?: string };
  };
  const id = body.id ?? body.user?.id;
  expect(id).toEqual(expect.any(String));
  return { email, id: id! } satisfies LocalAuthUser;
}

async function setEmailConfirmed(request: APIRequestContext, userId: string) {
  const response = await request.put(
    `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    {
      data: { email_confirm: true },
      failOnStatusCode: false,
      headers: serviceHeaders(),
    }
  );
  expect(response.status(), await response.text()).toBe(200);
}

async function deleteLocalAuthUser(
  request: APIRequestContext,
  userId: string | null
) {
  if (!userId) return;
  const response = await request.delete(
    `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect([200, 204], await response.text()).toContain(response.status());
}

async function passwordSignIn(request: APIRequestContext, email: string) {
  return request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    data: { email, password: ACCOUNT_PASSWORD },
    failOnStatusCode: false,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'content-type': 'application/json',
    },
  });
}

async function mintAppSessionFromSupabase(
  request: APIRequestContext,
  {
    accessToken,
    returnUrl,
    targetApp,
  }: { accessToken: string; returnUrl: string; targetApp: string }
) {
  const returnResponse = await request.post(
    `${WEB_BASE_URL}/api/v1/auth/cross-app-return`,
    {
      data: { returnUrl },
      failOnStatusCode: false,
      headers: { authorization: `Bearer ${accessToken}` },
    }
  );
  expect(returnResponse.status(), await returnResponse.text()).toBe(200);
  const returnBody = (await returnResponse.json()) as { returnUrl?: string };
  expect(returnBody.returnUrl).toEqual(expect.any(String));
  const oneTimeToken = new URL(returnBody.returnUrl!).searchParams.get('token');
  expect(oneTimeToken).toEqual(expect.any(String));

  const verificationResponse = await request.post(
    `${WEB_BASE_URL}/api/v1/auth/cross-app-token/verify`,
    {
      data: { targetApp, token: oneTimeToken },
      failOnStatusCode: false,
    }
  );
  expect(verificationResponse.status(), await verificationResponse.text()).toBe(
    200
  );
  const verification = (await verificationResponse.json()) as {
    appSessionToken?: string;
    userId?: string;
  };
  expect(verification.appSessionToken).toMatch(/^ttr_app_/u);
  return verification.appSessionToken!;
}

async function createWorkspaceInvitationFixture({
  emailInvite,
  request,
  user,
  workspaceId,
}: {
  emailInvite?: boolean;
  request: APIRequestContext;
  user: LocalAuthUser;
  workspaceId: string;
}) {
  const suffix = workspaceId.slice(0, 8);
  const roleId = randomUUID();
  await postRestRow({
    request,
    table: 'workspaces',
    data: {
      creator_id: WORKSPACE_CREATOR_ID,
      handle: `e2e-account-shape-${suffix}`,
      id: workspaceId,
      name: `E2E Account Shape ${suffix}`,
      personal: false,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_roles',
    data: { id: roleId, name: 'Account-shape member', ws_id: workspaceId },
  });
  const permissions = [
    'create_user_groups_reports',
    'manage_users',
    'view_finance_stats',
    'view_transactions',
    'view_user_groups',
    'view_user_groups_reports',
    'view_users_public_info',
  ];
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
    table: emailInvite ? 'workspace_email_invites' : 'workspace_invites',
    data: emailInvite
      ? {
          email: user.email,
          role_id: roleId,
          type: 'MEMBER',
          ws_id: workspaceId,
        }
      : {
          role_id: roleId,
          type: 'MEMBER',
          user_id: user.id,
          ws_id: workspaceId,
        },
  });
}

async function getWorkspaceUserLink(
  request: APIRequestContext,
  workspaceId: string,
  userId: string
) {
  const response = await request.get(
    `${SUPABASE_URL}/rest/v1/workspace_user_linked_users?ws_id=eq.${workspaceId}&platform_user_id=eq.${userId}&select=virtual_user_id,workspace_users!inner(id,display_name,email)`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(response.status(), await response.text()).toBe(200);
  const links = (await response.json()) as Array<{
    virtual_user_id: string;
    workspace_users: {
      display_name: string;
      email: string;
      id: string;
    };
  }>;
  expect(links).toHaveLength(1);
  return links[0]!;
}

async function addNativeWebSessionCookies(
  context: BrowserContext,
  session: LocalSupabaseSession
) {
  const storageKeys = [
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL,
    process.env.SUPABASE_SERVER_URL ?? LOCAL_E2E_DOCKER_SUPABASE_URL,
  ]
    .map((url) => `sb-${new URL(url).hostname.split('.')[0]}-auth-token`)
    .filter((key, index, keys) => keys.indexOf(key) === index);
  const value = `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString(
    'base64url'
  )}`;

  await context.addCookies(
    storageKeys.map((name) => ({
      domain: '.tuturuuu.localhost',
      expires: session.expires_at,
      httpOnly: false,
      name,
      path: '/',
      sameSite: 'Lax' as const,
      secure: true,
      value,
    }))
  );
}

test.describe('workspace invitation account-shape resilience', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    expect(CONTACTS_BASE_URL).toBeTruthy();
    expect(FINANCE_BASE_URL).toBeTruthy();
  });

  test('keeps every workspace app usable without private details, a default workspace, or onboarding', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const workspaceId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    const email = `e2e-incomplete-${suffix}@example.com`;
    const walletId = randomUUID();
    const notificationId = randomUUID();
    const notificationTitle = `Incomplete account works ${suffix}`;
    let userId: string | null = null;
    let contactsContext: BrowserContext | null = null;
    let financeContext: BrowserContext | null = null;
    let webContext: BrowserContext | null = null;

    try {
      const user = await createLocalAuthUser(request, {
        confirmed: true,
        email,
      });
      userId = user.id;
      await deleteRestRows({
        request,
        table: 'user_private_details',
        filter: `user_id=eq.${user.id}`,
      });
      await createWorkspaceInvitationFixture({ request, user, workspaceId });

      const signInResponse = await passwordSignIn(request, email);
      expect(signInResponse.status(), await signInResponse.text()).toBe(200);
      const signIn = (await signInResponse.json()) as LocalSupabaseSession;
      expect(signIn.access_token).toEqual(expect.any(String));
      const contactsToken = await mintAppSessionFromSupabase(request, {
        accessToken: signIn.access_token!,
        returnUrl: `${CONTACTS_BASE_URL}/${workspaceId}/reports`,
        targetApp: 'contacts',
      });
      const financeToken = await mintAppSessionFromSupabase(request, {
        accessToken: signIn.access_token!,
        returnUrl: `${FINANCE_BASE_URL}/${workspaceId}/wallets`,
        targetApp: 'finance',
      });

      const acceptResponse = await request.post(
        `${WEB_BASE_URL}/api/workspaces/${workspaceId}/accept-invite`,
        {
          failOnStatusCode: false,
          headers: { authorization: `Bearer ${contactsToken}` },
        }
      );
      expect(acceptResponse.status(), await acceptResponse.text()).toBe(200);

      const onboardingResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/onboarding_progress?user_id=eq.${user.id}&select=user_id`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(onboardingResponse.status(), await onboardingResponse.text()).toBe(
        200
      );
      await expect(onboardingResponse.json()).resolves.toEqual([]);
      const privateDetailsResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/user_private_details?user_id=eq.${user.id}&select=user_id`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(
        privateDetailsResponse.status(),
        await privateDetailsResponse.text()
      ).toBe(200);
      await expect(privateDetailsResponse.json()).resolves.toEqual([]);

      const link = await getWorkspaceUserLink(request, workspaceId, user.id);
      expect(link.workspace_users.display_name).toBe(
        `User ${user.id.slice(0, 8)}`
      );
      expect(link.workspace_users.email).toBe('');

      for (const targetApp of WORKSPACE_SATELLITE_TARGETS) {
        const response = await request.get(
          `${WEB_BASE_URL}/api/v1/workspaces?q=${encodeURIComponent(`E2E Account Shape ${suffix}`)}`,
          {
            failOnStatusCode: false,
            headers: { authorization: `Bearer ${appToken(user, targetApp)}` },
          }
        );
        expect(
          response.status(),
          `${targetApp}: ${await response.text()}`
        ).toBe(200);
        await expect(response.json()).resolves.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: workspaceId })])
        );
      }

      await postRestRow({
        request,
        schema: 'private',
        table: 'workspace_wallets',
        data: {
          currency: 'VND',
          id: walletId,
          name: `Incomplete wallet ${suffix}`,
          type: 'STANDARD',
          ws_id: workspaceId,
        },
      });
      await postRestRow({
        request,
        table: 'notifications',
        data: {
          description: 'Visible without onboarding or private details',
          id: notificationId,
          title: notificationTitle,
          type: 'system_announcement',
          user_id: user.id,
          ws_id: workspaceId,
        },
      });

      const walletsResponse = await request.get(
        `${FINANCE_BASE_URL}/api/workspaces/${workspaceId}/wallets`,
        {
          failOnStatusCode: false,
          headers: { authorization: `Bearer ${financeToken}` },
        }
      );
      expect(walletsResponse.status(), await walletsResponse.text()).toBe(200);
      await expect(walletsResponse.json()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: `Incomplete wallet ${suffix}` }),
        ])
      );

      contactsContext = await browser.newContext({
        extraHTTPHeaders: { authorization: `Bearer ${contactsToken}` },
        ignoreHTTPSErrors: true,
      });
      await addAppCookies(contactsContext, CONTACTS_BASE_URL!, contactsToken);
      const contactsPage = await contactsContext.newPage();
      for (const route of ['/users', '/reports?view=periodic']) {
        const navigation = await contactsPage.goto(
          `${CONTACTS_BASE_URL}/${workspaceId}${route}`
        );
        expect(navigation?.status(), route).toBeLessThan(400);
        await expect(contactsPage).not.toHaveURL(
          /\/(?:[a-z]{2}\/)?(?:404|onboarding)(?:[/?#]|$)/u
        );
        await expect(
          contactsPage.getByRole('button', { name: 'Notifications' })
        ).toBeVisible();
      }
      await contactsPage.getByRole('button', { name: 'Notifications' }).click();
      await expect(contactsPage.getByText(notificationTitle)).toBeVisible();

      financeContext = await browser.newContext({
        extraHTTPHeaders: { authorization: `Bearer ${financeToken}` },
        ignoreHTTPSErrors: true,
      });
      await addAppCookies(financeContext, FINANCE_BASE_URL!, financeToken);
      const financePage = await financeContext.newPage();
      const financeNavigation = await financePage.goto(
        `${FINANCE_BASE_URL}/${workspaceId}/wallets`
      );
      expect(financeNavigation?.status()).toBeLessThan(400);
      await expect(financePage).not.toHaveURL(
        /\/(?:[a-z]{2}\/)?(?:404|onboarding)(?:[/?#]|$)/u
      );
      await expect(
        financePage.getByRole('button', { name: 'Notifications' })
      ).toBeVisible();

      webContext = await browser.newContext({
        ignoreHTTPSErrors: true,
      });
      await addNativeWebSessionCookies(webContext, signIn);
      const accountSettingsPage = await webContext.newPage();
      const accountSettingsNavigation = await accountSettingsPage.goto(
        `${WEB_BASE_URL}/${workspaceId}?settingsDialog=open&settingsTab=accounts`
      );
      expect(accountSettingsNavigation?.status()).toBeLessThan(400);
      await expect(accountSettingsPage).not.toHaveURL(
        /\/(?:[a-z]{2}\/)?(?:404|onboarding)(?:[/?#]|$)/u
      );
      await expect(
        accountSettingsPage.getByText('Manage Accounts', { exact: true })
      ).toBeVisible();
      const onboardingAfterWebSession = await request.get(
        `${SUPABASE_URL}/rest/v1/onboarding_progress?user_id=eq.${user.id}&select=user_id`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(
        onboardingAfterWebSession.status(),
        await onboardingAfterWebSession.text()
      ).toBe(200);
      await expect(onboardingAfterWebSession.json()).resolves.toEqual([]);
    } finally {
      await contactsContext?.close();
      await financeContext?.close();
      await webContext?.close();
      await deleteRestRows({
        request,
        table: 'workspaces',
        filter: `id=eq.${workspaceId}`,
      });
      await deleteLocalAuthUser(request, userId);
    }
  });

  test('preserves an unverified user invite, then repairs a lost Contacts link with partial onboarding', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const workspaceId = randomUUID();
    const suffix = workspaceId.slice(0, 8);
    const email = `e2e-unverified-${suffix}@example.com`;
    const groupId = randomUUID();
    const reportTitle = `Verified account report ${suffix}`;
    let userId: string | null = null;
    let contactsContext: BrowserContext | null = null;

    try {
      const user = await createLocalAuthUser(request, {
        confirmed: false,
        email,
      });
      userId = user.id;
      await createWorkspaceInvitationFixture({
        emailInvite: true,
        request,
        user,
        workspaceId,
      });
      await postRestRow({
        request,
        table: 'onboarding_progress',
        data: {
          completed_steps: ['welcome'],
          current_step: 'profile',
          user_id: user.id,
        },
      });

      const unverifiedSignIn = await passwordSignIn(request, email);
      const unverifiedBody = await unverifiedSignIn.text();
      expect(unverifiedSignIn.status(), unverifiedBody).toBe(400);
      expect(unverifiedBody).toMatch(/email.*not.*confirm/iu);

      const pendingInviteResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/workspace_email_invites?ws_id=eq.${workspaceId}&email=eq.${encodeURIComponent(email)}&select=ws_id`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      await expect(pendingInviteResponse.json()).resolves.toEqual([
        { ws_id: workspaceId },
      ]);

      await setEmailConfirmed(request, user.id);
      const verifiedSignIn = await passwordSignIn(request, email);
      expect(verifiedSignIn.status(), await verifiedSignIn.text()).toBe(200);
      const verifiedSession = (await verifiedSignIn.json()) as {
        access_token?: string;
      };
      const contactsToken = await mintAppSessionFromSupabase(request, {
        accessToken: verifiedSession.access_token!,
        returnUrl: `${CONTACTS_BASE_URL}/${workspaceId}/reports`,
        targetApp: 'contacts',
      });

      const acceptResponse = await request.post(
        `${WEB_BASE_URL}/api/workspaces/${workspaceId}/accept-invite`,
        {
          failOnStatusCode: false,
          headers: { authorization: `Bearer ${contactsToken}` },
        }
      );
      expect(acceptResponse.status(), await acceptResponse.text()).toBe(200);
      const originalLink = await getWorkspaceUserLink(
        request,
        workspaceId,
        user.id
      );

      await postRestRow({
        request,
        table: 'workspace_user_groups',
        data: {
          id: groupId,
          name: `Verified account group ${suffix}`,
          ws_id: workspaceId,
        },
      });
      await postRestRow({
        request,
        table: 'workspace_user_groups_users',
        data: {
          group_id: groupId,
          role: 'STUDENT',
          user_id: originalLink.virtual_user_id,
        },
      });
      const createReportResponse = await request.post(
        `${CONTACTS_BASE_URL}/api/v1/workspaces/${workspaceId}/users/reports`,
        {
          data: {
            cadence: 'monthly',
            content: 'Verification must not discard invited workspace data.',
            feedback: 'Keep onboarding optional.',
            generation_mode: 'manual',
            group_id: groupId,
            period_end: '2026-08-31',
            period_start: '2026-08-01',
            title: reportTitle,
            user_id: originalLink.virtual_user_id,
          },
          failOnStatusCode: false,
          headers: { authorization: `Bearer ${contactsToken}` },
        }
      );
      expect(
        createReportResponse.status(),
        await createReportResponse.text()
      ).toBe(200);

      await deleteRestRows({
        request,
        table: 'workspace_user_linked_users',
        filter: `ws_id=eq.${workspaceId}&platform_user_id=eq.${user.id}`,
      });
      contactsContext = await browser.newContext({
        extraHTTPHeaders: { authorization: `Bearer ${contactsToken}` },
        ignoreHTTPSErrors: true,
      });
      await addAppCookies(contactsContext, CONTACTS_BASE_URL!, contactsToken);
      const page = await contactsContext.newPage();
      const navigation = await page.goto(
        `${CONTACTS_BASE_URL}/${workspaceId}/reports?view=periodic`
      );
      expect(navigation?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(
        /\/(?:[a-z]{2}\/)?(?:404|onboarding)(?:[/?#]|$)/u
      );
      await expect(
        page.getByRole('heading', { name: 'This page could not be found.' })
      ).toHaveCount(0);
      await expect(page.getByText(reportTitle)).toBeVisible();

      const reportsResponse = await request.get(
        `${CONTACTS_BASE_URL}/api/v1/workspaces/${workspaceId}/users/reports?cadence=monthly&q=${encodeURIComponent(reportTitle)}`,
        {
          failOnStatusCode: false,
          headers: { authorization: `Bearer ${contactsToken}` },
        }
      );
      expect(reportsResponse.status(), await reportsResponse.text()).toBe(200);
      await expect(reportsResponse.json()).resolves.toEqual(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ title: reportTitle }),
          ]),
        })
      );

      const repairedLink = await getWorkspaceUserLink(
        request,
        workspaceId,
        user.id
      );
      expect(repairedLink.virtual_user_id).toBe(originalLink.virtual_user_id);
      const onboardingResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/onboarding_progress?user_id=eq.${user.id}&select=completed_at,current_step`,
        { failOnStatusCode: false, headers: serviceHeaders() }
      );
      expect(onboardingResponse.status(), await onboardingResponse.text()).toBe(
        200
      );
      await expect(onboardingResponse.json()).resolves.toEqual([
        { completed_at: null, current_step: 'profile' },
      ]);
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
      await deleteLocalAuthUser(request, userId);
    }
  });
});
