/**
 * The sync-health fields the derivation reads. The sync-status API response
 * satisfies it structurally, so this module stays free of API imports.
 */
export interface CalendarSyncHealthInput {
  state: 'paused' | 'disconnected' | 'syncing' | 'healthy' | 'degraded';
  reason: string;
  lastSuccessAt: string | null;
  currentlyRunning: boolean;
}

/** A calendar whose last sync failed, as reported by the sync-status API. */
export interface CalendarSyncFailedCalendar {
  connectionId: string;
  calendarName: string;
  code: string;
}

/** The account fields sync recovery needs to name and reconnect an account. */
export interface CalendarSyncAccountRef {
  id: string;
  provider: string;
  account_email: string | null;
  account_name: string | null;
}

export type CalendarProviderAccountState =
  | 'connected'
  | 'reconnect_required'
  | 'temporarily_unavailable';

/** Why sync needs the user's attention; `unknown` covers unlisted server reasons. */
export type SyncAttentionReason =
  | 'reconnect_required'
  | 'auth'
  | 'provider_unavailable'
  | 'configuration'
  | 'api_limit'
  | 'sync_stalled'
  | 'sync_stale'
  | 'not_synced'
  | 'last_run_failed'
  | 'unknown';

/** One state per surface: sidebar, popover and settings all render from it. */
export type CalendarSyncStatus =
  /** No sync-status response has arrived yet. */
  | { kind: 'loading' }
  /** The accounts request succeeded and no calendar account is connected. */
  | { kind: 'disconnected' }
  | {
      kind: 'syncing';
      failedCalendars: CalendarSyncFailedCalendar[];
      lastSuccessAt: string | null;
    }
  | { kind: 'healthy'; lastSuccessAt: string | null }
  /** Accounts are connected, but no calendar is selected for sync. */
  | { kind: 'paused'; lastSuccessAt: string | null }
  | {
      kind: 'attention';
      reason: SyncAttentionReason;
      /** Accounts that must be reconnected before sync can resume. */
      accounts: CalendarSyncAccountRef[];
      failedCalendars: CalendarSyncFailedCalendar[];
      lastSuccessAt: string | null;
      /** A sync is running while the warning stays visible. */
      syncing: boolean;
    }
  /** A status, accounts or provider-calendar request failed. */
  | {
      kind: 'status_error';
      accounts: CalendarSyncAccountRef[];
      failedCalendars: CalendarSyncFailedCalendar[];
      lastSuccessAt: string | null;
      syncing: boolean;
    };

export type CalendarSyncStatusKind = CalendarSyncStatus['kind'];

/** The manual or automatic sync request, as plain fields. */
export interface CalendarSyncAttempt {
  isPending: boolean;
  isError: boolean;
  /** Epoch milliseconds of the latest request; 0 before the first one. */
  submittedAt: number;
  data?: { ok: boolean };
}

export interface CalendarSyncStatusInput {
  /** The latest sync-status response; undefined until the first one arrives. */
  status?: {
    health: CalendarSyncHealthInput;
    failedCalendars?: CalendarSyncFailedCalendar[];
  };
  /** Whether any request the status depends on failed, including accounts. */
  queryErrored: boolean;
  /** Whether the accounts request succeeded, so an empty list means none. */
  accountsLoaded: boolean;
  accounts: readonly CalendarSyncAccountRef[];
  /** Accounts sync quarantined after the provider rejected their credential. */
  needsReconnectAccounts?: readonly CalendarSyncAccountRef[];
  providerAccountStatuses: Readonly<
    Record<string, { state: CalendarProviderAccountState }>
  >;
  syncMutation: CalendarSyncAttempt;
}

const SERVER_ATTENTION_REASONS = new Set<SyncAttentionReason>([
  'reconnect_required',
  'auth',
  'configuration',
  'api_limit',
  'sync_stalled',
  'sync_stale',
  'not_synced',
  'last_run_failed',
]);

function serverAttentionReason(reason: string): SyncAttentionReason {
  return SERVER_ATTENTION_REASONS.has(reason as SyncAttentionReason)
    ? (reason as SyncAttentionReason)
    : 'unknown';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled calendar sync value: ${JSON.stringify(value)}`);
}

/** Active accounts the provider reports as needing reconnection, then quarantined ones. */
function reconnectAccounts(
  input: CalendarSyncStatusInput
): CalendarSyncAccountRef[] {
  return [
    ...input.accounts.filter(
      (account) =>
        input.providerAccountStatuses[account.id]?.state ===
        'reconnect_required'
    ),
    ...(input.needsReconnectAccounts ?? []),
  ];
}

function attentionReason(
  input: CalendarSyncStatusInput,
  health: CalendarSyncHealthInput,
  hasReconnectAccounts: boolean
): SyncAttentionReason | null {
  const { syncMutation } = input;
  const lastSuccess = health.lastSuccessAt;
  // A failed request only matters when no sync has succeeded since it started.
  const failedAttemptIsNewer =
    !lastSuccess || Date.parse(lastSuccess) < syncMutation.submittedAt;
  const attemptFailed =
    failedAttemptIsNewer &&
    (syncMutation.isError || syncMutation.data?.ok === false);
  const providerStates = Object.values(input.providerAccountStatuses).map(
    (status) => status.state
  );
  const needsAttention =
    attemptFailed ||
    health.state === 'degraded' ||
    !!input.needsReconnectAccounts?.length ||
    providerStates.some((state) => state !== 'connected');
  if (!needsAttention) return null;
  if (hasReconnectAccounts) return 'reconnect_required';
  if (providerStates.includes('temporarily_unavailable'))
    return 'provider_unavailable';
  if (health.state === 'degraded') return serverAttentionReason(health.reason);
  return 'last_run_failed';
}

/**
 * Derives the one sync state every calendar surface renders. A request error
 * wins, then the absence of a first response (loading), then anything that
 * needs attention, then a running sync, then the server's resting state.
 * `disconnected` also requires a successful, empty accounts response.
 */
export function deriveCalendarSyncStatus(
  input: CalendarSyncStatusInput
): CalendarSyncStatus {
  const health = input.status?.health;
  const failedCalendars = input.status?.failedCalendars ?? [];
  const lastSuccessAt = health?.lastSuccessAt ?? null;
  const syncing = !!(input.syncMutation.isPending || health?.currentlyRunning);
  const accounts = reconnectAccounts(input);

  if (input.queryErrored) {
    return {
      kind: 'status_error',
      accounts,
      failedCalendars,
      lastSuccessAt,
      syncing,
    };
  }
  if (!health) {
    return syncing
      ? { kind: 'syncing', failedCalendars, lastSuccessAt }
      : { kind: 'loading' };
  }
  const attention = (reason: SyncAttentionReason): CalendarSyncStatus => ({
    kind: 'attention',
    reason,
    accounts,
    failedCalendars,
    lastSuccessAt,
    syncing,
  });
  const reason = attentionReason(input, health, accounts.length > 0);
  if (reason) return attention(reason);
  if (syncing) return { kind: 'syncing', failedCalendars, lastSuccessAt };

  switch (health.state) {
    case 'syncing':
      return { kind: 'syncing', failedCalendars, lastSuccessAt };
    case 'disconnected':
      // A failed or pending accounts request is not evidence of no accounts.
      return input.accountsLoaded && !input.accounts.length
        ? { kind: 'disconnected' }
        : { kind: 'loading' };
    case 'paused':
      return { kind: 'paused', lastSuccessAt };
    case 'healthy':
      return { kind: 'healthy', lastSuccessAt };
    case 'degraded':
      // Unreachable: `attentionReason` always returns one for degraded health.
      return attention(serverAttentionReason(health.reason));
    default:
      return assertNever(health.state);
  }
}

/** Whether the alert should warn (attention or failed status check). */
export function calendarSyncNeedsAttention(status: CalendarSyncStatus) {
  return status.kind === 'attention' || status.kind === 'status_error';
}

/** Whether a sync is running, including behind a visible warning. */
export function calendarSyncIsActive(status: CalendarSyncStatus) {
  switch (status.kind) {
    case 'syncing':
      return true;
    case 'attention':
    case 'status_error':
      return status.syncing;
    default:
      return false;
  }
}

export type SyncAttentionDescriptionKey =
  | 'sync_recovery.stalled'
  | 'sync_recovery.stale'
  | 'sync_recovery.not_synced'
  | 'sync_recovery.reconnect_description'
  | 'sync_recovery.configuration'
  | 'sync_recovery.rate_limited'
  | 'sync_recovery.provider_unavailable'
  | 'sync_recovery.failed';

export function syncAttentionDescriptionKey(
  reason: SyncAttentionReason
): SyncAttentionDescriptionKey {
  switch (reason) {
    case 'sync_stalled':
      return 'sync_recovery.stalled';
    case 'sync_stale':
      return 'sync_recovery.stale';
    case 'not_synced':
      return 'sync_recovery.not_synced';
    case 'reconnect_required':
    case 'auth':
      return 'sync_recovery.reconnect_description';
    case 'configuration':
      return 'sync_recovery.configuration';
    case 'api_limit':
      return 'sync_recovery.rate_limited';
    case 'provider_unavailable':
      return 'sync_recovery.provider_unavailable';
    case 'last_run_failed':
    case 'unknown':
      return 'sync_recovery.failed';
    default:
      return assertNever(reason);
  }
}

/**
 * Providers to offer a reconnect action for. A credential failure without a
 * named account offers every connected provider, or both when none is listed.
 */
export function calendarSyncReconnectProviders(
  status: CalendarSyncStatus,
  connectedAccounts: readonly Pick<CalendarSyncAccountRef, 'provider'>[]
): Set<string> {
  if (status.kind !== 'attention' && status.kind !== 'status_error')
    return new Set();
  const providers = new Set(status.accounts.map((account) => account.provider));
  if (
    !providers.size &&
    status.kind === 'attention' &&
    (status.reason === 'auth' || status.reason === 'reconnect_required')
  ) {
    const fallback = connectedAccounts.length
      ? connectedAccounts.map((account) => account.provider)
      : ['google', 'microsoft'];
    for (const provider of fallback) providers.add(provider);
  }
  return providers;
}

export type CalendarSyncStatusLabelKey =
  | 'sync_recovery.checking'
  | 'sync_recovery.not_connected'
  | 'syncing_calendars'
  | 'healthy'
  | 'sync_recovery.paused'
  | 'degraded'
  | 'sync_recovery.unavailable';

/** Status copy for the compact pill; every label describes state, not an action. */
export function calendarSyncStatusLabelKey(
  status: CalendarSyncStatus
): CalendarSyncStatusLabelKey {
  switch (status.kind) {
    case 'loading':
      return 'sync_recovery.checking';
    case 'disconnected':
      return 'sync_recovery.not_connected';
    case 'syncing':
      return 'syncing_calendars';
    case 'healthy':
      return 'healthy';
    case 'paused':
      return 'sync_recovery.paused';
    case 'attention':
      return 'degraded';
    case 'status_error':
      return 'sync_recovery.unavailable';
    default:
      return assertNever(status);
  }
}

export function calendarSyncStatusStyles(status: CalendarSyncStatus): string {
  switch (status.kind) {
    case 'loading':
    case 'disconnected':
    case 'paused':
      return 'bg-muted text-muted-foreground';
    case 'syncing':
      return 'bg-dynamic-blue/10 text-dynamic-blue';
    case 'healthy':
      return 'bg-dynamic-green/10 text-dynamic-green';
    case 'attention':
      return 'bg-dynamic-orange/10 text-dynamic-orange';
    case 'status_error':
      return 'bg-dynamic-red/10 text-dynamic-red';
    default:
      return assertNever(status);
  }
}
