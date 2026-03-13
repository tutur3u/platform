import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const { searchParams } = new URL(req.url);
  const includedGroups = searchParams.getAll('includedGroups');

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .rpc('get_possible_excluded_groups', {
      _ws_id: wsId,
      included_groups: includedGroups,
    })
    .select('id, name, amount')
    .order('name');

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching possible excluded groups' },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}
