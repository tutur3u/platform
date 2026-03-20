import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;
  const url = new URL(request.url);
  const page = Number.parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize = Number.parseInt(
    url.searchParams.get('pageSize') ?? '20',
    10
  );

  const permissions = await getPermissions({ wsId, request });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const start = page * pageSize;
  const end = start + pageSize - 1;

  const { data, error } = await supabase
    .from('internal_emails')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error) {
    console.error('Failed to fetch internal emails:', error);
    return NextResponse.json(
      { message: 'Failed to fetch emails' },
      { status: 500 }
    );
  }

  return NextResponse.json({ emails: data ?? [] });
}
