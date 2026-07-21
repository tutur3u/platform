import { instant } from '@next/playwright';
import { expect, test } from '@playwright/test';
import {
  createStorefrontCacheFixture,
  deleteStorefrontCacheFixture,
  INVENTORY_URL,
} from './helpers/storefront-cache-fixture';

const STOREFRONT_URL = 'http://localhost:7822';

test('invalidates cached availability and preserves the shared storefront shell', async ({
  page,
  request,
}, testInfo) => {
  const fixture = await createStorefrontCacheFixture(request);

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

    let documentRequests = 0;
    page.on('request', (requestEvent) => {
      if (requestEvent.resourceType() === 'document') documentRequests += 1;
    });
    await page.goto(
      `/${fixture.slug}/products/${invalidatedPayload.listings[0].id}`
    );
    await expect(
      page.getByRole('heading', { name: 'Cache Test Store' })
    ).toBeVisible();
    const storefrontShell = page.locator('[data-storefront-shell]');
    await storefrontShell.evaluate((element) => {
      element.dataset.navigationProbe = 'persistent';
    });
    await instant(page, async () => {
      await page.getByRole('link', { name: 'Browse' }).click();
      await expect(
        page.locator(
          '[data-storefront-shell][data-navigation-probe="persistent"]'
        )
      ).toBeVisible();
      await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
    });
    await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/?$`, 'u'));
    await expect(page.getByText('Cache Test Product').first()).toBeVisible();
    expect(documentRequests).toBe(1);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath('storefront-client-navigation.png'),
    });
  } finally {
    await deleteStorefrontCacheFixture(request, fixture);
  }
});
