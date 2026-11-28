import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveMailRouteContext } from '@/lib/mail/auth';
import { safeErrorFields, safeLogWorkspaceId } from '@/lib/mail/log-safety';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const auth = await resolveMailRouteContext(request, wsId);
  if (!auth.ok) return auth.response;

  const { normalizedWsId, supabase, user } = auth.context;
  // Replicate the internal_emails RLS contract explicitly because app-session
  // auth uses a service-role client that bypasses Postgres RLS.
  const rootMembership = await verifyWorkspaceMembershipType({
    wsId: ROOT_WORKSPACE_ID,
    userId: user.id,
    supabase,
  });

  if (rootMembership.error === 'membership_lookup_failed') {
    console.error('Failed to verify root workspace membership for mail list', {
      wsId: safeLogWorkspaceId(normalizedWsId),
    });
    return NextResponse.json(
      { message: 'Failed to verify access' },
      { status: 500 }
    );
  }

  if (!rootMembership.ok) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawPage = Number.parseInt(url.searchParams.get('page') ?? '0', 10);
  const rawPageSize = Number.parseInt(
    url.searchParams.get('pageSize') ?? '20',
    10
  );
  const page = Number.isFinite(rawPage) && rawPage >= 0 ? rawPage : 0;
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize >= 1
      ? Math.min(rawPageSize, 100)
      : 20;

  const start = page * pageSize;
  const end = start + pageSize - 1;

  const { data, error } = await supabase
    .from('internal_emails')
    .select('*')
    .eq('ws_id', normalizedWsId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error) {
    console.error('Failed to fetch internal emails', {
      error: safeErrorFields(error),
      wsId: safeLogWorkspaceId(normalizedWsId),
    });
    return NextResponse.json(
      { message: 'Failed to fetch emails' },
      { status: 500 }
    );
  }

  return NextResponse.json({ emails: data ?? [] });
}
