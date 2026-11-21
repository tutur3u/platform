import type { FleetOwnerConsole } from '@tuturuuu/internal-api/fleet';
import { Button } from '@tuturuuu/ui/button';
import { BlockingState, LoadingState } from '../components/page-states';
import { SectionMessage } from '../components/section';
import { CatalogSection } from './catalog-section';
import { DisplayValuesSection } from './display-values-section';
import { FleetControl } from './fleet-control';
import { GrantsSection } from './grants-section';
import { SignInLink } from './owner-parts';
import { useOwnerConsole } from './owner-queries';
import type { OwnerRead } from './owner-upstream';
import { RefreshingMark } from './query-message';
import { useFleetText } from './text';

export type ConsoleState =
  | { kind: 'loading' }
  | { kind: 'error'; retry: () => void; retrying: boolean }
  | { kind: 'denied'; reason: 'mfa_required' | 'forbidden' }
  | { kind: 'ready'; data: FleetOwnerConsole; refreshing: boolean };

export function consoleState(query: {
  data: OwnerRead | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}): ConsoleState {
  if (query.data?.kind === 'denied') {
    return { kind: 'denied', reason: query.data.reason };
  }
  if (query.data?.kind === 'ok') {
    return {
      kind: 'ready',
      data: query.data.data,
      refreshing: query.isFetching,
    };
  }
  if (query.isError) {
    return {
      kind: 'error',
      retry: () => query.refetch(),
      retrying: query.isFetching,
    };
  }
  return { kind: 'loading' };
}

/** Owner access management: Fleet stop, grants, catalog and display values. */
export function AccessTab() {
  const state = consoleState(useOwnerConsole());
  return <AccessView state={state} />;
}

export function AccessView({ state }: { state: ConsoleState }) {
  const { t } = useFleetText();
  switch (state.kind) {
    case 'loading':
      return <LoadingState />;
    case 'error':
      return (
        <BlockingState
          state={{ kind: 'error', reason: 'unavailable' }}
          retrying={state.retrying}
          onRetry={state.retry}
        />
      );
    case 'denied':
      return (
        <SectionMessage tone="error">
          <div className="space-y-3">
            <p>
              {state.reason === 'mfa_required'
                ? t.access.mfa
                : t.access.forbidden}
            </p>
            <div className="flex flex-wrap gap-2">
              <SignInLink />
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                {t.common.reload}
              </Button>
            </div>
          </div>
        </SectionMessage>
      );
    case 'ready': {
      const { data } = state;
      return (
        <div className="space-y-8">
          <div className="flex justify-end">
            <RefreshingMark active={state.refreshing} />
          </div>
          <FleetControl stopped={data.stopped} generation={data.generation} />
          <GrantsSection grants={data.grants} projects={data.projects} />
          <CatalogSection projects={data.projects} />
          {data.projects.length > 0 && (
            <DisplayValuesSection projects={data.projects} />
          )}
        </div>
      );
    }
  }
}
