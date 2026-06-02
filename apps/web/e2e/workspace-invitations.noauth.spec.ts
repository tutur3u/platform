import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test,
} from '@playwright/test';
import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_APP_COORDINATION_SECRET,
  LOCAL_E2E_BASE_URL,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
  SAFE_LOCAL_SUPABASE_ORIGINS,
} from './helpers/environment';

function readLocalEnvValue(name: string) {
  try {
    const source = readFileSync('.env.local', 'utf8');
    const entry = source
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.startsWith(`${name}=`));

    if (!entry) {
      return null;
    }

    const rawValue = entry.slice(entry.indexOf('=') + 1).trim();
    const quote = rawValue[0];

    if (
      (quote === '"' || quote === "'") &&
      rawValue.endsWith(quote) &&
      rawValue.length >= 2
    ) {
      return rawValue.slice(1, -1);
    }

    return rawValue || null;
  } catch {
    return null;
  }
}

const NON_LOCAL_SUPABASE_CONFIRMATION_ENV =
  'CONFIRM_NON_LOCAL_SUPABASE_E2E_CREDENTIALS';

function isSafeLocalSupabaseUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    return SAFE_LOCAL_SUPABASE_ORIGINS.has(new URL(value).origin);
  } catch {
    return false;
  }
}

function readLocalSupabaseSecretKey() {
  const localEnvSupabaseUrl =
    readLocalEnvValue('NEXT_PUBLIC_SUPABASE_URL') ??
    readLocalEnvValue('SUPABASE_URL') ??
    readLocalEnvValue('SUPABASE_SERVER_URL');

  if (!isSafeLocalSupabaseUrl(localEnvSupabaseUrl)) {
    return null;
  }

  return readLocalEnvValue('SUPABASE_SECRET_KEY');
}

const BASE_URL = process.env.BASE_URL ?? LOCAL_E2E_BASE_URL;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const LOCAL_ENV_SUPABASE_SECRET_KEY = readLocalSupabaseSecretKey();
const SUPABASE_SECRET_KEY_SOURCE = process.env.SUPABASE_SECRET_KEY
  ? 'process-env'
  : LOCAL_ENV_SUPABASE_SECRET_KEY
    ? 'local-env-file'
    : 'local-fallback';
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  LOCAL_ENV_SUPABASE_SECRET_KEY ??
  LOCAL_E2E_SUPABASE_SECRET_KEY;

type InvitationRecord = {
  matchedEmail: string | null;
  source: 'direct' | 'email';
  type: string;
  workspace: {
    handle: string | null;
    id: string;
    name: string | null;
    personal: boolean;
  };
};

type InviteStatusResponse = {
  invitation?: InvitationRecord;
  status: 'member' | 'pending_invite' | 'none';
  workspace: InvitationRecord['workspace'] | null;
};

type InviteListResponse = {
  invitations: InvitationRecord[];
};

function serviceHeaders(prefer?: string) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

function getAppCoordinationSecret() {
  const value =
    process.env.TUTURUUU_APP_COORDINATION_SECRET ??
    readLocalEnvValue('TUTURUUU_APP_COORDINATION_SECRET') ??
    LOCAL_E2E_APP_COORDINATION_SECRET;
  const trimmed = value.trim();
  const quote = trimmed[0];

  if (
    (quote === '"' || quote === "'") &&
    trimmed.endsWith(quote) &&
    trimmed.length >= 2
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function createAppRequestContext() {
  return playwrightRequest.newContext({
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
  });
}

function createCalendarAppSessionToken() {
  return createAppSessionToken(
    {
      email: TEST_USER.email,
      originApp: 'web',
      targetApp: 'calendar',
      userId: TEST_USER.id,
    },
    {
      secret: getAppCoordinationSecret(),
    }
  ).token;
}

function assertLocalSupabaseCredentials() {
  if (!isSafeLocalSupabaseUrl(SUPABASE_URL)) {
    throw new Error(`Refusing to run E2E with non-local Supabase URL.`);
  }

  const isKnownLocalSecret =
    SUPABASE_SECRET_KEY === LOCAL_E2E_SUPABASE_SECRET_KEY;
  const isLocalEnvFileSecret = SUPABASE_SECRET_KEY_SOURCE === 'local-env-file';
  const isConfirmedProcessEnvSecret =
    SUPABASE_SECRET_KEY_SOURCE === 'process-env' &&
    process.env[NON_LOCAL_SUPABASE_CONFIRMATION_ENV] === '1';

  if (
    isKnownLocalSecret ||
    isLocalEnvFileSecret ||
    isConfirmedProcessEnvSecret
  ) {
    return;
  }

  throw new Error(
    `Refusing to run E2E with SUPABASE_SECRET_KEY from process env without confirmation. ` +
      `Ask the user before using non-local Supabase credentials, then set ${NON_LOCAL_SUPABASE_CONFIRMATION_ENV}=1 for this command only.`
  );
}

async function createWorkspace(
  request: APIRequestContext,
  workspaceId: string,
  handlePrefix: string
) {
  const response = await request.post(`${SUPABASE_URL}/rest/v1/workspaces`, {
    data: {
      creator_id: TEST_USER.id,
      handle: `${handlePrefix}-${workspaceId.slice(0, 8)}`,
      id: workspaceId,
      name: `E2E Invite ${handlePrefix}`,
      personal: false,
    },
    failOnStatusCode: false,
    headers: serviceHeaders('return=minimal'),
  });

  expect(response.status()).toBe(201);
}

async function deleteWorkspaceInvitationFixtures(
  request: APIRequestContext,
  workspaceId: string
) {
  await request.delete(
    `${SUPABASE_URL}/rest/v1/workspace_invites?ws_id=eq.${workspaceId}&user_id=eq.${TEST_USER.id}`,
    {
      failOnStatusCode: false,
      headers: serviceHeaders('return=minimal'),
    }
  );
  await request.delete(
    `${SUPABASE_URL}/rest/v1/workspace_email_invites?ws_id=eq.${workspaceId}&email=eq.${encodeURIComponent(TEST_USER.email)}`,
    {
      failOnStatusCode: false,
      headers: serviceHeaders('return=minimal'),
    }
  );
  await request.delete(
    `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
    {
      failOnStatusCode: false,
      headers: serviceHeaders('return=minimal'),
    }
  );
}

test.describe('Workspace invitation APIs', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
    assertLocalSupabaseCredentials();
  });

  test('surfaces direct pending invites through app-session auth', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const appSessionToken = createCalendarAppSessionToken();
    let appRequest: APIRequestContext | null = null;

    try {
      await createWorkspace(request, workspaceId, 'e2e-direct-invite');

      const inviteResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_invites`,
        {
          data: {
            type: 'MEMBER',
            user_id: TEST_USER.id,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(inviteResponse.status()).toBe(201);

      appRequest = await createAppRequestContext();
      const statusResponse = await appRequest.get(
        `/api/workspaces/${workspaceId}/invite-status`,
        {
          failOnStatusCode: false,
          headers: {
            authorization: `Bearer ${appSessionToken}`,
          },
        }
      );

      expect(statusResponse.status()).toBe(200);
      const status = (await statusResponse.json()) as InviteStatusResponse;
      expect(status).toMatchObject({
        invitation: {
          matchedEmail: null,
          source: 'direct',
          type: 'MEMBER',
          workspace: {
            id: workspaceId,
            personal: false,
          },
        },
        status: 'pending_invite',
        workspace: {
          id: workspaceId,
        },
      });

      const listResponse = await appRequest.get('/api/workspaces/invitations', {
        failOnStatusCode: false,
        headers: {
          authorization: `Bearer ${appSessionToken}`,
        },
      });

      expect(listResponse.status()).toBe(200);
      const list = (await listResponse.json()) as InviteListResponse;
      expect(list.invitations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'direct',
            workspace: expect.objectContaining({
              id: workspaceId,
            }),
          }),
        ])
      );
    } finally {
      await appRequest?.dispose();
      await deleteWorkspaceInvitationFixtures(request, workspaceId);
    }
  });

  test('matches pending email invites from the app-session email', async ({
    request,
  }) => {
    const workspaceId = randomUUID();
    const appSessionToken = createCalendarAppSessionToken();
    let appRequest: APIRequestContext | null = null;

    try {
      await createWorkspace(request, workspaceId, 'e2e-email-invite');

      const inviteResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_email_invites`,
        {
          data: {
            email: TEST_USER.email,
            type: 'MEMBER',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders('return=minimal'),
        }
      );
      expect(inviteResponse.status()).toBe(201);

      appRequest = await createAppRequestContext();
      const statusResponse = await appRequest.get(
        `/api/workspaces/${workspaceId}/invite-status`,
        {
          failOnStatusCode: false,
          headers: {
            authorization: `Bearer ${appSessionToken}`,
          },
        }
      );

      expect(statusResponse.status()).toBe(200);
      const status = (await statusResponse.json()) as InviteStatusResponse;
      expect(status).toMatchObject({
        invitation: {
          matchedEmail: TEST_USER.email,
          source: 'email',
          type: 'MEMBER',
          workspace: {
            id: workspaceId,
            personal: false,
          },
        },
        status: 'pending_invite',
        workspace: {
          id: workspaceId,
        },
      });

      const listResponse = await appRequest.get('/api/workspaces/invitations', {
        failOnStatusCode: false,
        headers: {
          authorization: `Bearer ${appSessionToken}`,
        },
      });

      expect(listResponse.status()).toBe(200);
      const list = (await listResponse.json()) as InviteListResponse;
      expect(list.invitations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            matchedEmail: TEST_USER.email,
            source: 'email',
            workspace: expect.objectContaining({
              id: workspaceId,
            }),
          }),
        ])
      );
    } finally {
      await appRequest?.dispose();
      await deleteWorkspaceInvitationFixtures(request, workspaceId);
    }
  });
});
