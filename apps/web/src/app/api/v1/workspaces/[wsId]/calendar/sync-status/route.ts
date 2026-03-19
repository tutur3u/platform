import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { classifyCalendarSyncHealth } from '@/lib/calendar/sync-health';

interface RouteParams {
  wsId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId } = await params;

    if (!validate(wsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view sync status' },
        { status: 401 }
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const [accountsResult, connectionsResult, dashboardResult] =
      await Promise.all([
        supabase
          .from('calendar_auth_tokens')
          .select('id, provider, account_email, account_name, expires_at')
          .eq('ws_id', wsId)
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('calendar_connections')
          .select('id, auth_token_id, calendar_id, calendar_name, is_enabled')
          .eq('ws_id', wsId)
          .order('created_at', { ascending: true }),
        supabase
          .from('calendar_sync_dashboard')
          .select(
            'status, start_time, end_time, error_message, error_type, cooldown_remaining_seconds'
          )
          .eq('ws_id', wsId)
          .order('start_time', { ascending: false })
          .limit(10),
      ]);

    if (
      accountsResult.error ||
      connectionsResult.error ||
      dashboardResult.error
    ) {
      return NextResponse.json(
        { error: 'Failed to load sync status' },
        { status: 500 }
      );
    }

    const accounts = accountsResult.data ?? [];
    const connections = connectionsResult.data ?? [];
    const health = classifyCalendarSyncHealth({
      accounts: accounts.map((account) => ({
        provider: account.provider as 'google' | 'microsoft',
        expires_at: account.expires_at,
      })),
      recentRuns: dashboardResult.data ?? [],
    });

    return NextResponse.json({
      health,
      accountsSummary: {
        total: accounts.length,
        google: accounts.filter((account) => account.provider === 'google')
          .length,
        microsoft: accounts.filter(
          (account) => account.provider === 'microsoft'
        ).length,
      },
      connectionsSummary: {
        total: connections.length,
        enabled: connections.filter((connection) => connection.is_enabled)
          .length,
      },
      accounts,
      connections,
      recentRuns: dashboardResult.data ?? [],
      cron: {
        inbound: '*/10 * * * *',
        scheduler: '0 * * * *',
        health: '*/30 * * * *',
      },
    });
  } catch (error) {
    console.error('Error in calendar sync status route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
