import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import type { Tables } from '@tuturuuu/types';
import { projectWorkspaceUser } from '@tuturuuu/utils/workspace-user-projection';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: id } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'all';
  const access = await getFinanceRouteContext(
    request,
    id,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;
  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  if (type === 'transaction_creators') {
    const { data, error } = await sbAdmin
      .from('distinct_transaction_creators')
      .select('id, display_name')
      .eq('ws_id', wsId);

    if (error) {
      console.error('Failed to fetch transaction creators:', error);
      return NextResponse.json(
        { message: 'Failed to fetch transaction creators' },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: data ?? [] });
  }

  if (type === 'invoice_creators') {
    const { data, error } = await sbAdmin
      .from('distinct_invoice_creators')
      .select('id, display_name')
      .eq('ws_id', wsId);

    if (error) {
      console.error('Failed to fetch invoice creators:', error);
      return NextResponse.json(
        { message: 'Failed to fetch invoice creators' },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: data ?? [] });
  }

  const readAccess = {
    publicInfo: permissions.containsPermission('view_users_public_info'),
    privateInfo: permissions.containsPermission('view_users_private_info'),
  };
  if (!readAccess.publicInfo && !readAccess.privateInfo) {
    return NextResponse.json({ users: [] });
  }
  const { data, error } = await sbAdmin
    .from('workspace_users')
    .select('id, full_name, display_name, email, avatar_url')
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('Failed to fetch workspace users:', error);
    return NextResponse.json(
      { message: 'Failed to fetch workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    users: (data ?? []).map(
      (
        profile: Pick<
          Tables<'workspace_users'>,
          'id' | 'full_name' | 'display_name' | 'email' | 'avatar_url'
        >
      ) => projectWorkspaceUser(profile, readAccess)
    ),
  });
}
