import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import type { ReactNode } from 'react';
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

/** Loading, error and denied views; `ready` renders through the caller. */
export function ReadMessage({
  state,
}: {
  state: Exclude<ReadState<unknown>, { kind: 'ready' }>;
}) {
  const { t } = useFleetText();
  switch (state.kind) {
    case 'loading':
      return (
        <div role="status" aria-label={t.common.loading} className="space-y-3">
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      );
    case 'error':
      return (
        <SectionMessage tone="error">
          <div className="space-y-3">
            <p>{t.common.error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={state.retry}
              disabled={state.retrying}
            >
              <RefreshCw
                className={state.retrying ? 'animate-spin' : undefined}
              />
              {t.common.retry}
            </Button>
          </div>
        </SectionMessage>
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
