'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type ConnectedMailAccount,
  type ConnectedMailMessage,
  connectedMailRequest,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useMailActor } from '@/components/mail-actor-provider';
import { ConnectedMailCompose } from './connected-mail-compose';
import { ConnectedMailReader } from './connected-mail-reader';

type Folder = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'spam';
export function ConnectedMailClient({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('mail');
  const cache = useQueryClient();
  const [chosen, setChosen] = useState('');
  const [folder, setFolder] = useState<Folder>('inbox');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [messageId, setMessageId] = useState('');
  const [compose, setCompose] = useState<{
    mode?: 'reply' | 'reply_all' | 'forward' | 'edit';
    source?: ConnectedMailMessage;
  } | null>(null);
  const [disconnectConfirmation, setDisconnectConfirmation] = useState(false);
  const actorId = useMailActor();
  const cacheScope = ['connected-mail', workspaceId, actorId];
  const accounts = useQuery({
    queryKey: [...cacheScope, 'accounts'],
    queryFn: () =>
      connectedMailRequest<ConnectedMailAccount[]>(workspaceId, []),
  });
  const account =
    accounts.data?.find((item) => item.id === chosen) ?? accounts.data?.[0];
  const accountId = account?.id ?? '';
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
  const connect = useMutation({
    mutationFn: (provider: 'google' | 'microsoft') =>
      connectedMailRequest<{ authUrl: string }>(workspaceId, ['connect'], {
        method: 'POST',
        body: { provider },
      }),
    onSuccess: ({ authUrl }) => window.location.assign(authUrl),
  });
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
  const disconnect = useMutation({
    mutationFn: () =>
      connectedMailRequest(workspaceId, [accountId], { method: 'DELETE' }),
    onSuccess: () => {
      setChosen('');
      setMessageId('');
      setCompose(null);
      setDisconnectConfirmation(false);
      cache.removeQueries({ queryKey: [...cacheScope, accountId] });
      void refresh();
    },
  });
  const error =
    accounts.error ||
    messages.error ||
    detail.error ||
    connect.error ||
    action.error ||
    markRead.error ||
    disconnect.error;
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto font-semibold">{t('connected_accounts')}</h1>
        <Button
          variant="outline"
          disabled={connect.isPending}
          onClick={() => connect.mutate('google')}
        >
          {t('connected_google')}
        </Button>
        <Button
          variant="outline"
          disabled={connect.isPending}
          onClick={() => connect.mutate('microsoft')}
        >
          {t('connected_microsoft')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {accounts.data?.map((item) => (
          <Button
            key={item.id}
            variant={item.id === accountId ? 'default' : 'outline'}
            onClick={() => {
              setChosen(item.id);
              setMessageId('');
              setCompose(null);
              setDisconnectConfirmation(false);
            }}
          >
            {item.address}
          </Button>
        ))}
      </div>
      {!account && !accounts.isLoading ? (
        <p className="text-muted-foreground">{t('connected_empty')}</p>
      ) : null}
      {account ? (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              ['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam'] as const
            ).map((item) => (
              <Button
                key={item}
                variant={folder === item ? 'secondary' : 'ghost'}
                onClick={() => {
                  setFolder(item);
                  setMessageId('');
                }}
              >
                {t(item)}
              </Button>
            ))}
            <Button onClick={() => setCompose({})}>{t('compose')}</Button>
            <Button variant="outline" onClick={() => void refresh()}>
              {t('connected_refresh')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDisconnectConfirmation(true)}
            >
              {t('connected_disconnect')}
            </Button>
          </div>
          {disconnectConfirmation ? (
            <div className="flex items-center gap-2 rounded-lg border p-3">
              <p>{t('connected_disconnect_confirm')}</p>
              <Button
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                {t('connected_disconnect')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDisconnectConfirmation(false)}
              >
                {t('connected_close')}
              </Button>
            </div>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(query);
              setMessageId('');
            }}
          >
            <Input
              aria-label={t('search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit">{t('search')}</Button>
          </form>
          {compose ? (
            <ConnectedMailCompose
              key={`${accountId}:${compose.source?.id ?? 'new'}:${compose.mode ?? ''}`}
              workspaceId={workspaceId}
              accountId={accountId}
              address={account.address}
              {...compose}
              onClose={() => setCompose(null)}
              onSent={() => {
                setCompose(null);
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
                workspaceId={workspaceId}
                accountId={accountId}
                message={detail.data}
                folder={folder}
                onCompose={(mode) => setCompose({ mode, source: detail.data })}
                onAction={action.mutate}
                actionsPending={action.isPending}
                onSent={() => {
                  setMessageId('');
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
