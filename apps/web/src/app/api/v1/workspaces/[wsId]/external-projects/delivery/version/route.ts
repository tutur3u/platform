import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { isWorkspaceUuidLiteral } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL } from '@/lib/external-projects/cache';
import { isDeliveryStateMissing } from '@/lib/external-projects/delivery-state';
import { deliveryVersionMemo } from '@/lib/external-projects/delivery-version';

const headers = { 'Cache-Control': EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const workspaceId = resolveWorkspaceId(wsId);
  if (!isWorkspaceUuidLiteral(workspaceId))
    return NextResponse.json(
      { error: 'Invalid workspace ID' },
      { headers, status: 400 }
    );

  try {
    return NextResponse.json(
      { version: await deliveryVersionMemo.get(workspaceId) },
      { headers }
    );
  } catch (error) {
    if (isDeliveryStateMissing(error))
      return NextResponse.json(
        { error: 'Delivery version unavailable' },
        { headers, status: 503 }
      );
    console.error(
      'Failed to read the external project delivery version',
      error
    );
    return NextResponse.json(
      { error: 'Failed to read the external project delivery version' },
      { headers, status: 500 }
    );
  }
}
