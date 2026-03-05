import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions, normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const supabase = await createClient(req);
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({ wsId: normalizedWsId, request: req });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (permissions.withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase.rpc('get_transaction_count_by_tag', {
    _ws_id: normalizedWsId,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching tag stats' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
