import { type NextRequest, NextResponse } from 'next/server';
import { resolveMailRouteContext } from '@/lib/mail/auth';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const auth = await resolveMailRouteContext(request, wsId);
  if (!auth.ok) return auth.response;

  const { normalizedWsId, supabase } = auth.context;
  const url = new URL(request.url);
  const page = Number.parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize = Number.parseInt(
    url.searchParams.get('pageSize') ?? '20',
    10
  );

  const start = page * pageSize;
  const end = start + pageSize - 1;

  const { data, error } = await supabase
    .from('internal_emails')
    .select('*')
    .eq('ws_id', normalizedWsId)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error) {
    console.error('Failed to fetch internal emails', {
      error,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to fetch emails' },
      { status: 500 }
    );
  }

  return NextResponse.json({ emails: data ?? [] });
}
