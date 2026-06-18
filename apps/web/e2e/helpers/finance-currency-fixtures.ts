import { randomUUID } from 'node:crypto';
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
} from '@playwright/test';
import { TEST_USER } from './constants';
import {
  deleteRestRows,
  expectStatus,
  postRestRow,
  SUPABASE_URL,
  serviceHeaders,
} from './supabase-rest';

export interface InvoiceCurrencyFixture {
  customerName: string;
  customerWorkspaceUserId: string;
  financeCategoryId: string;
  operatorWorkspaceUserId: string;
  ownerId: string;
  productCategoryId: string;
  productId: string;
  productName: string;
  roleId: string;
  unitId: string;
  walletId: string;
  warehouseId: string;
  warehouseName: string;
  workspaceId: string;
}

export function createInvoiceCurrencyFixture(): InvoiceCurrencyFixture {
  const workspaceId = randomUUID();
  const suffix = workspaceId.slice(0, 8);

  return {
    customerName: `E2E VND Customer ${suffix}`,
    customerWorkspaceUserId: randomUUID(),
    financeCategoryId: randomUUID(),
    operatorWorkspaceUserId: randomUUID(),
    ownerId: randomUUID(),
    productCategoryId: randomUUID(),
    productId: randomUUID(),
    productName: `E2E VND Product ${suffix}`,
    roleId: randomUUID(),
    unitId: randomUUID(),
    walletId: randomUUID(),
    warehouseId: randomUUID(),
    warehouseName: `E2E VND Warehouse ${suffix}`,
    workspaceId,
  };
}

export async function seedInvoiceCurrencyFixture({
  fixture,
  lowPrivEmail,
  lowPrivUserId,
  request,
}: {
  fixture: InvoiceCurrencyFixture;
  lowPrivEmail: string;
  lowPrivUserId: string;
  request: APIRequestContext;
}) {
  const suffix = fixture.workspaceId.slice(0, 8);

  await postRestRow({
    request,
    table: 'workspaces',
    data: {
      creator_id: TEST_USER.id,
      handle: `e2e-invoice-vnd-${suffix}`,
      id: fixture.workspaceId,
      name: 'E2E Invoice VND Workspace',
      personal: false,
    },
  });
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
      user_id: lowPrivUserId,
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_roles',
    data: {
      id: fixture.roleId,
      name: 'Invoice creator only',
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_role_permissions',
    data: {
      enabled: true,
      permission: 'create_invoices',
      role_id: fixture.roleId,
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'workspace_role_members',
    data: { role_id: fixture.roleId, user_id: lowPrivUserId },
  });
  await postRestRow({
    request,
    table: 'workspace_wallets',
    schema: 'private',
    data: {
      currency: 'VND',
      id: fixture.walletId,
      name: 'E2E VND Wallet',
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
      name: 'E2E VND Revenue',
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
    table: 'workspace_users',
    data: [
      {
        email: lowPrivEmail,
        full_name: 'E2E VND Operator',
        id: fixture.operatorWorkspaceUserId,
        ws_id: fixture.workspaceId,
      },
      {
        email: `e2e-vnd-customer-${suffix}@example.test`,
        full_name: fixture.customerName,
        id: fixture.customerWorkspaceUserId,
        ws_id: fixture.workspaceId,
      },
    ],
  });
  await postRestRow({
    request,
    table: 'workspace_user_linked_users',
    data: {
      platform_user_id: lowPrivUserId,
      virtual_user_id: fixture.operatorWorkspaceUserId,
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    table: 'product_categories',
    data: {
      id: fixture.productCategoryId,
      name: 'E2E VND Products',
      ws_id: fixture.workspaceId,
    },
  });
  await postRestRow({
    request,
    schema: 'private',
    table: 'inventory_owners',
    data: {
      id: fixture.ownerId,
      name: 'E2E VND Owner',
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
      amount: 5,
      price: 2500,
      product_id: fixture.productId,
      unit_id: fixture.unitId,
      warehouse_id: fixture.warehouseId,
    },
  });
}

export async function expectStoredInvoiceRows({
  fixture,
  invoiceId,
  request,
}: {
  fixture: InvoiceCurrencyFixture;
  invoiceId: string | null;
  request: APIRequestContext;
}) {
  expect(invoiceId).toEqual(expect.any(String));
  const invoiceResponse = await request.get(
    `${SUPABASE_URL}/rest/v1/finance_invoices?id=eq.${invoiceId}&select=id,wallet_id,category_id,customer_id,creator_id,paid_amount`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(invoiceResponse.status()).toBe(200);
  await expect(invoiceResponse.json()).resolves.toEqual([
    expect.objectContaining({
      category_id: fixture.financeCategoryId,
      creator_id: fixture.operatorWorkspaceUserId,
      customer_id: fixture.customerWorkspaceUserId,
      id: invoiceId,
      paid_amount: 2500,
      wallet_id: fixture.walletId,
    }),
  ]);

  const productsResponse = await request.get(
    `${SUPABASE_URL}/rest/v1/finance_invoice_products?invoice_id=eq.${invoiceId}&select=product_id,unit_id,warehouse_id,amount,price`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(productsResponse.status()).toBe(200);
  await expect(productsResponse.json()).resolves.toEqual([
    expect.objectContaining({
      amount: 1,
      price: 2500,
      product_id: fixture.productId,
      unit_id: fixture.unitId,
      warehouse_id: fixture.warehouseId,
    }),
  ]);

  const stockResponse = await request.get(
    `${SUPABASE_URL}/rest/v1/product_stock_changes?product_id=eq.${fixture.productId}&select=amount,beneficiary_id,creator_id,unit_id,warehouse_id`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
  expect(stockResponse.status()).toBe(200);
  await expect(stockResponse.json()).resolves.toEqual([
    expect.objectContaining({
      amount: -1,
      beneficiary_id: fixture.customerWorkspaceUserId,
      creator_id: fixture.operatorWorkspaceUserId,
      unit_id: fixture.unitId,
      warehouse_id: fixture.warehouseId,
    }),
  ]);
}

export async function cleanupInvoiceCurrencyFixture({
  fixture,
  invoiceId,
  lowPrivContext,
  request,
}: {
  fixture: InvoiceCurrencyFixture;
  invoiceId: string | null;
  lowPrivContext: BrowserContext;
  request: APIRequestContext;
}) {
  await deleteRestRows({
    request,
    table: 'product_stock_changes',
    filter: `product_id=eq.${fixture.productId}`,
  });
  if (invoiceId) {
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

  const privateTablesBeforePublic = [
    ['inventory_audit_logs', `ws_id=eq.${fixture.workspaceId}`],
    ['inventory_products', `product_id=eq.${fixture.productId}`],
  ] as const;
  const publicTables = [
    ['workspace_products', `id=eq.${fixture.productId}`],
    ['product_categories', `ws_id=eq.${fixture.workspaceId}`],
    ['transaction_categories', `ws_id=eq.${fixture.workspaceId}`],
    ['workspace_configs', `ws_id=eq.${fixture.workspaceId}`],
    ['workspace_user_linked_users', `ws_id=eq.${fixture.workspaceId}`],
    ['workspace_users', `ws_id=eq.${fixture.workspaceId}`],
    ['workspace_role_members', `role_id=eq.${fixture.roleId}`],
    ['workspace_role_permissions', `role_id=eq.${fixture.roleId}`],
    ['workspace_roles', `id=eq.${fixture.roleId}`],
    ['workspace_members', `ws_id=eq.${fixture.workspaceId}`],
  ] as const;
  const privateTablesAfterPublic = [
    ['inventory_owners', `id=eq.${fixture.ownerId}`],
    ['inventory_units', `id=eq.${fixture.unitId}`],
    ['inventory_warehouses', `id=eq.${fixture.warehouseId}`],
    ['workspace_wallets', `id=eq.${fixture.walletId}`],
  ] as const;

  for (const [table, filter] of privateTablesBeforePublic) {
    await deleteRestRows({ request, schema: 'private', table, filter });
  }
  for (const [table, filter] of publicTables) {
    await deleteRestRows({ request, table, filter });
  }
  for (const [table, filter] of privateTablesAfterPublic) {
    await deleteRestRows({ request, schema: 'private', table, filter });
  }
  await deleteRestRows({
    request,
    table: 'workspaces',
    filter: `id=eq.${fixture.workspaceId}`,
  });
  await lowPrivContext.close();
}
