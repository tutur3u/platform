import { expect, test } from '@playwright/test';
import { assertSafeContactsE2EEnvironment } from './helpers/environment';

const LOCAL_WEB_APP_URL = 'http://localhost:7803';

test.describe('Contacts shared user profile links', () => {
  assertSafeContactsE2EEnvironment();

  test('sends an anonymous external user to the public web profile form', async ({
    request,
  }) => {
    const response = await request.get(
      '/shared/user-profile/external-user-e2e?source=contacts',
      {
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    );

    expect(response.status()).toBe(307);

    const location = response.headers().location;
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location ?? '', LOCAL_WEB_APP_URL);

    expect(redirectUrl.origin).toBe(LOCAL_WEB_APP_URL);
    expect(redirectUrl.pathname).toBe('/shared/user-profile/external-user-e2e');
    expect(redirectUrl.searchParams.get('source')).toBe('contacts');
    expect(redirectUrl.pathname).not.toContain('/login');
  });
});
