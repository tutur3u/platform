import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';
import { POST as syncWorkspaceCalendar } from '@/app/api/v1/workspaces/[wsId]/calendar/sync/route';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';

export async function GET(request: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'calendar-provider-sync',
      path: '/api/cron/calendar/provider-sync',
      request: request,
    },
    () => handleGET(request)
  );
}

async function handleGET(request: NextRequest) {
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
      { status: 500 }
    );
  }

  if (request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const { data: tokenRows, error } = await sbAdmin
      .from('calendar_auth_tokens')
      .select('ws_id')
      .eq('is_active', true);

    if (error) {
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch connected workspaces' },
        { status: 500 }
      );
    }

    const workspaceIds = [
      ...new Set((tokenRows ?? []).map((row) => row.ws_id)),
    ];

    const results: Array<{
      ws_id: string;
      success: boolean;
      summary?: unknown;
      error?: string;
    }> = [];

    for (const wsId of workspaceIds) {
      try {
        const response = await syncWorkspaceCalendar(
          new NextRequest(
            new URL(`/api/v1/workspaces/${wsId}/calendar/sync`, request.url),
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cronSecret}`,
              },
              body: JSON.stringify({ direction: 'inbound', source: 'cron' }),
            }
          ),
          { params: Promise.resolve({ wsId }) }
        );

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `HTTP ${response.status}`);
        }

        const body = await response.json().catch(() => null);

        results.push({
          ws_id: wsId,
          success: body?.ok !== false,
          summary: body?.summary ?? null,
          ...(body?.ok === false
            ? { error: body.code || 'Calendar sync partially failed' }
            : {}),
        });
      } catch (syncError) {
        results.push({
          ws_id: wsId,
          success: false,
          error:
            syncError instanceof Error ? syncError.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      ok: results.every((result) => result.success),
      processed: workspaceIds.length,
      successful: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
