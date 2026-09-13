import { getSatelliteRequestWorkspaceAccess } from '@tuturuuu/satellite/workspace-access';
import { type NextRequest, NextResponse } from 'next/server';

// A subscription projection cannot prove an order was paid or supply its invoice.
// Keep old links working through the permission-checked Polar order history.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await getSatelliteRequestWorkspaceAccess(
    request,
    ['pay', 'platform'],
    wsId
  );
  if (!access) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.redirect(
    new URL(
      `/${encodeURIComponent(access.wsId)}/billing#billing-history`,
      request.url
    ),
    { status: 307, headers: { 'Cache-Control': 'no-store' } }
  );
}
