import type { FleetIntentReceipt } from '@tuturuuu/internal-api/fleet';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingsSectionMessage } from '@tuturuuu/ui/custom/settings-section';
import { toneBadge } from '../components/tone';
import { type LiveFleetAccess, receiptTone, requestOptions } from './model';
import {
  Panel,
  ReadMessage,
  type ReadState,
  RefreshingMark,
} from './query-message';
import { useFleetIntents } from './queries';
import { RequestForm } from './request-form';
import { formatInstant, useFleetText } from './text';

export function RequestsTab({ access }: { access: LiveFleetAccess }) {
  const options = requestOptions(access);
  return (
    <>
      {options.length > 0 && access.projects.length > 0 && (
        <RequestForm options={options} projects={access.projects} />
      )}
      <Receipts />
    </>
  );
}

function Receipts() {
  const { t } = useFleetText();
  const query = useFleetIntents();
  const state = receiptState(query);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-base tracking-tight">
          {t.requests.history}
        </h2>
        <RefreshingMark active={state.kind === 'ready' && state.refreshing} />
      </div>
      {state.kind === 'ready' ? (
        <Panel>
          {state.data.length === 0 ? (
            <SettingsSectionMessage>{t.requests.empty}</SettingsSectionMessage>
          ) : (
            <ul className="divide-y">
              {state.data.map((receipt) => (
                <ReceiptRow key={receipt.id} receipt={receipt} />
              ))}
            </ul>
          )}
          {query.hasNextPage && (
            <div className="flex justify-center px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {t.common.loadMore}
              </Button>
            </div>
          )}
        </Panel>
      ) : (
        <ReadMessage state={state} />
      )}
    </section>
  );
}

/** A denied page anywhere in the list means the grant changed. */
function receiptState(
  query: ReturnType<typeof useFleetIntents>
): ReadState<FleetIntentReceipt[]> {
  const pages = query.data?.pages ?? [];
  if (pages.some((page) => page.kind === 'denied')) return { kind: 'denied' };
  if (query.data) {
    return {
      kind: 'ready',
      data: pages.flatMap((page) =>
        page.kind === 'ok' ? page.data.intents : []
      ),
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

function ReceiptRow({ receipt }: { receipt: FleetIntentReceipt }) {
  const { locale, t } = useFleetText();
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 md:px-5">
      <div className="min-w-0">
        <p className="font-medium text-sm">{t.kind[receipt.kind]}</p>
        <p className="flex flex-wrap gap-x-3 text-muted-foreground text-sm">
          <time dateTime={receipt.createdAt}>
            {formatInstant(locale, receipt.createdAt)}
          </time>
          {/* Receipts carry no project or target, so the ID tells them apart. */}
          <code className="font-mono" title={receipt.id}>
            {receipt.id.slice(0, 8)}
          </code>
        </p>
      </div>
      <Badge
        variant="outline"
        className={toneBadge(receiptTone[receipt.state])}
      >
        {t.receipt[receipt.state]}
      </Badge>
    </li>
  );
}
