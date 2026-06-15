import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  getCmsWorkspaceAccess,
  hasCmsCommerceFinanceOverviewPermission,
} from '@/lib/external-projects/access';

export interface CmsCommerceOverview {
  collected: number;
  orders: number;
  revenue: number;
}

/**
 * CMS-owned commerce snapshot — a deep integration with apps/finance.
 *
 * The web finance API authenticates via the web app's own session, which the
 * satellite CMS does not carry (cross-app calls 401). Instead, this route reads
 * the finance invoices for the workspace via the admin client, authorized by the
 * CMS workspace-access layer (the satellite session). It returns aggregate
 * revenue/orders so the dashboard can surface commerce activity without exposing
 * the web finance endpoints to cross-app auth.
 */
export async function GET(request: Request) {
  const wsId = new URL(request.url).searchParams.get('wsId');
  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  const access = await getCmsWorkspaceAccess(wsId);
  if (
    !access.canAccessWorkspace ||
    !hasCmsCommerceFinanceOverviewPermission(access.workspacePermissions)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const { data, error } = await admin
      .from('finance_invoices')
      .select('price, paid_amount')
      .eq('ws_id', access.normalizedWorkspaceId);

    if (error) {
      throw new Error(error.message);
    }

    const invoices = data ?? [];
    const overview: CmsCommerceOverview = {
      collected: invoices.reduce((sum, row) => sum + (row.paid_amount ?? 0), 0),
      orders: invoices.length,
      revenue: invoices.reduce((sum, row) => sum + (row.price ?? 0), 0),
    };

    return NextResponse.json(overview);
  } catch {
    return NextResponse.json(
      { error: 'Failed to load commerce overview' },
      { status: 500 }
    );
  }
}
