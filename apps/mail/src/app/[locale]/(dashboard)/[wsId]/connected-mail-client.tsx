'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type ConnectedMailMessage,
  connectedMailRequest,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { useState } from 'react';
import type { MeetMailPlainDraft } from '@tuturuuu/utils/meet-mail-handoff';
import { MeetMailHandoffPreview } from './meet-mail-handoff-preview';
import { ConnectedMailCompose } from './connected-mail-compose';
import { useConnectedMailAccounts } from './connected-mail-accounts';
import { ConnectedMailReader } from './connected-mail-reader';
import {
  type ConnectedMailFolder,
  resolveConnectedAccountId,
} from './mail-source-selection';

interface ComposeState {
  initialDraft?: MeetMailPlainDraft;
  accountId: string;
  intentId: string;
  mode?: 'reply' | 'reply_all' | 'forward' | 'edit';
  source?: ConnectedMailMessage;
}

/**
 * Message list and reader for the connected account chosen in the sidebar.
 * The folder comes from the route and the account from `?account=`; account
 * management lives in Mail settings.
 */
export function ConnectedMailClient({
  folder,
  workspaceId,
}: {
  folder: ConnectedMailFolder;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const cache = useQueryClient();
  const [requestedAccountId] = useQueryState('account');
  const [composeParam, setComposeParam] = useQueryState('compose');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({ id: '', scope: '' });
  const [composeState, setComposeState] = useState<ComposeState | null>(null);
  const {
    actorId,
    cacheScope,
    query: accounts,
  } = useConnectedMailAccounts(workspaceId);
  const accountId =
    resolveConnectedAccountId(accounts.data, requestedAccountId) ?? '';
  const account = accounts.data?.find((item) => item.id === accountId);
  const scope = `${accountId}:${folder}`;
  const messageId = selected.scope === scope ? selected.id : '';
  const setMessageId = (id: string) => setSelected({ id, scope });
  // The sidebar Compose button requests a new message through `?compose=1`.
  const compose: ComposeState | null =
    composeState?.accountId === accountId
      ? composeState
      : composeParam === '1' && accountId
        ? { accountId, intentId: 'sidebar' }
        : null;
  const closeCompose = (target: ComposeState | null) => {
    setComposeState((current) => (current === target ? null : current));
    if (composeParam) void setComposeParam(null);
  };
  const messages = useInfiniteQuery({
    queryKey: [...cacheScope, accountId, folder, search],
    enabled: !!accountId,
    staleTime: 30000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      connectedMailRequest<{
        messages: ConnectedMailMessage[];
        nextCursor: string | null;
      }>(workspaceId, [accountId, 'messages'], {
        query: { folder, cursor: pageParam, q: search },
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const detail = useQuery({
    queryKey: [...cacheScope, accountId, 'message', messageId, folder],
    enabled: !!accountId && !!messageId,
    queryFn: () =>
      connectedMailRequest<ConnectedMailMessage>(
        workspaceId,
        [accountId, 'messages', messageId],
        { query: { draft: folder === 'drafts' ? '1' : undefined } }
      ),
  });
  const refresh = () => cache.invalidateQueries({ queryKey: cacheScope });
  const markRead = useMutation({
    retry: false,
    mutationFn: (id: string) =>
      connectedMailRequest(workspaceId, [accountId, 'messages', id], {
        method: 'POST',
        body: { action: 'mark_read' },
      }),
    onSuccess: () => void refresh(),
  });
  const action = useMutation({
    retry: false,
    mutationFn: (value: string) =>
      connectedMailRequest(workspaceId, [accountId, 'messages', messageId], {
        method: 'POST',
        body: { action: value },
      }),
    onSuccess: () => {
      setMessageId('');
      void refresh();
    },
  });
  const error =
    accounts.error ||
    messages.error ||
    detail.error ||
    action.error ||
    markRead.error;
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-background p-4">
      {error ? (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      ) : null}
      {!account && !accounts.isLoading ? (
        <p className="text-muted-foreground">{t('connected_empty')}</p>
      ) : null}
      <MeetMailHandoffPreview
        workspaceId={workspaceId}
        sourceKey={accountId}
        blocked={Boolean(composeState || composeParam === '1')}
        canImport={Boolean(actorId && account)}
        onImport={(initialDraft) =>
          setComposeState({
            accountId,
            intentId: crypto.randomUUID(),
            initialDraft,
          })
        }
      />
      {account ? (
        <>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(query);
              setMessageId('');
            }}
          >
            <Input
              aria-label={t('search')}
              className="min-w-0 flex-1"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit">{t('search')}</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refresh()}
            >
              {t('connected_refresh')}
            </Button>
            <Button
              type="button"
              onClick={() =>
                setComposeState({ accountId, intentId: crypto.randomUUID() })
              }
            >
              {t('compose')}
            </Button>
          </form>
          {compose ? (
            <ConnectedMailCompose
              key={`${workspaceId}:${actorId}:${accountId}:${compose.intentId}`}
              workspaceId={workspaceId}
              accountId={accountId}
              address={account.address}
              initialDraft={compose.initialDraft}
              source={compose.source}
              mode={compose.mode}
              onClose={() => closeCompose(compose)}
              onSent={() => {
                closeCompose(compose);
                void refresh();
              }}
            />
          ) : null}
          <div className="grid min-h-0 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              {messages.isLoading ? (
                <p role="status">{t('connected_loading')}</p>
              ) : null}
              {messages.data?.pages
                .flatMap((page) => page.messages)
                .map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`block w-full rounded-lg border p-3 text-left hover:bg-muted ${item.unread ? 'font-semibold' : ''}`}
                    onClick={() => {
                      setMessageId(item.id);
                      if (item.unread && folder !== 'drafts')
                        markRead.mutate(item.id);
                    }}
                  >
                    <div className="truncate text-sm">{item.from}</div>
                    <div className="truncate">
                      {item.subject || t('connected_no_subject')}
                    </div>
                  </button>
                ))}
              {messages.hasNextPage ? (
                <Button
                  disabled={messages.isFetchingNextPage}
                  onClick={() => void messages.fetchNextPage()}
                >
                  {t('connected_load_more')}
                </Button>
              ) : null}
            </div>
            {detail.data ? (
              <ConnectedMailReader
                key={`${workspaceId}:${actorId}:${accountId}:${folder}:${detail.data.id}`}
                workspaceId={workspaceId}
                accountId={accountId}
                message={detail.data}
                folder={folder}
                onCompose={(mode) =>
                  setComposeState({
                    accountId,
                    intentId: crypto.randomUUID(),
                    mode,
                    source: detail.data,
                  })
                }
                onAction={action.mutate}
                actionsPending={action.isPending}
                onSent={() => {
                  setSelected((current) =>
                    current.scope === scope && current.id === messageId
                      ? { id: '', scope }
                      : current
                  );
                  void refresh();
                }}
              />
            ) : detail.isLoading ? (
              <p role="status">{t('connected_loading')}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
