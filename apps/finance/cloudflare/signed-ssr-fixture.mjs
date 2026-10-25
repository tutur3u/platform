import { createHmac, randomUUID } from 'node:crypto';

export const fixtureUserId = '46cb11ba-cf10-44db-9f66-d47a4fc9df14';
export const fixtureWorkspaceId = 'd9c23fb9-4a0d-4708-bc72-264e02f3c75a';
export const fixtureWorkspaceName = 'Synthetic Finance Workspace';
const user = {
  id: fixtureUserId,
  email: 'finance-native@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: { display_name: 'Finance Native Fixture' },
  created_at: '2026-10-01T00:00:00Z',
};
const workspace = {
  id: fixtureWorkspaceId,
  name: fixtureWorkspaceName,
  creator_id: fixtureUserId,
  personal: false,
  handle: 'native-fixture',
  workspace_members: [{ user_id: fixtureUserId }],
};

export function syntheticSessionHeaders(secret) {
  const token = (app) => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      typ: 'app_coordination',
      iss: 'tuturuuu',
      aud: 'tuturuuu-api',
      sub: fixtureUserId,
      email: user.email,
      origin_app: 'web',
      target_app: app,
      iat: now,
      exp: now + 3600,
      jti: randomUUID(),
      scopes: ['internal-app:session'],
    })}`;
    return `ttr_app_${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  };
  const finance = token('finance');
  return {
    authorization: `Bearer ${finance}`,
    cookie: `tuturuuu_app_session=${finance}; tuturuuu_web_app_session=${token('web')}`,
  };
}

export function signedSsrFixtureResponse(request, calls) {
  const url = new URL(request.url);
  const transactions = `/api/workspaces/${fixtureWorkspaceId}/transactions`;
  if (
    ['finance.tuturuuu.com', 'finance-staging.tuturuuu.com'].includes(
      url.hostname
    ) &&
    url.protocol === 'https:' &&
    request.method === 'GET' &&
    url.pathname === transactions &&
    url.searchParams.size === 2 &&
    url.searchParams.get('itemsPerPage') === '10' &&
    url.searchParams.get('page') === '1' &&
    request.headers.has('authorization')
  ) {
    calls.push(url.pathname);
    return Response.json([]);
  }
  if (
    ['finance.tuturuuu.com', 'finance-staging.tuturuuu.com'].includes(
      url.hostname
    ) &&
    url.protocol === 'https:' &&
    request.method === 'GET' &&
    url.pathname === `/api/workspaces/${fixtureWorkspaceId}/finance/overview` &&
    url.searchParams.size === 2 &&
    url.searchParams.get('includeConfidential') === 'true' &&
    url.searchParams.get('view') === 'date' &&
    request.headers.has('authorization')
  ) {
    calls.push(url.pathname);
    return Response.json({
      categoryCount: 0,
      invoiceCount: 0,
      inventoryPending: [],
      inventoryReconciliation: {
        grossSales: [],
        chargebackReleases: [],
        pending: [],
        providers: [],
        refunds: [],
        chargebackHolds: [],
        netSales: [],
      },
      latestTransactionAt: null,
      netTotal: 0,
      recentExpenseCount: 0,
      recentIncomeCount: 0,
      recentNetTotal: 0,
      recentTotalExpense: 0,
      recentTotalIncome: 0,
      recentTransactionCount: 0,
      totalExpense: 0,
      totalIncome: 0,
      transactionCount: 0,
      walletCount: 0,
    });
  }
  if (
    ![
      'https://finance-fixture.invalid',
      'https://finance-ci.supabase.invalid',
    ].includes(url.origin)
  )
    return null;
  if (request.method !== 'GET') return null;
  if (
    url.pathname === `/auth/v1/admin/users/${fixtureUserId}` ||
    url.pathname === '/auth/v1/user'
  ) {
    calls.push(url.pathname);
    return Response.json({ ...user, user });
  }
  if (
    url.pathname === '/api/v1/users/me/profile' &&
    request.headers.has('authorization')
  ) {
    calls.push(url.pathname);
    return Response.json({
      ...user,
      display_name: 'Finance Native Fixture',
      default_workspace_id: fixtureWorkspaceId,
      avatar_url: null,
      full_name: 'Finance Native Fixture',
      new_email: null,
    });
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const table = url.pathname.slice('/rest/v1/'.length);
    const single = request.headers.get('accept')?.includes('vnd.pgrst.object');
    const fixtures = {
      workspaces: [workspace],
      workspace_members: [
        { ws_id: fixtureWorkspaceId, user_id: fixtureUserId, role: 'MEMBER' },
      ],
      workspace_configs: [],
      workspace_subscription: [],
      workspace_subscriptions: [],
      workspace_products: [],
      workspace_subscription_products: [],
      users: [{ ...user, display_name: 'Finance Native Fixture' }],
      user_private_details: [{ id: fixtureUserId, email: user.email }],
    };
    if (!(table in fixtures)) return null;
    calls.push(url.pathname);
    const rows = fixtures[table];
    return Response.json(single ? (rows[0] ?? null) : rows, {
      headers: {
        'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
      },
    });
  }
  return null;
}
