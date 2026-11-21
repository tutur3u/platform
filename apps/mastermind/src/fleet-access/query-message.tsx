import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { ReactNode } from 'react';
import { BlockingState, LoadingState } from '../components/page-states';
import { SectionMessage } from '../components/section';
import { useFleetText } from './text';
import type { FleetRead } from './upstream';

export function Panel({ children }: { children: ReactNode }) {
  return <div className="divide-y rounded-xl border bg-card">{children}</div>;
}

export function UnavailableTab({ children }: { children: ReactNode }) {
  return <SectionMessage>{children}</SectionMessage>;
}

export type ReadState<T> =
  | { kind: 'loading' }
  | { kind: 'error'; retry: () => void; retrying: boolean }
  | { kind: 'denied' }
  | { kind: 'ready'; data: T; refreshing: boolean };

/** Folds a query of a typed Fleet read into one renderable state. */
export function readState<T>(query: {
  data: FleetRead<T> | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}): ReadState<T> {
  if (query.data?.kind === 'denied') return { kind: 'denied' };
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

/**
 * Loading and error reuse the command center's page states; a grant that
 * changed mid-session asks for a reload. `ready` renders through the caller.
 */
export function ReadMessage({
  state,
}: {
  state: Exclude<ReadState<unknown>, { kind: 'ready' }>;
}) {
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
            <p>{t.gate.denied}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              {t.common.reload}
            </Button>
          </div>
        </SectionMessage>
      );
  }
}

/** A background refetch of data already on screen. */
export function RefreshingMark({ active }: { active: boolean }) {
  const { t } = useFleetText();
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-muted-foreground text-xs"
    >
      {active && (
        <>
          <RefreshCw className="size-3 animate-spin" aria-hidden />
          {t.common.refreshing}
        </>
      )}
    </span>
  );
}
