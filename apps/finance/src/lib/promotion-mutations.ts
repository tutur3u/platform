import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import {
  createInternalApiClient,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { NextResponse } from 'next/server';

/** Keep promotion validation, usage limits and commerce sync in Inventory. */
export async function forwardPromotionMutation(
  request: Request,
  wsId: string,
  promotionId?: string
) {
  const access = await getFinanceRouteContext(
    request,
    wsId,
    await resolveFinanceRouteAuthContext(request)
  );
  if (access.response) return access.response;
  const permission =
    request.method === 'POST'
      ? 'create_inventory'
      : request.method === 'DELETE'
        ? 'delete_inventory'
        : 'update_inventory';
  if (access.context.permissions.withoutPermission(permission)) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage promotions' },
      { status: 403 }
    );
  }
  const baseUrl = resolveInternalAppUrl({
    appName: 'inventory',
    candidates: [
      process.env.INVENTORY_APP_URL,
      process.env.NEXT_PUBLIC_INVENTORY_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://inventory.tuturuuu.com'
        : getLocalInternalAppUrl('inventory', 'http://localhost:7815'),
  });
  const client = createInternalApiClient(
    withForwardedInternalApiAuth(request.headers, { baseUrl })
  );
  try {
    const response = await client.fetch(
      `/api/v1/workspaces/${encodeURIComponent(access.context.normalizedWsId)}/promotions${promotionId ? `/${encodeURIComponent(promotionId)}` : ''}`,
      {
        method: request.method,
        headers: { 'Content-Type': 'application/json' },
        body: request.method === 'DELETE' ? undefined : await request.text(),
        cache: 'no-store',
      }
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to reach promotion service', {
      error,
      wsId: access.context.normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Promotion service is unavailable' },
      { status: 502 }
    );
  }
}
