import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
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
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_URL || 'http://localhost:7803';

    const results: Array<{
      ws_id: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const wsId of workspaceIds) {
      try {
        const response = await fetch(
          `${baseUrl}/api/v1/workspaces/${wsId}/calendar/sync`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${cronSecret}`,
            },
            body: JSON.stringify({
              direction: 'inbound',
              source: 'cron',
            }),
          }
        );

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `HTTP ${response.status}`);
        }

        results.push({ ws_id: wsId, success: true });
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
      ok: true,
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
