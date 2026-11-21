import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNow } from '../fleet/clock';
import { type FleetSnapshot } from '../fleet/contract';
import { inbox, loginRequests } from '../fleet/model';
import {
  type FleetLoad,
  fleetPageState,
  mergeRefresh,
} from '../fleet/page-state';
import { setShowFyi, useShowFyi } from '../fleet/preferences';
import { loadFleet } from '../fleet/server';
import { useSnoozes } from '../fleet/snooze';
import { useI18n } from '../i18n';
import { AccessSection } from './access-section';
import { ActivitySection } from './activity';
import { ApprovalsSection } from './approvals';
import { CostSection, SettingsSection } from './cost-settings';
import { Digest } from './digest';
import { FleetSection } from './fleet-section';
import { Inbox } from './inbox';
import { BlockingState, FreshnessLine, StaleNotice } from './page-states';
import { Preferences, Shell } from './shell';

export const FLEET_QUERY_KEY = ['fleet'] as const;
const REFRESH_MS = 15_000;

function Sections({
  snapshot,
  now,
  interactive,
}: {
  snapshot: FleetSnapshot;
  now: number;
  interactive: boolean;
}) {
  const showFyi = useShowFyi();
  return (
    <>
      <Digest snapshot={snapshot} now={now} />
      <Inbox
        snapshot={snapshot}
        now={now}
        showFyi={showFyi}
        interactive={interactive}
      />
      <AccessSection
        state={snapshot.state}
        now={now}
        interactive={interactive}
      />
      <FleetSection state={snapshot.state} now={now} />
      <ActivitySection state={snapshot.state} />
      <ApprovalsSection snapshot={snapshot} />
      <CostSection />
      <SettingsSection showFyi={showFyi} onShowFyi={setShowFyi} />
    </>
  );
}

/**
 * The page reads one TanStack Query entry, seeded by the route loader and
 * refreshed every 15 s through the `loadFleet` server function.
 */
export function CommandCenter({ initial }: { initial: FleetLoad }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: FLEET_QUERY_KEY,
    initialData: initial,
    initialDataUpdatedAt: Date.parse(initial.fetchedAt),
    refetchInterval: REFRESH_MS,
    // A refused or failed refresh (an expired session, a network error)
    // keeps the last snapshot, marked stale and read-only.
    queryFn: async (): Promise<FleetLoad> => {
      const previous = queryClient.getQueryData<FleetLoad>(FLEET_QUERY_KEY);
      const next = await loadFleet().catch((): FleetLoad => ({
        email: previous?.email ?? initial.email,
        fetchedAt: new Date().toISOString(),
        read: { kind: 'error', reason: 'unavailable' },
      }));
      return mergeRefresh(previous, next);
    },
  });
  const now = useNow(Date.parse(initial.fetchedAt));
  const snoozes = useSnoozes();
  const state = fleetPageState(query.data, now);
  const retry = () => void query.refetch();
  const snapshot =
    state.kind === 'ready' || state.kind === 'stale'
      ? state.snapshot
      : undefined;
  const counts = snapshot && {
    inbox: inbox(snapshot, snoozes, now).open.length,
    access: loginRequests(snapshot.state, new Date(now)).filter(
      (item) => item.state === 'waiting' || item.state === 'approved'
    ).length,
  };

  return (
    <Shell
      counts={counts}
      footer={
        <FreshnessLine
          state={state.kind}
          receivedAt={snapshot?.receivedAt}
          now={now}
        />
      }
    >
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-foreground/5 p-3 sm:p-4">
        <div className="space-y-1">
          <h1 className="font-bold text-2xl">{t('title')}</h1>
          <p className="text-foreground/80">{query.data.email}</p>
        </div>
        <Preferences />
      </header>
      {state.kind === 'stale' && (
        <StaleNotice
          reason={state.reason}
          onRetry={retry}
          retrying={query.isFetching}
        />
      )}
      {snapshot ? (
        <Sections
          snapshot={snapshot}
          now={now}
          // Answers leave only from a live snapshot; a stale one is read-only.
          interactive={state.kind === 'ready'}
        />
      ) : state.kind === 'error' || state.kind === 'unpublished' ? (
        <BlockingState
          state={state}
          retrying={query.isFetching}
          onRetry={retry}
        />
      ) : null}
    </Shell>
  );
}
