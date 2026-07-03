import { type NextRequest, NextResponse } from 'next/server';
import { getHiveAiCreditStatus, HiveAiAccessError } from '@/lib/hive/ai';
import { requireHiveAccess, serverLogger, withHiveRoute } from '../../_shared';

const ROUTE = '/api/v1/hive/ai/credits';

export async function GET(request: NextRequest) {
  return withHiveRoute(request, ROUTE, async () => {
    const result = await requireHiveAccess(request);
    if (!result.ok) return result.response;

    const wsId = request.nextUrl.searchParams.get('wsId');
    if (!wsId) {
      return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
    }

    try {
      const status = await getHiveAiCreditStatus({
        sbAdmin: result.access.sbAdmin,
        userId: result.access.user.id,
        wsId,
      });

      return NextResponse.json(status);
    } catch (error) {
      if (error instanceof HiveAiAccessError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }

      serverLogger.error('Failed to resolve Hive AI credits', {
        error: error instanceof Error ? error.message : String(error),
        userId: result.access.user.id,
        wsId,
      });
      return NextResponse.json(
        { error: 'Failed to get AI credit status' },
        { status: 500 }
      );
    }
  });
}
