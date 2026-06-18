import { expect, test } from '@playwright/test';
import { formatCurrency } from '@tuturuuu/utils/format';
import { DEFAULT_LOCALE } from './helpers/constants';
import { assertSafeE2EEnvironment } from './helpers/environment';
import {
  cleanupInvoiceCurrencyFixture,
  createInvoiceCurrencyFixture,
  expectStoredInvoiceRows,
  seedInvoiceCurrencyFixture,
} from './helpers/finance-currency-fixtures';
import { markPersonalWorkspaceSubscriptionRepairAttempted } from './helpers/onboarding';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetAppRateLimitStateForTests,
  resetDbRateLimits,
} from './helpers/rate-limits';

function resolveBrowserOrigin(baseURL?: string) {
  const origin = baseURL ?? 'https://tuturuuu.localhost';

  try {
    const url = new URL(origin);
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
      return url.origin;
    }
  } catch {
    return origin;
  }

  return origin;
}

test.describe('Finance invoice currency defaults', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('lets create-only invoice users checkout with workspace VND defaults', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);

    const origin = resolveBrowserOrigin(baseURL);
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 318));
    const fixture = createInvoiceCurrencyFixture();
    const vndAmount = formatCurrency(2500, 'VND');
    const lowPrivEmail = `e2e-invoice-vnd-${Date.now()}@tuturuuu.com`;
    const lowPrivContext = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: headers,
    });
    const lowPrivPage = await lowPrivContext.newPage();
    const browserErrors: string[] = [];
    const failedRequests: string[] = [];
    const consoleMessages: string[] = [];
    lowPrivPage.on('pageerror', (error) => {
      browserErrors.push(error.message);
    });
    lowPrivPage.on('console', (message) => {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
      if (message.type() === 'error') {
        browserErrors.push(message.text());
      }
    });
    lowPrivPage.on('requestfailed', (request) => {
      failedRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`.trim()
      );
    });
    lowPrivPage.on('response', (response) => {
      if (response.status() >= 400) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });
    let invoiceId: string | null = null;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: lowPrivEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await lowPrivPage.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: lowPrivEmail,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(sessionResponse.status()).toBe(200);

      const profileResponse = await lowPrivPage.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(profileResponse.status()).toBe(200);
      const profile = (await profileResponse.json()) as { id?: string };
      expect(profile.id).toEqual(expect.any(String));

      await seedInvoiceCurrencyFixture({
        fixture,
        lowPrivEmail,
        lowPrivUserId: profile.id as string,
        request,
      });
      await markPersonalWorkspaceSubscriptionRepairAttempted(
        lowPrivContext,
        origin
      );

      await lowPrivPage.addInitScript(() => {
        window.localStorage.setItem('printAfterCreate', 'false');
        window.localStorage.setItem('downloadImageAfterCreate', 'false');
        window.localStorage.setItem('createMultipleInvoices', 'false');
      });
      const configsResponsePromise = lowPrivPage.waitForResponse(
        (response) => {
          return (
            response
              .url()
              .includes(
                `/api/v1/workspaces/${fixture.workspaceId}/settings/configs`
              ) &&
            response.url().includes('DEFAULT_CURRENCY') &&
            response.request().method() === 'GET'
          );
        },
        { timeout: 20_000 }
      );

      const localizedInvoicePath = `/${DEFAULT_LOCALE}/${fixture.workspaceId}/finance/invoices/new`;
      const invoicePath = `/${fixture.workspaceId}/finance/invoices/new`;
      const invoicePreflightResponse = await lowPrivPage.request.get(
        `${origin}${localizedInvoicePath}`,
        {
          headers,
          maxRedirects: 0,
        }
      );
      expect(
        invoicePreflightResponse.status(),
        `Unexpected invoice page preflight redirect to ${invoicePreflightResponse.headers().location ?? '<none>'}`
      ).toBeLessThan(400);

      const pageResponse = await lowPrivPage.goto(`${origin}${invoicePath}`, {
        waitUntil: 'domcontentloaded',
      });
      expect(pageResponse?.status()).toBeLessThan(400);

      const currentPath = new URL(lowPrivPage.url()).pathname;
      if (currentPath !== invoicePath) {
        throw new Error(
          `Expected invoice page URL path to be ${invoicePath}, got ${currentPath}`
        );
      }

      const configsResponse = await configsResponsePromise.catch(
        async (error) => {
          const [bodyText, resources] = await Promise.all([
            lowPrivPage
              .locator('body')
              .innerText()
              .catch(() => '<unreadable>'),
            lowPrivPage
              .evaluate(() =>
                performance
                  .getEntriesByType('resource')
                  .map((entry) => entry.name)
                  .filter(
                    (name) =>
                      name.includes('/_next/') ||
                      name.includes('/api/v1/workspaces/')
                  )
                  .slice(-20)
              )
              .catch(() => []),
          ]);

          throw new Error(
            `Timed out waiting for workspace settings config fetch. URL: ${lowPrivPage.url()}. Body: ${bodyText.slice(0, 500) || '<empty>'}. Browser errors: ${browserErrors.join(' | ') || '<none>'}. Failed requests: ${failedRequests.join(' | ') || '<none>'}. Console: ${consoleMessages.slice(-20).join(' | ') || '<none>'}. Resources: ${resources.join(' | ') || '<none>'}. Cause: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      );
      expect(configsResponse.status()).toBe(200);
      await expect(configsResponse.json()).resolves.toEqual(
        expect.objectContaining({
          DEFAULT_CURRENCY: 'VND',
          DEFAULT_SUBSCRIPTION_CATEGORY_ID: fixture.financeCategoryId,
          default_wallet_id: fixture.walletId,
        })
      );

      await expect(lowPrivPage.locator('#customer-select')).toBeVisible();
      await lowPrivPage.locator('#customer-select').click();
      await lowPrivPage
        .getByPlaceholder('Search customers...')
        .fill(fixture.customerName);
      await lowPrivPage
        .getByText(fixture.customerName, { exact: true })
        .click();

      await lowPrivPage
        .locator('button[role="combobox"]')
        .filter({ hasText: 'Search products...' })
        .click();
      await lowPrivPage
        .getByPlaceholder('Search products...')
        .fill(fixture.productName);
      await lowPrivPage
        .getByRole('option')
        .filter({ hasText: fixture.productName })
        .click();
      await expect(lowPrivPage.getByText(fixture.warehouseName)).toBeVisible();
      await expect(lowPrivPage.getByText(vndAmount).first()).toBeVisible();

      await lowPrivPage.getByRole('button', { name: 'Add' }).click();
      await expect(lowPrivPage.locator('body')).toContainText(vndAmount);
      await expect(lowPrivPage.locator('body')).not.toContainText('$2,500');

      const createButton = lowPrivPage.getByRole('button', {
        name: 'Create Invoice',
      });
      await expect(createButton).toBeEnabled();
      const invoiceResponsePromise = lowPrivPage.waitForResponse((response) => {
        return (
          response
            .url()
            .endsWith(
              `/api/v1/workspaces/${fixture.workspaceId}/finance/invoices`
            ) && response.request().method() === 'POST'
        );
      });
      await createButton.click();

      const invoiceResponse = await invoiceResponsePromise;
      expect(invoiceResponse.status()).toBe(200);
      const invoiceBody = (await invoiceResponse.json()) as {
        invoice_id?: string;
      };
      expect(invoiceBody.invoice_id).toEqual(expect.any(String));
      invoiceId = invoiceBody.invoice_id ?? null;

      await expectStoredInvoiceRows({ fixture, invoiceId, request });
    } finally {
      await cleanupInvoiceCurrencyFixture({
        fixture,
        invoiceId,
        lowPrivContext,
        request,
      });
    }
  });
});
