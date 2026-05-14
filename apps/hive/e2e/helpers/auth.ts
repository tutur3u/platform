import type { APIResponse, Page } from '@playwright/test';
import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionToken,
} from '@tuturuuu/auth/app-session';
import {
  DEFAULT_LOCALE,
  HIVE_BASE_URL,
  TEST_USER,
  WEB_BASE_URL,
} from './constants';

const LOCAL_APP_COORDINATION_SECRET = 'local-e2e-app-coordination-secret';

function getSessionCookies(response: APIResponse) {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => {
      const [nameValue, ...attributes] = header.value.split(';');
      const separatorIndex = nameValue?.indexOf('=') ?? -1;

      if (!nameValue || separatorIndex < 1) return null;

      const sameSiteAttribute = attributes
        .map((attribute) => attribute.trim().toLowerCase())
        .find((attribute) => attribute.startsWith('samesite='));
      const sameSite = sameSiteAttribute?.endsWith('none')
        ? 'None'
        : sameSiteAttribute?.endsWith('strict')
          ? 'Strict'
          : 'Lax';

      return {
        httpOnly: attributes.some(
          (attribute) => attribute.trim().toLowerCase() === 'httponly'
        ),
        name: nameValue.slice(0, separatorIndex),
        path: '/',
        sameSite,
        secure: attributes.some(
          (attribute) => attribute.trim().toLowerCase() === 'secure'
        ),
        value: nameValue.slice(separatorIndex + 1),
      } as const;
    })
    .filter((cookie) => cookie !== null);
}

export async function authenticateHiveTestUser(page: Page) {
  const response = await page.request.post(
    `${WEB_BASE_URL}/api/auth/dev-session`,
    {
      data: {
        email: TEST_USER.email,
        locale: DEFAULT_LOCALE,
      },
      failOnStatusCode: false,
    }
  );

  if (!response.ok()) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Hive E2E dev session failed with status ${response.status()}: ${body}`
    );
  }

  const sessionCookies = getSessionCookies(response);
  const hiveHost = new URL(HIVE_BASE_URL).hostname;

  if (sessionCookies.length > 0) {
    await page.context().addCookies(
      sessionCookies.map((cookie) => ({
        ...cookie,
        domain: hiveHost,
        path: '/',
      }))
    );
  }

  const { claims, token } = createAppSessionToken(
    {
      email: TEST_USER.email,
      originApp: 'web',
      targetApp: 'hive',
      userId: TEST_USER.id,
    },
    {
      secret:
        process.env.TUTURUUU_APP_COORDINATION_SECRET ??
        process.env.APP_COORDINATION_TOKEN_SECRET ??
        LOCAL_APP_COORDINATION_SECRET,
    }
  );

  await page.context().addCookies([
    {
      domain: hiveHost,
      expires: claims.exp,
      httpOnly: true,
      name: APP_SESSION_COOKIE_NAME,
      path: '/',
      sameSite: 'Lax',
      secure: false,
      value: token,
    },
  ]);

  const backfillResponse = await page.request.post(
    `${WEB_BASE_URL}/api/v1/hive/backfill`,
    {
      failOnStatusCode: false,
      headers: {
        cookie: `${APP_SESSION_COOKIE_NAME}=${token}`,
      },
    }
  );

  if (!backfillResponse.ok()) {
    const body = await backfillResponse.text().catch(() => '');
    throw new Error(
      `Hive E2E backfill failed with status ${backfillResponse.status()}: ${body}`
    );
  }
}
