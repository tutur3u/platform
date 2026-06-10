import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { isInventoryEnabled } from '@/lib/inventory/access';
import { getPublicStorefront } from '@/lib/inventory/commerce/public-storefront';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const payload = await getPublicStorefront(slug);

    if (!payload || !(await isInventoryEnabled(payload.storefront.wsId))) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    if (payload.storefront.visibility === 'private') {
      const auth = await resolveSessionAuthContext(request, {
        allowAppSessionAuth: {
          targetApp: ['storefront', 'inventory'],
        },
      });

      if (!auth.ok) return auth.response;

      const membership = await verifyWorkspaceMembershipType({
        supabase: auth.supabase,
        userId: auth.user.id,
        wsId: payload.storefront.wsId,
      });

      if (membership.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { message: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      if (!membership.ok) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json(payload);
  } catch (error) {
    serverLogger.error('Failed to load public inventory storefront', error);
    return NextResponse.json(
      { message: 'Failed to load storefront' },
      { status: 500 }
    );
  }
}
