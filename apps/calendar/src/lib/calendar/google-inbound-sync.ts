import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  credentialSyncErrorType,
  ensureHealthyCalendarCredential,
} from './credential-health';
import { performIncrementalActiveSync } from './incremental-active-sync';
import { classifyCalendarOAuthFailure } from './oauth-failure';
import {
  type CalendarTokenOutcomeEntry,
  recordCalendarTokenOutcome,
} from './oauth-token-health';
import { quarantineCalendarAuthToken } from './oauth-token-quarantine';
import {
  checkProviderSyncBudget,
  MAX_SYNC_CONNECTIONS,
  providerSyncSignal,
  rotatingSyncBatch,
} from './provider-sync-budget';
import type { CalendarSyncFailure } from './sync-diagnostics';
import {
  CalendarProviderSyncError,
  type CalendarSyncErrorType,
  classifyCalendarSyncError,
} from './sync-errors';
import type { CalendarAuthToken } from './token-refresh';

type CalendarConnectionRow = {
  id: string;
  calendar_name: string;
  calendar_id: string;
  auth_token_id?: string | null;
  workspace_calendar_id?: string | null;
  sync_delete_enabled?: boolean | null;
  sync_inbound_enabled?: boolean | null;
};

export async function syncGoogleInbound(args: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  rangeStart: string;
  rangeEnd: string;
  userIdForFallback: string;
  settingsAvailable: boolean;
}) {
  const { data: tokenRows, error: tokenError } = await args.sbAdmin
    .from('calendar_auth_tokens')
    .select('*')
    .eq('ws_id', args.wsId)
    .eq('provider', 'google')
    .eq('is_active', true);

  if (tokenError) {
    throw tokenError;
  }

  const googleTokens = (tokenRows ?? []) as CalendarAuthToken[];
  const googleTokenIds = googleTokens.map((token) => token.id);
  const tokenOutcomes: CalendarTokenOutcomeEntry[] = [];

  if (googleTokenIds.length === 0) {
    return {
      inserted: 0,
      updated: 0,
      deleted: 0,
      processedConnections: 0,
      failedConnections: 0,
      deferredConnections: 0,
      failureType: null,
      failedCalendars: [] as CalendarSyncFailure[],
      tokenOutcomes,
    };
  }

  const { data: connections, error: connectionError } = await args.sbAdmin
    .from('calendar_connections')
    .select(
      args.settingsAvailable
        ? 'id, calendar_name, calendar_id, auth_token_id, workspace_calendar_id, access_role, sync_delete_enabled, sync_inbound_enabled'
        : 'id, calendar_name, calendar_id, auth_token_id, workspace_calendar_id, access_role'
    )
    .eq('ws_id', args.wsId)
    .eq('is_enabled', true)
    .in('auth_token_id', googleTokenIds);

  if (connectionError) {
    throw connectionError;
  }

  const googleConnections =
    // The conditional column list defeats Supabase's typed select parser;
    // CalendarConnectionRow declares the shape of both projections.
    ((connections ?? []) as unknown as CalendarConnectionRow[]).filter(
      (connection) =>
        connection.auth_token_id && connection.sync_inbound_enabled !== false
    );

  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  let failedConnections = 0;
  const failedCalendars: CalendarSyncFailure[] = [];
  let firstConnectionError: unknown;
  let authError: unknown;

  // Accounts whose credential cannot be used this run, by sync error type.
  const rejectedAccounts = new Map<string, CalendarSyncErrorType>();
  // Accounts whose mid-sync credential failure already has an outcome.
  const reportedAccounts = new Set<string>();
  const batch = providerSyncSignal()
    ? rotatingSyncBatch(
        [...googleConnections].sort((a, b) => a.id.localeCompare(b.id)),
        MAX_SYNC_CONNECTIONS
      )
    : googleConnections;

  // One credential check per account, so a revoked account is rejected once
  // instead of once per calendar.
  const batchTokenIds = new Set(batch.map((c) => c.auth_token_id));
  for (const token of googleTokens) {
    if (!batchTokenIds.has(token.id) || providerSyncSignal()?.aborted) continue;
    const { result, outcome } = await ensureHealthyCalendarCredential(
      args.sbAdmin,
      token
    );
    tokenOutcomes.push(outcome);
    if (result.error)
      rejectedAccounts.set(token.id, credentialSyncErrorType(result));
  }

  let skippedByBudget = 0;
  for (const [index, connection] of batch.entries()) {
    if (providerSyncSignal()?.aborted) {
      skippedByBudget = batch.length - index;
      break;
    }
    try {
      checkProviderSyncBudget();
      const rejection = connection.auth_token_id
        ? rejectedAccounts.get(connection.auth_token_id)
        : undefined;
      if (rejection) {
        throw new CalendarProviderSyncError(
          'Google calendar credential unavailable',
          rejection
        );
      }
      const result = await performIncrementalActiveSync(
        args.wsId,
        args.userIdForFallback,
        connection.calendar_id,
        new Date(args.rangeStart),
        new Date(args.rangeEnd),
        undefined,
        connection.auth_token_id,
        connection.workspace_calendar_id ?? null,
        {
          syncDeletes: connection.sync_delete_enabled !== false,
        }
      );

      if (result instanceof NextResponse) {
        const body = await result.json();
        throw new CalendarProviderSyncError(
          body.error || 'Google sync failed',
          classifyCalendarSyncError({
            code: result.status,
            message: body.error,
          })
        );
      }

      inserted += result.eventsInserted;
      updated += result.eventsUpdated;
      deleted += result.eventsDeleted;
    } catch (error) {
      const oauthFailure = classifyCalendarOAuthFailure('google', error);
      const token = googleTokens.find(
        (row) => row.id === connection.auth_token_id
      );
      // A credential refresh inside the provider call failed. Record one
      // outcome per account; quarantine and skip the account only for a
      // permanent failure.
      if (
        token &&
        !reportedAccounts.has(token.id) &&
        !rejectedAccounts.has(token.id) &&
        (oauthFailure?.kind === 'permanent' ||
          oauthFailure?.kind === 'systemic')
      ) {
        let outcome: CalendarTokenOutcomeEntry['outcome'] = 'systemic';
        if (oauthFailure.kind === 'permanent') {
          try {
            outcome = await quarantineCalendarAuthToken(
              args.sbAdmin,
              token,
              oauthFailure.reason
            );
          } catch {
            console.error('calendar.oauth.quarantine_failed', {
              provider: 'google',
              reason: oauthFailure.reason,
            });
            outcome = 'transient';
          }
        }
        reportedAccounts.add(token.id);
        if (oauthFailure.kind === 'permanent')
          rejectedAccounts.set(token.id, 'auth');
        const entry = recordCalendarTokenOutcome({
          tokenId: token.id,
          provider: 'google',
          outcome,
          reason:
            oauthFailure.kind === 'permanent' ? oauthFailure.reason : undefined,
          providerCode: oauthFailure.providerCode,
          attempts: 1,
        });
        const previous = tokenOutcomes.findIndex(
          (item) => item.account === entry.account
        );
        if (previous >= 0) tokenOutcomes[previous] = entry;
        else tokenOutcomes.push(entry);
      }
      failedConnections += 1;
      failedCalendars.push({
        connectionId: connection.id,
        calendarName: connection.calendar_name,
        code: classifyCalendarSyncError(error),
      });
      firstConnectionError ??= error;
      if (classifyCalendarSyncError(error) === 'auth') authError ??= error;
      console.warn('Google calendar connection sync failed', {
        wsId: args.wsId,
        authTokenId: connection.auth_token_id,
        connectionId: connection.id,
        code: classifyCalendarSyncError(error),
      });
    }
  }

  return {
    inserted,
    updated,
    deleted,
    processedConnections: batch.length - skippedByBudget - failedConnections,
    deferredConnections:
      googleConnections.length - batch.length + skippedByBudget,
    failedConnections,
    failedCalendars,
    failureType: firstConnectionError
      ? classifyCalendarSyncError(authError ?? firstConnectionError)
      : null,
    tokenOutcomes,
  };
}
