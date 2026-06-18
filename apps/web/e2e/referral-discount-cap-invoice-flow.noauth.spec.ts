import { randomUUID } from 'node:crypto';
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { formatCurrency } from '@tuturuuu/utils/format';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import { assertSafeE2EEnvironment } from './helpers/environment';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetAppRateLimitStateForTests,
  resetDbRateLimits,
} from './helpers/rate-limits';
import {
  deleteRestRows,
  expectStatus,
  postRestRow,
  SUPABASE_URL,
  serviceHeaders,
} from './helpers/supabase-rest';

const PRODUCT_PRICE = 10_000;
const REFERRAL_COUNTS = [1, 2, 3, 5, 10, 15] as const;
const REFERRAL_PERMISSIONS = [
  'manage_workspace_settings',
  'view_inventory',
  'update_users',
  'create_invoices',
  'create_inventory_sales',
  'view_inventory_catalog',
  'view_inventory_stock',
] as const;

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

function referralPercentFor(count: number) {
  return Math.min(count, 10) * 5;
}

type ReferralInvoiceFixture = {
  candidateUserIds: string[];
  createdPersonalWorkspace: boolean;
  financeCategoryId: string;
  invoiceIds: string[];
  operatorWorkspaceUserId: string;
  ownerId: string;
  personalWorkspaceId: string;
  productCategoryId: string;
  productId: string;
  productName: string;
  referrerEmail: string;
  referrerName: string;
  referrerUserId: string;
  roleId: string;
  unitId: string;
  walletId: string;
  warehouseId: string;
  warehouseName: string;
  workspaceId: string;
};

function createReferralInvoiceFixture(): ReferralInvoiceFixture {
  const workspaceId = randomUUID();
  const suffix = workspaceId.slice(0, 8);

  return {
    candidateUserIds: Array.from({ length: 15 }, () => randomUUID()),
    createdPersonalWorkspace: false,
    financeCategoryId: randomUUID(),
    invoiceIds: [],
    operatorWorkspaceUserId: randomUUID(),
    ownerId: randomUUID(),
    personalWorkspaceId: randomUUID(),
    productCategoryId: randomUUID(),
    productId: randomUUID(),
    productName: `E2E Referral Product ${suffix}`,
    referrerEmail: `e2e-referrer-${suffix}@example.test`,
    referrerName: `E2E Referral Referrer ${suffix}`,
    referrerUserId: randomUUID(),
    roleId: randomUUID(),
    unitId: randomUUID(),
    walletId: randomUUID(),
    warehouseId: randomUUID(),
    warehouseName: `E2E Referral Warehouse ${suffix}`,
    workspaceId,
  };
}

async function seedReferralInvoiceFixture({
  fixture,
  operatorEmail,
  operatorUserId,
  request,
}: {
  fixture: ReferralInvoiceFixture;
  operatorEmail: string;
  operatorUserId: string;
  request: APIRequestContext;
}) {
  const suffix = fixture.workspaceId.slice(0, 8);

  await postRestRow({
    request,
    table: 'workspaces',
    data: {
      creator_id: TEST_USER.id,
      handle: `e2e-referral-cap-${suffix}`,
      id: fixture.workspaceId,
      name: 'E2E Referral Discount Cap',
      personal: false,
    },
  });

  const personalWorkspaceResponse = await request.get(
    `${SUPABASE_URL}/rest/v1/workspaces?creator_id=eq.${operatorUserId}&personal=eq.true&select=id&limit=1`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  await expectStatus(personalWorkspaceResponse, 200);
  const existingPersonalWorkspaces =
    (await personalWorkspaceResponse.json()) as Array<{ id: string }>;
  const existingPersonalWorkspaceId = existingPersonalWorkspaces[0]?.id;

  if (existingPersonalWorkspaceId) {
    fixture.personalWorkspaceId = existingPersonalWorkspaceId;
  } else {
    await postRestRow({
      request,
      table: 'workspaces',
      data: {
        creator_id: operatorUserId,
        handle: `e2e-referral-cap-personal-${suffix}`,
        id: fixture.personalWorkspaceId,
        name: 'E2E Referral Discount Cap Personal',
        personal: true,
      },
    });
    await postRestRow({
      request,
      table: 'workspace_members',
      data: {
        type: 'MEMBER',
        user_id: operatorUserId,
        ws_id: fixture.personalWorkspaceId,
      },
    });
    fixture.createdPersonalWorkspace = true;
  }

  await expectStatus(
    await request.delete(
      `${SUPABASE_URL}/rest/v1/workspace_default_permissions?ws_id=eq.${fixture.workspaceId}`,
      {
        failOnStatusCode: false,
        headers: serviceHeaders({ prefer: 'return=minimal' }),
      }
    ),
    204
  );

  await postRestRow({
    request,
    table: 'workspace_members',
    data: {
      type: 'MEMBER',
      user_id: operatorUserId,
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_roles',
    data: {
      id: fixture.roleId,
      name: 'Referral discount cap operator',
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_role_permissions',
    data: REFERRAL_PERMISSIONS.map((permission) => ({
      enabled: true,
      permission,
      role_id: fixture.roleId,
      ws_id: fixture.workspaceId,
    })),
  });
  await postRestRow({
    request,
    table: 'workspace_role_members',
    data: { role_id: fixture.roleId, user_id: operatorUserId },
  });
  await postRestRow({
    request,
    schema: 'private',
    table: 'workspace_wallets',
    data: {
      currency: 'VND',
      id: fixture.walletId,
      name: 'E2E Referral VND Wallet',
      type: 'STANDARD',
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'transaction_categories',
    data: {
      id: fixture.financeCategoryId,
      is_expense: false,
      name: 'E2E Referral Revenue',
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_configs',
    data: [
      { id: 'DEFAULT_CURRENCY', value: 'VND', ws_id: fixture.workspaceId },
      {
        id: 'default_wallet_id',
        value: fixture.walletId,
        ws_id: fixture.workspaceId,
      },
      {
        id: 'DEFAULT_SUBSCRIPTION_CATEGORY_ID',
        value: fixture.financeCategoryId,
        ws_id: fixture.workspaceId,
      },
    ],
  });
  await postRestRow({
    request,
    table: 'workspace_settings',
    data: {
      referral_count_cap: 1,
      referral_increment_percent: 1,
      referral_reward_type: 'RECEIVER',
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_users',
    data: [
      {
        email: operatorEmail,
        full_name: 'E2E Referral Operator',
        id: fixture.operatorWorkspaceUserId,
        ws_id: fixture.workspaceId,
      },
      {
        email: fixture.referrerEmail,
        full_name: fixture.referrerName,
        id: fixture.referrerUserId,
        ws_id: fixture.workspaceId,
      },
      ...fixture.candidateUserIds.map((id, index) => ({
        email: `e2e-referral-candidate-${suffix}-${index + 1}@example.test`,
        full_name: `E2E Referral Candidate ${index + 1} ${suffix}`,
        id,
        ws_id: fixture.workspaceId,
      })),
    ],
  });
  await postRestRow({
    request,
    table: 'workspace_user_linked_users',
    data: {
      platform_user_id: operatorUserId,
      virtual_user_id: fixture.operatorWorkspaceUserId,
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'product_categories',
    data: {
      id: fixture.productCategoryId,
      name: 'E2E Referral Products',
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    schema: 'private',
    table: 'inventory_owners',
    data: {
      id: fixture.ownerId,
      name: 'E2E Referral Owner',
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_products',
    data: {
      category_id: fixture.productCategoryId,
      finance_category_id: fixture.financeCategoryId,
      id: fixture.productId,
      name: fixture.productName,
      owner_id: fixture.ownerId,
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    schema: 'private',
    table: 'inventory_units',
    data: { id: fixture.unitId, name: 'piece', ws_id: fixture.workspaceId },
  });
  await postRestRow({
    request,
    schema: 'private',
    table: 'inventory_warehouses',
    data: {
      id: fixture.warehouseId,
      name: fixture.warehouseName,
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    schema: 'private',
    table: 'inventory_products',
    data: {
      amount: 30,
      price: PRODUCT_PRICE,
      product_id: fixture.productId,
      unit_id: fixture.unitId,
      warehouse_id: fixture.warehouseId,
    },
  });
}

async function setReferralSettingsInBrowser({
  fixture,
  origin,
  page,
  request,
}: {
  fixture: ReferralInvoiceFixture;
  origin: string;
  page: Page;
  request: APIRequestContext;
}) {
  const settingsFetchPromise = page
    .waitForResponse(
      (apiResponse) =>
        apiResponse
          .url()
          .endsWith(
            `/api/v1/workspaces/${fixture.workspaceId}/promotions/referral-settings`
          ) && apiResponse.request().method() === 'GET',
      { timeout: 20_000 }
    )
    .catch((error: unknown) => error);

  const promotionsPath = `/${fixture.workspaceId}/inventory/promotions`;
  const response = await page.goto(`${origin}${promotionsPath}`, {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBeLessThan(400);

  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== promotionsPath) {
    const bodyText = await page
      .locator('body')
      .innerText({ timeout: 5_000 })
      .catch(() => '<unreadable>');
    throw new Error(
      `Expected promotions page URL path to be ${promotionsPath}, got ${currentPath}. Body: ${bodyText.slice(0, 500) || '<empty>'}`
    );
  }

  const settingsFetchResponse = await settingsFetchPromise;
  if (settingsFetchResponse instanceof Error) {
    throw new Error(
      `Timed out waiting for referral settings fetch on ${page.url()}: ${settingsFetchResponse.message}`
    );
  }
  expect(settingsFetchResponse.status()).toBe(200);

  const settingsButton = page.getByRole('button', { name: 'Settings' });
  await expect(settingsButton).toBeVisible({ timeout: 10_000 });
  await settingsButton.click({ timeout: 10_000 });
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible({
    timeout: 10_000,
  });

  const rewardTypeTrigger = page
    .getByRole('combobox')
    .filter({ hasText: 'Receiver Only' });
  await expect(rewardTypeTrigger).toBeVisible({ timeout: 10_000 });
  await rewardTypeTrigger.click({ timeout: 10_000 });
  await page
    .getByRole('option', { name: 'Referrer Only' })
    .click({ timeout: 10_000 });

  const numberInputs = page.locator('input[type="number"]');
  await numberInputs.nth(0).fill('10');
  await numberInputs.nth(1).fill('5');

  const settingsResponsePromise = page.waitForResponse((apiResponse) => {
    return (
      apiResponse
        .url()
        .endsWith(
          `/api/v1/workspaces/${fixture.workspaceId}/promotions/referral-settings`
        ) && apiResponse.request().method() === 'PUT'
    );
  });
  await page.getByRole('button', { name: 'Save' }).click();
  const settingsResponse = await settingsResponsePromise;
  expect(settingsResponse.status()).toBe(200);

  const settingsRowResponse = await request.get(
    `${SUPABASE_URL}/rest/v1/workspace_settings?ws_id=eq.${fixture.workspaceId}&select=referral_count_cap,referral_increment_percent,referral_reward_type`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(settingsRowResponse.status()).toBe(200);
  await expect(settingsRowResponse.json()).resolves.toEqual([
    {
      referral_count_cap: 10,
      referral_increment_percent: 5,
      referral_reward_type: 'REFERRER',
    },
  ]);
}

async function assignReferralsUntil({
  assignedCount,
  fixture,
  headers,
  origin,
  page,
  targetCount,
}: {
  assignedCount: number;
  fixture: ReferralInvoiceFixture;
  headers: Record<string, string>;
  origin: string;
  page: Page;
  targetCount: number;
}) {
  let nextAssignedCount = assignedCount;

  while (nextAssignedCount < targetCount) {
    const referredUserId = fixture.candidateUserIds[nextAssignedCount];
    expect(referredUserId).toEqual(expect.any(String));

    const response = await page.request.post(
      `${origin}/api/v1/workspaces/${fixture.workspaceId}/users/${fixture.referrerUserId}/referrals`,
      {
        data: { referredUserId },
        failOnStatusCode: false,
        headers,
      }
    );
    expect(response.status(), await response.text()).toBe(200);
    nextAssignedCount += 1;
  }

  return nextAssignedCount;
}

async function expectReferralApiState({
  expectedPercent,
  fixture,
  headers,
  origin,
  page,
  targetCount,
}: {
  expectedPercent: number;
  fixture: ReferralInvoiceFixture;
  headers: Record<string, string>;
  origin: string;
  page: Page;
  targetCount: number;
}) {
  const referralsResponse = await page.request.get(
    `${origin}/api/v1/workspaces/${fixture.workspaceId}/users/${fixture.referrerUserId}/referrals`,
    { failOnStatusCode: false, headers }
  );
  expect(referralsResponse.status()).toBe(200);
  const referrals = (await referralsResponse.json()) as { count?: number };
  expect(referrals.count).toBe(targetCount);

  const discountsResponse = await page.request.get(
    `${origin}/api/v1/workspaces/${fixture.workspaceId}/users/${fixture.referrerUserId}/referral-discounts`,
    { failOnStatusCode: false, headers }
  );
  expect(discountsResponse.status()).toBe(200);
  await expect(discountsResponse.json()).resolves.toEqual([
    expect.objectContaining({
      calculated_discount_value: expectedPercent,
      promo_id: expect.any(String),
    }),
  ]);
}

async function expectStoredInvoiceRows({
  expectedDiscount,
  expectedPercent,
  expectedTotal,
  fixture,
  invoiceId,
  request,
}: {
  expectedDiscount: number;
  expectedPercent: number;
  expectedTotal: number;
  fixture: ReferralInvoiceFixture;
  invoiceId: string;
  request: APIRequestContext;
}) {
  const invoiceResponse = await request.get(
    `${SUPABASE_URL}/rest/v1/finance_invoices?id=eq.${invoiceId}&select=id,wallet_id,category_id,customer_id,creator_id,paid_amount,price,total_diff`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(invoiceResponse.status()).toBe(200);
  await expect(invoiceResponse.json()).resolves.toEqual([
    expect.objectContaining({
      category_id: fixture.financeCategoryId,
      creator_id: fixture.operatorWorkspaceUserId,
      customer_id: fixture.referrerUserId,
      id: invoiceId,
      paid_amount: expectedTotal,
      price: expectedTotal,
      total_diff: 0,
      wallet_id: fixture.walletId,
    }),
  ]);

  const invoiceProductsResponse = await request.get(
    `${SUPABASE_URL}/rest/v1/finance_invoice_products?invoice_id=eq.${invoiceId}&select=product_id,unit_id,warehouse_id,amount,price`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(invoiceProductsResponse.status()).toBe(200);
  await expect(invoiceProductsResponse.json()).resolves.toEqual([
    expect.objectContaining({
      amount: 1,
      price: PRODUCT_PRICE,
      product_id: fixture.productId,
      unit_id: fixture.unitId,
      warehouse_id: fixture.warehouseId,
    }),
  ]);

  const invoicePromotionsResponse = await request.get(
    `${SUPABASE_URL}/rest/v1/finance_invoice_promotions?invoice_id=eq.${invoiceId}&select=promo_id,value,use_ratio,name`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(invoicePromotionsResponse.status()).toBe(200);
  await expect(invoicePromotionsResponse.json()).resolves.toEqual([
    expect.objectContaining({
      name: 'Referral',
      promo_id: expect.any(String),
      use_ratio: true,
      value: expectedPercent,
    }),
  ]);

  const stockResponse = await request.get(
    `${SUPABASE_URL}/rest/v1/product_stock_changes?product_id=eq.${fixture.productId}&select=amount,beneficiary_id,creator_id,unit_id,warehouse_id`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(stockResponse.status()).toBe(200);
  const stockRows = (await stockResponse.json()) as Array<{
    amount: number;
    beneficiary_id: string | null;
    creator_id: string | null;
    unit_id: string | null;
    warehouse_id: string | null;
  }>;
  expect(stockRows).toHaveLength(fixture.invoiceIds.length);
  expect(stockRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        amount: -1,
        beneficiary_id: fixture.referrerUserId,
        creator_id: fixture.operatorWorkspaceUserId,
        unit_id: fixture.unitId,
        warehouse_id: fixture.warehouseId,
      }),
    ])
  );

  expect(expectedDiscount).toBe(PRODUCT_PRICE - expectedTotal);
}

async function createInvoiceForReferralCount({
  context,
  expectedPercent,
  fixture,
  origin,
  request,
}: {
  context: BrowserContext;
  expectedPercent: number;
  fixture: ReferralInvoiceFixture;
  origin: string;
  request: APIRequestContext;
}) {
  const invoicePage = await context.newPage();
  const expectedDiscount = (PRODUCT_PRICE * expectedPercent) / 100;
  const expectedTotal = PRODUCT_PRICE - expectedDiscount;
  const subtotalText = formatCurrency(PRODUCT_PRICE, 'VND');
  const discountText = `-${formatCurrency(expectedDiscount, 'VND')}`;
  const totalText = formatCurrency(expectedTotal, 'VND');

  try {
    const pageResponse = await invoicePage.goto(
      `${origin}/${fixture.workspaceId}/finance/invoices/new`,
      { waitUntil: 'domcontentloaded' }
    );
    expect(pageResponse?.status()).toBeLessThan(400);

    await expect(invoicePage.locator('#customer-select')).toBeVisible();
    await invoicePage.locator('#customer-select').click();
    await invoicePage
      .getByPlaceholder('Search customers...')
      .fill(fixture.referrerName);
    await invoicePage.getByText(fixture.referrerName, { exact: true }).click();

    await invoicePage
      .locator('button[role="combobox"]')
      .filter({ hasText: 'Search products...' })
      .click();
    await invoicePage
      .getByPlaceholder('Search products...')
      .fill(fixture.productName);
    await invoicePage
      .getByRole('option')
      .filter({ hasText: fixture.productName })
      .click();
    await expect(invoicePage.getByText(fixture.warehouseName)).toBeVisible();
    await expect(invoicePage.getByText(subtotalText).first()).toBeVisible();

    const linkedPromotionsResponsePromise = invoicePage.waitForResponse(
      (apiResponse) =>
        apiResponse
          .url()
          .endsWith(
            `/api/v1/workspaces/${fixture.workspaceId}/users/${fixture.referrerUserId}/linked-promotions`
          ) && apiResponse.request().method() === 'GET'
    );
    const referralDiscountsResponsePromise = invoicePage.waitForResponse(
      (apiResponse) =>
        apiResponse
          .url()
          .endsWith(
            `/api/v1/workspaces/${fixture.workspaceId}/users/${fixture.referrerUserId}/referral-discounts`
          ) && apiResponse.request().method() === 'GET'
    );

    await invoicePage.getByRole('button', { name: 'Add' }).click();

    const [linkedPromotionsResponse, referralDiscountsResponse] =
      await Promise.all([
        linkedPromotionsResponsePromise,
        referralDiscountsResponsePromise,
      ]);
    expect(linkedPromotionsResponse.status()).toBe(200);
    expect(referralDiscountsResponse.status()).toBe(200);
    await expect(referralDiscountsResponse.json()).resolves.toEqual([
      expect.objectContaining({
        calculated_discount_value: expectedPercent,
        promo_id: expect.any(String),
      }),
    ]);

    await expect(invoicePage.locator('body')).toContainText(
      `Referral (${expectedPercent}%)`
    );
    await expect(invoicePage.locator('body')).toContainText(discountText);
    await expect(invoicePage.locator('body')).toContainText(totalText);

    const invoiceResponsePromise = invoicePage.waitForResponse(
      (apiResponse) => {
        return (
          apiResponse
            .url()
            .endsWith(
              `/api/v1/workspaces/${fixture.workspaceId}/finance/invoices`
            ) && apiResponse.request().method() === 'POST'
        );
      }
    );
    const createButton = invoicePage.getByRole('button', {
      name: 'Create Invoice',
    });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    const invoiceResponse = await invoiceResponsePromise;
    expect(invoiceResponse.status()).toBe(200);
    const invoiceBody = (await invoiceResponse.json()) as {
      data?: {
        discount_amount?: number;
        subtotal?: number;
        total?: number;
      };
      invoice_id?: string;
    };
    expect(invoiceBody.invoice_id).toEqual(expect.any(String));
    expect(invoiceBody.data).toEqual(
      expect.objectContaining({
        discount_amount: expectedDiscount,
        subtotal: PRODUCT_PRICE,
        total: expectedTotal,
      })
    );

    const invoiceId = invoiceBody.invoice_id as string;
    fixture.invoiceIds.push(invoiceId);
    await expectStoredInvoiceRows({
      expectedDiscount,
      expectedPercent,
      expectedTotal,
      fixture,
      invoiceId,
      request,
    });
  } finally {
    await invoicePage.close();
  }
}

async function cleanupReferralInvoiceFixture({
  context,
  fixture,
  request,
}: {
  context: BrowserContext;
  fixture: ReferralInvoiceFixture;
  request: APIRequestContext;
}) {
  await deleteRestRows({
    request,
    table: 'product_stock_changes',
    filter: `product_id=eq.${fixture.productId}`,
  });

  for (const invoiceId of fixture.invoiceIds) {
    await deleteRestRows({
      request,
      table: 'finance_invoice_promotions',
      filter: `invoice_id=eq.${invoiceId}`,
    });
    await deleteRestRows({
      request,
      table: 'finance_invoice_products',
      filter: `invoice_id=eq.${invoiceId}`,
    });
    await deleteRestRows({
      request,
      table: 'finance_invoices',
      filter: `id=eq.${invoiceId}`,
    });
  }

  const allWorkspaceUserIds = [
    fixture.operatorWorkspaceUserId,
    fixture.referrerUserId,
    ...fixture.candidateUserIds,
  ];
  await deleteRestRows({
    request,
    schema: 'private',
    table: 'user_linked_promotions',
    filter: `user_id=in.(${allWorkspaceUserIds.join(',')})`,
  });
  await deleteRestRows({
    request,
    schema: 'private',
    table: 'workspace_promotions',
    filter: `ws_id=eq.${fixture.workspaceId}`,
  });
  await deleteRestRows({
    request,
    schema: 'private',
    table: 'inventory_audit_logs',
    filter: `ws_id=eq.${fixture.workspaceId}`,
  });
  await deleteRestRows({
    request,
    schema: 'private',
    table: 'inventory_products',
    filter: `product_id=eq.${fixture.productId}`,
  });

  const publicTables = [
    ['workspace_products', `id=eq.${fixture.productId}`],
    ['product_categories', `ws_id=eq.${fixture.workspaceId}`],
    ['transaction_categories', `ws_id=eq.${fixture.workspaceId}`],
    ['workspace_configs', `ws_id=eq.${fixture.workspaceId}`],
    ['workspace_settings', `ws_id=eq.${fixture.workspaceId}`],
    ['workspace_user_linked_users', `ws_id=eq.${fixture.workspaceId}`],
    ['workspace_users', `ws_id=eq.${fixture.workspaceId}`],
    ['workspace_role_members', `role_id=eq.${fixture.roleId}`],
    ['workspace_role_permissions', `role_id=eq.${fixture.roleId}`],
    ['workspace_roles', `id=eq.${fixture.roleId}`],
    ['workspace_members', `ws_id=eq.${fixture.workspaceId}`],
  ] as const;
  for (const [table, filter] of publicTables) {
    await deleteRestRows({ request, table, filter });
  }

  const privateTables = [
    ['inventory_owners', `id=eq.${fixture.ownerId}`],
    ['inventory_units', `id=eq.${fixture.unitId}`],
    ['inventory_warehouses', `id=eq.${fixture.warehouseId}`],
    ['workspace_wallets', `id=eq.${fixture.walletId}`],
  ] as const;
  for (const [table, filter] of privateTables) {
    await deleteRestRows({ request, schema: 'private', table, filter });
  }

  await deleteRestRows({
    request,
    table: 'workspaces',
    filter: `id=eq.${fixture.workspaceId}`,
  });
  if (fixture.createdPersonalWorkspace) {
    await deleteRestRows({
      request,
      table: 'workspace_members',
      filter: `ws_id=eq.${fixture.personalWorkspaceId}`,
    });
    await deleteRestRows({
      request,
      table: 'workspaces',
      filter: `id=eq.${fixture.personalWorkspaceId}`,
    });
  }

  await context.close();
}

test.describe('Referral discount cap invoice flow', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('sets referral discount cap and applies capped invoice discounts through checkout', async ({
    baseURL,
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(240_000);

    const origin = resolveBrowserOrigin(baseURL);
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 337));
    const fixture = createReferralInvoiceFixture();
    const operatorEmail = `e2e-referral-cap-${Date.now()}@tuturuuu.com`;
    const context = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: headers,
    });
    const page = await context.newPage();
    let assignedCount = 0;

    try {
      await resetDbRateLimits();
      await resetAppRateLimitStateForTests(request, {
        completeOnboarding: true,
        email: operatorEmail,
        headers,
        locale: DEFAULT_LOCALE,
      });

      const sessionResponse = await page.request.post(
        `${origin}/api/auth/dev-session`,
        {
          data: {
            completeOnboarding: true,
            email: operatorEmail,
            locale: DEFAULT_LOCALE,
          },
          headers,
        }
      );
      expect(sessionResponse.status()).toBe(200);

      const profileResponse = await page.request.get(
        `${origin}/api/v1/users/me/profile`,
        { headers }
      );
      expect(profileResponse.status()).toBe(200);
      const profile = (await profileResponse.json()) as { id?: string };
      expect(profile.id).toEqual(expect.any(String));

      await seedReferralInvoiceFixture({
        fixture,
        operatorEmail,
        operatorUserId: profile.id as string,
        request,
      });

      await context.addInitScript(() => {
        window.localStorage.setItem('printAfterCreate', 'false');
        window.localStorage.setItem('downloadImageAfterCreate', 'false');
        window.localStorage.setItem('createMultipleInvoices', 'false');
      });

      await setReferralSettingsInBrowser({
        fixture,
        origin,
        page,
        request,
      });

      for (const targetCount of REFERRAL_COUNTS) {
        assignedCount = await assignReferralsUntil({
          assignedCount,
          fixture,
          headers,
          origin,
          page,
          targetCount,
        });

        const expectedPercent = referralPercentFor(targetCount);
        await expectReferralApiState({
          expectedPercent,
          fixture,
          headers,
          origin,
          page,
          targetCount,
        });
        await createInvoiceForReferralCount({
          context,
          expectedPercent,
          fixture,
          origin,
          request,
        });
      }

      expect(assignedCount).toBe(15);
      await expectReferralApiState({
        expectedPercent: 50,
        fixture,
        headers,
        origin,
        page,
        targetCount: 15,
      });
    } finally {
      await cleanupReferralInvoiceFixture({ context, fixture, request });
    }
  });
});
