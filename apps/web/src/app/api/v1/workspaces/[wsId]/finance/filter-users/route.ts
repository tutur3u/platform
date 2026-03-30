import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions, normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId: id } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'all';

  const wsId = await normalizeWorkspaceId(id, supabase);

  const permissions = await getPermissions({ wsId, request });

  if (!permissions || permissions.withoutPermission('view_transactions')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();

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

  const { data, error } = await supabase
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

  return NextResponse.json({ users: data ?? [] });
}
