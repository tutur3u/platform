import {
  AiCreditsStatusError,
  getAiCreditsStatus,
} from '@tuturuuu/payment-core';
import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { resolveWorkspaceIdForPrincipal } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: rawWsId } = await params;
    const actor = await resolveSatelliteRequestActor(request, [
      'pay',
      'platform',
    ]);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { admin: accessClient, user } = actor;
    const wsId = await resolveWorkspaceIdForPrincipal({
      authorizationClient: accessClient,
      principal: { email: user.email ?? null, id: user.id },
      wsId: rawWsId,
    });
    const status = await getAiCreditsStatus({
      accessClient,
      userId: user.id,
      wsId,
    });

    return NextResponse.json(status, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    });
  } catch (error) {
    if (error instanceof AiCreditsStatusError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('Error in Pay AI credits route:', error);
    return NextResponse.json(
      { error: 'Failed to get AI credit status' },
      { status: 500 }
    );
  }
}
