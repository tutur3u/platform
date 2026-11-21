import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { readSyncFailures } from '@/lib/calendar/sync-diagnostics';
import {
  classifyCalendarSyncHealth,
  type SyncDashboardRecord,
} from '@/lib/calendar/sync-health';

interface RouteParams {
  wsId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    await connection();
    const { wsId } = await params;

    if (!validate(wsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const supabase = auth.supabase;
    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const [accountsResult, connectionsResult, dashboardResult] =
      await Promise.all([
        supabase
          .from('calendar_auth_tokens')
          .select(
            'id, provider, account_email, account_name, expires_at, is_active'
          )
          .eq('ws_id', wsId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('calendar_connections')
          .select(
            'id, auth_token_id, calendar_id, calendar_name, is_enabled, sync_inbound_enabled'
          )
          .eq('ws_id', wsId)
          .order('created_at', { ascending: true }),
        supabase
          .from('calendar_sync_dashboard')
          .select(
            'status, start_time, end_time, error_message, error_type, error_stack_trace, cooldown_remaining_seconds'
          )
          .eq('ws_id', wsId)
          .order('start_time', { ascending: false })
          .limit(10),
      ]);

    const failedReads = [
      { source: 'accounts', error: accountsResult.error },
      { source: 'connections', error: connectionsResult.error },
      { source: 'dashboard', error: dashboardResult.error },
    ].flatMap(({ source, error }) =>
      error
        ? [
            {
              source,
              code: /^[A-Z0-9]{5,10}$/.test(error.code)
                ? error.code
                : 'unknown',
            },
          ]
        : []
    );
    if (failedReads.length) {
      console.error('Calendar sync status reads failed', { failedReads });
      return NextResponse.json(
        { error: 'Failed to load sync status' },
        { status: 500 }
      );
    }

    const ownedAccounts: Array<{
      id: string;
      provider: string;
      account_email: string | null;
      account_name: string | null;
      expires_at: string | null;
      is_active: boolean;
    }> = accountsResult.data ?? [];
    const accounts = ownedAccounts
      .filter((account) => account.is_active)
      .map(({ is_active: _, ...account }) => account);
    const inactiveAccountIds = new Set(
      ownedAccounts.filter((account) => !account.is_active).map(({ id }) => id)
    );
    const connections: Array<{
      id: string;
      auth_token_id: string | null;
      calendar_id: string;
      calendar_name: string | null;
      is_enabled: boolean;
      sync_inbound_enabled: boolean | null;
    }> = connectionsResult.data ?? [];
    const recentRuns: Array<
      SyncDashboardRecord & { error_stack_trace: string | null }
    > = dashboardResult.data ?? [];
    const health = classifyCalendarSyncHealth({
      hasEnabledConnections: connections.some(
        (connection) =>
          connection.is_enabled && connection.sync_inbound_enabled !== false
      ),
      hasOrphanedConnections: connections.some(
        (connection) =>
          connection.is_enabled &&
          connection.sync_inbound_enabled !== false &&
          connection.auth_token_id &&
          inactiveAccountIds.has(connection.auth_token_id)
      ),
      accounts: accounts.map((account) => ({
        provider: account.provider as 'google' | 'microsoft',
        expires_at: account.expires_at,
      })),
      recentRuns,
    });

    return NextResponse.json({
      health,
      failedCalendars: readSyncFailures(
        recentRuns[0]?.error_stack_trace
      ).filter((failure) =>
        connections.some(
          (connection) =>
            connection.id === failure.connectionId &&
            connection.is_enabled &&
            connection.sync_inbound_enabled !== false
        )
      ),
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
      recentRuns: recentRuns.map(({ error_stack_trace: _, ...run }) => run),
      cron: {
        inbound: '*/15 * * * *',
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
