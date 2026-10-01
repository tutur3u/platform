import { instant } from '@next/playwright';
import { expect, test } from '@playwright/test';
import {
  createStorefrontCacheFixture,
  deleteStorefrontCacheFixture,
  INVENTORY_URL,
} from './helpers/storefront-cache-fixture';
import { captureStorefrontSlotDiagnostics } from './helpers/storefront-slot-diagnostics';

const STOREFRONT_URL = 'http://localhost:7822';

test('invalidates cached availability and preserves the shared storefront shell', async ({
  page,
  request,
}, testInfo) => {
  const fixture = await createStorefrontCacheFixture(request);
  let finishSlotDiagnostics = async () => {};

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => {
    if (browserErrors.length < 20)
      browserErrors.push(error.stack ?? error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && browserErrors.length < 20) {
      browserErrors.push(message.text());
    }
  });

  try {
    const storefrontUrl = `${INVENTORY_URL}/api/v1/inventory/storefronts/${fixture.slug}`;
    const firstRead = await request.get(storefrontUrl);
    const cachedRead = await request.get(storefrontUrl);
    expect(firstRead.ok()).toBe(true);
    expect(cachedRead.ok()).toBe(true);
    expect((await firstRead.json()).listings[0].availableQuantity).toBe(4);
    expect((await cachedRead.json()).listings[0].availableQuantity).toBe(4);

    const stockUpdate = await request.patch(
      `${INVENTORY_URL}/api/v1/workspaces/${fixture.workspaceId}/products/${fixture.productId}/inventory`,
      {
        data: {
          inventory: [
            {
              amount: 2,
              price: 20,
              revenue_share_bps: 0,
              unit_id: fixture.unitId,
              warehouse_id: fixture.warehouseId,
            },
          ],
        },
        failOnStatusCode: false,
        headers: { authorization: `Bearer ${fixture.accessToken}` },
      }
    );
    expect(stockUpdate.ok(), await stockUpdate.text()).toBe(true);

    const invalidatedRead = await request.get(storefrontUrl);
    expect(invalidatedRead.ok()).toBe(true);
    const invalidatedPayload = await invalidatedRead.json();
    expect(invalidatedPayload.listings[0].availableQuantity).toBe(2);

    const streamedProductPage = await request.get(
      `${STOREFRONT_URL}/${fixture.slug}/products/${invalidatedPayload.listings[0].id}`
    );
    expect(streamedProductPage.ok()).toBe(true);
    expect(await streamedProductPage.text()).toContain('data-storefront-shell');

    // Compile the destination route before freezing an instant navigation.
    // The contract here is client-side shell persistence, not cold dev compile.
    const streamedBrowsePage = await request.get(
      `${STOREFRONT_URL}/${fixture.slug}`
    );
    expect(streamedBrowsePage.ok()).toBe(true);
    expect(await streamedBrowsePage.text()).toContain('Cache Test Product');

    let documentRequests = 0;
    page.on('request', (requestEvent) => {
      if (requestEvent.resourceType() === 'document') documentRequests += 1;
    });
    finishSlotDiagnostics = await captureStorefrontSlotDiagnostics(
      page,
      testInfo
    ).catch(() => async () => {});
    await page.goto(
      `/${fixture.slug}/products/${invalidatedPayload.listings[0].id}`
    );
    await expect(
      page.getByRole('heading', { name: 'Cache Test Store' })
    ).toBeVisible();
    const storefrontShell = page.locator('[data-storefront-shell]');
    await storefrontShell.evaluate((element) => {
      Reflect.set(element, '__storefrontNavigationProbe', 'persistent');
    });
    await instant(page, async () => {
      await page.getByRole('link', { name: 'Browse' }).click();
      await expect(storefrontShell).toHaveJSProperty(
        '__storefrontNavigationProbe',
        'persistent'
      );
      await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
    });
    await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/?$`, 'u'));
    await expect(
      page.getByText('Cache Test Product').filter({ visible: true })
    ).toBeVisible();
    expect(documentRequests).toBe(1);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath('storefront-client-navigation.png'),
    });
  } catch (error) {
    // Capture after the failed assertion: the boundary can appear after URL commit.
    // Diagnostic failures must not replace the original contract failure.
    try {
      const recoveryDetails = await page
        .locator('details pre')
        .allTextContents();
      const redact = (value: string) =>
        value
          .replace(/Bearer\s+\S+/giu, 'Bearer [redacted]')
          .replace(
            /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu,
            '[redacted JWT]'
          );
      await testInfo.attach('storefront-navigation-errors', {
        body: Buffer.from(
          JSON.stringify(
            {
              browserErrors: browserErrors.map(redact),
              recoveryDetails: recoveryDetails.map(redact),
            },
            null,
            2
          )
        ),
        contentType: 'application/json',
      });
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath('storefront-navigation-failure.png'),
      });
    } catch {
      // The retained trace still captures failures if the page has closed.
    }
    throw error;
  } finally {
    await finishSlotDiagnostics().catch(() => undefined);
    await deleteStorefrontCacheFixture(request, fixture);
  }
});
