import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const sbAdmin = await createAdminClient();

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '0', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

  const start = page * pageSize;
  const end = start + pageSize - 1;

  const { data, error, count } = await sbAdmin
    .from('sent_emails')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .eq('receiver_id', userId)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching sent emails' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0 });
}
