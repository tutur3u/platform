'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Archive,
  CheckCheck,
  Info,
  Keyboard,
  Loader2,
  Search,
  Trash2,
  X,
} from '@tuturuuu/icons';
import {
  deleteMailDraft,
  getMailThread,
  listMailThreads,
  type MailThreadSummary,
  type SendMailMessagePayload,
  sendMailMessage,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FloatingComposer } from './floating-composer';
import type {
  ComposeInitialDraft,
  MailComposerHandle,
} from './mail-composer-types';
import { toComposeInitialDraft } from './mail-composer-utils';
import { MailContentState } from './mail-content-state';
import type { MailFolder } from './mail-folders';
import { getMailFolderHref, mailFolderIcons } from './mail-folders';
import { MailKeyboardHelp } from './mail-keyboard-help';
import { MailLabelMenu } from './mail-label-menu';
import {
  getCurrentMailPaneLayout,
  normalizeMailPaneLayout,
  setCurrentMailPaneLayout,
} from './mail-pane-layout';
import { MailQuickFilters } from './mail-quick-filters';
import { createMailReplyActions } from './mail-reply-actions';
import { MailSyncStatus } from './mail-sync-status';
import { MailThreadRow } from './mail-thread-list';
import {
  getMailThreadsQueryKey,
  getNextMailThreadPage,
  MAIL_THREAD_PAGE_SIZE,
} from './mail-thread-query';
import { ThreadDetail } from './thread-detail';
import { useMailBootstrap } from './use-mail-bootstrap';
import { useMailKeyboard } from './use-mail-keyboard';
import { useMailThreadActions } from './use-mail-thread-actions';
import { useMailViewedThreadRead } from './use-mail-viewed-thread-read';

interface MailAppClientProps {
  folder: MailFolder;
  workspaceId: string;
}

export function MailAppClient({ folder, workspaceId }: MailAppClientProps) {
  const t = useTranslations('mail');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mailboxId] = useQueryState('mailbox');
  const [query, setQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [label] = useQueryState('label');
  const [folderId] = useQueryState('folderId');
  const [threadId, setThreadId] = useQueryState('thread');
  const [composeParam, setComposeParam] = useQueryState(
    'compose',
    parseAsString.withDefault('')
  );
  const [composeDraft, setComposeDraft] = useState<ComposeInitialDraft | null>(
    null
  );
  const composerRef = useRef<MailComposerHandle>(null);
  const [composeSession, setComposeSession] = useState(0);
  const [composerVisible, setComposerVisible] = useState(composeParam === '1');
  const [selectedThreads, setSelectedThreads] = useState<Set<string>>(
    new Set()
  );
  const [layout, setLayout] = useState<[number, number]>(() =>
    getCurrentMailPaneLayout()
  );
  const layoutReadyRef = useRef(false);

  useEffect(() => {
    setComposerVisible(composeParam === '1');
  }, [composeParam]);

  useEffect(() => {
    const stored = window.localStorage.getItem('tuturuuu-mail-pane-layout');
    if (!stored) {
      layoutReadyRef.current = true;
      return;
    }
    try {
      const next = normalizeMailPaneLayout(JSON.parse(stored));
      setCurrentMailPaneLayout(next);
      setLayout(next);
      window.localStorage.setItem(
        'tuturuuu-mail-pane-layout',
        JSON.stringify(next)
      );
    } catch {
      window.localStorage.removeItem('tuturuuu-mail-pane-layout');
    }
    layoutReadyRef.current = true;
  }, []);

  const bootstrapQuery = useMailBootstrap(workspaceId);
  const mailboxes = bootstrapQuery.data?.mailboxes ?? [];
  const activeMailbox =
    mailboxes.find((mailbox) => mailbox.id === mailboxId) ?? mailboxes[0];
  const activeMailboxId = activeMailbox?.id ?? null;
  const FolderIcon = mailFolderIcons[folder];
  const threadQueryKey = getMailThreadsQueryKey({
    folder,
    folderId,
    label,
    mailboxId: activeMailboxId ?? '',
    query,
    workspaceId,
  });

  const threadsQuery = useInfiniteQuery({
    enabled: Boolean(activeMailboxId),
    getNextPageParam: getNextMailThreadPage,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listMailThreads(workspaceId, activeMailboxId ?? '', {
        folder,
        folderId: folderId ?? undefined,
        label: label ?? undefined,
        page: pageParam,
        pageSize: MAIL_THREAD_PAGE_SIZE,
        query: query || undefined,
      }),
    queryKey: threadQueryKey,
    staleTime: 30_000,
  });
  const selectionScope = JSON.stringify([
    activeMailboxId,
    folder,
    folderId,
    label,
    query,
  ]);
  const previousSelectionScope = useRef(selectionScope);
  useEffect(() => {
    if (previousSelectionScope.current === selectionScope) return;
    previousSelectionScope.current = selectionScope;
    setSelectedThreads(new Set());
  }, [selectionScope]);

  const detailQuery = useQuery({
    enabled: Boolean(activeMailboxId && threadId),
    queryFn: () =>
      getMailThread(workspaceId, activeMailboxId ?? '', threadId ?? ''),
    queryKey: ['mail', workspaceId, activeMailboxId, 'thread', threadId],
    staleTime: 30_000,
  });

  const threads =
    threadsQuery.data?.pages.flatMap((page) => page.threads) ?? [];

  const invalidateMailbox = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['mail', workspaceId, activeMailboxId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['mail', workspaceId, 'bootstrap'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['mail', workspaceId, 'bootstrap-counts'],
      }),
    ]);
  };

  const sendMutation = useMutation({
    mutationFn: ({
      nextMailboxId,
      payload,
    }: {
      nextMailboxId: string;
      payload: SendMailMessagePayload;
    }) => sendMailMessage(workspaceId, nextMailboxId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('send_failed')),
    onSuccess: async ({ message }, variables) => {
      await invalidateMailbox();
      const nextParams = new URLSearchParams();
      nextParams.set('mailbox', variables.nextMailboxId);
      if (message.threadId) nextParams.set('thread', message.threadId);
      router.replace(`${getMailFolderHref(workspaceId, 'sent')}?${nextParams}`);
      toast.success(t('sent'));
    },
  });

  const {
    bulkMutation,
    mutateThread,
    actionPending,
    actionsPending,
    syncState,
  } = useMailThreadActions({
    activeMailboxId,
    closeThread: () => void setThreadId(null),
    folder,
    invalidateMailbox,
    reopenThread: (nextThreadId) => void setThreadId(nextThreadId),
    selectedThreads,
    setSelectedThreads,
    threadId,
    threads,
    workspaceId,
  });
  useMailViewedThreadRead({
    workspaceId,
    mailboxId: activeMailboxId,
    threadId,
    detail: detailQuery.data,
    blocked: actionsPending || detailQuery.isError || folder === 'drafts',
  });
  const deleteDraftMutation = useMutation({
    mutationFn: (draftId: string) =>
      deleteMailDraft(workspaceId, activeMailboxId ?? '', draftId),
    onSuccess: async () => {
      await invalidateMailbox();
      await setThreadId(null);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('delete_draft_failed')
      ),
  });
  const filterChips = useMemo(
    () =>
      query.match(
        /(?:from|to|cc|bcc|subject|is|before|after|label|has):(?:"[^"]+"|\S+)/gu
      ) ?? [],
    [query]
  );

  const openCompose = async (draft: ComposeInitialDraft | null) => {
    if (composerVisible && !(await composerRef.current?.save())) return;
    if (composerVisible)
      void queryClient.invalidateQueries({ queryKey: ['mail', workspaceId] });
    setComposeSession((current) => current + 1);
    setComposeDraft(draft);
    setComposerVisible(true);
    void setComposeParam('1');
  };
  const openThread = (thread: MailThreadSummary): void => {
    void setThreadId(thread.id);
  };
  const prefetchThread = (nextThreadId: string) => {
    if (!activeMailboxId) return;
    void queryClient.prefetchQuery({
      queryFn: () => getMailThread(workspaceId, activeMailboxId, nextThreadId),
      queryKey: ['mail', workspaceId, activeMailboxId, 'thread', nextThreadId],
      staleTime: 30_000,
    });
  };
  const { handleReply, handleReplyAll, handleForward } = createMailReplyActions(
    t,
    mailboxes,
    openCompose
  );

  const keyboard = useMailKeyboard({
    threads,
    threadId,
    folder,
    selectionScope,
    openDetail: detailQuery.data,
    composerOpen: composerVisible,
    selected: selectedThreads,
    setSelected: setSelectedThreads,
    openThread: (id) => {
      void setThreadId(id);
    },
    compose: () => {
      void openCompose(null);
    },
    reply: (mode) => {
      const message =
        detailQuery.data?.thread.id === threadId
          ? detailQuery.data.messages.at(-1)
          : undefined;
      if (!message) return;
      if (folder === 'drafts') {
        const draft = detailQuery.data?.messages.findLast(
          (item) => item.status === 'draft'
        );
        if (draft) void openCompose(toComposeInitialDraft(draft));
      } else if (mode === 'reply') void handleReply(message);
      else if (mode === 'reply_all') void handleReplyAll(message);
      else void handleForward(message);
    },
    action: (action, id) => {
      if (
        action === 'mark_unread' &&
        id === threadId &&
        queryClient.isMutating({
          mutationKey: ['mail', workspaceId, activeMailboxId, 'viewed-read'],
        })
      )
        return;
      if (action === 'mark_unread' && id === threadId) void setThreadId(null);
      mutateThread(action, id);
    },
    bulkAction: (action) => bulkMutation.mutate(action),
    deleteDraft: () => {
      const draft =
        detailQuery.data?.thread.id === threadId
          ? detailQuery.data.messages.findLast(
              (item) => item.status === 'draft'
            )
          : undefined;
      if (draft && !deleteDraftMutation.isPending)
        deleteDraftMutation.mutate(draft.id);
    },
    navigate: (nextFolder) => {
      const params = new URLSearchParams();
      if (activeMailboxId) params.set('mailbox', activeMailboxId);
      router.push(`${getMailFolderHref(workspaceId, nextFolder)}?${params}`);
    },
    refresh: () => {
      if (
        threadsQuery.isFetching ||
        bootstrapQuery.isFetching ||
        actionsPending
      )
        return;
      if (activeMailboxId) void threadsQuery.refetch();
      else void bootstrapQuery.refetch();
    },
  });

  const listPanel = (
    <section className="flex h-full min-h-0 min-w-0 max-w-full flex-col bg-background/95">
      <div className="flex min-h-16 items-center gap-3 border-dynamic border-b px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
          <FolderIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-base tracking-tight">
            {t(folder)}
          </h1>
          <p className="truncate text-muted-foreground text-xs">
            {activeMailbox?.address}
          </p>
        </div>
        <MailSyncStatus
          state={syncState}
          refreshing={threadsQuery.isFetching || bootstrapQuery.isFetching}
          onRefresh={() => {
            if (activeMailboxId) void threadsQuery.refetch();
            else void bootstrapQuery.refetch();
          }}
        />
      </div>
      <div className="space-y-2 border-dynamic border-b p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t('search')}
            data-mail-search
            className="h-9 rounded-lg border-transparent bg-muted/60 pr-10 pl-9 shadow-none focus-visible:border-border focus-visible:bg-background"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
            value={query}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                aria-label={t('search_help')}
                className="absolute top-1/2 right-1 -translate-y-1/2"
                size="icon"
                variant="ghost"
              >
                <Info className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-sm">
              <div className="font-medium">{t('advanced_search')}</div>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                {t('search_help_description')}
              </p>
              <code className="mt-3 block rounded-lg bg-foreground/[0.05] p-2 text-xs">
                from:someone@example.com has:attachment
              </code>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center justify-between gap-1">
          <MailQuickFilters
            disabled={threads.length === 0 || bulkMutation.isPending}
            onQueryChange={(next) => void setQuery(next)}
            onSelectAll={(selected) =>
              setSelectedThreads(
                new Set(selected ? threads.map((thread) => thread.id) : [])
              )
            }
            query={query}
            selection={
              threads.length > 0 &&
              threads.every((thread) => selectedThreads.has(thread.id))
                ? true
                : selectedThreads.size > 0
                  ? 'indeterminate'
                  : false
            }
          />
          <Button
            aria-label={t('keyboard_shortcuts')}
            title={t('keyboard_shortcuts')}
            onClick={() => keyboard.setHelpOpen(true)}
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
          >
            <Keyboard className="size-3.5" />
          </Button>
        </div>
        {filterChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(filterChips)].map((chip) => (
              <Badge key={chip} variant="secondary">
                {chip}
              </Badge>
            ))}
          </div>
        ) : null}
        {selectedThreads.size > 0 ? (
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-foreground/[0.04] p-1">
            <span className="px-2 text-xs tabular-nums">
              {t('selected_count', { count: selectedThreads.size })}
            </span>
            <Button
              aria-label={t('mark_read')}
              disabled={actionsPending}
              onClick={() => bulkMutation.mutate('mark_read')}
              size="icon"
              variant="ghost"
            >
              <CheckCheck className="size-4" />
            </Button>
            <Button
              aria-label={t('archive')}
              disabled={actionsPending}
              onClick={() => bulkMutation.mutate('archive')}
              size="icon"
              variant="ghost"
            >
              <Archive className="size-4" />
            </Button>
            {activeMailboxId ? (
              <MailLabelMenu
                mailboxId={activeMailboxId}
                onChanged={invalidateMailbox}
                threadIds={[...selectedThreads]}
                workspaceId={workspaceId}
              />
            ) : null}
            <Button
              aria-label={t('trash')}
              disabled={actionsPending}
              onClick={() => bulkMutation.mutate('trash')}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
            <Button
              aria-label={t('clear_selection')}
              className="ml-auto"
              onClick={() => setSelectedThreads(new Set())}
              size="icon"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {bootstrapQuery.isLoading || threadsQuery.isLoading ? (
          <MailContentState kind="loading" />
        ) : bootstrapQuery.isError || threadsQuery.isError ? (
          <MailContentState
            kind="error"
            onAction={() =>
              void (bootstrapQuery.isError
                ? bootstrapQuery.refetch()
                : threadsQuery.refetch())
            }
          />
        ) : !activeMailboxId ? (
          <MailContentState kind="no_mailbox" />
        ) : threads.length ? (
          <div className="space-y-1 p-2">
            {threads.map((thread) => (
              <MailThreadRow
                folder={folder}
                active={thread.id === threadId}
                key={thread.id}
                onClick={() => openThread(thread)}
                onPrefetch={() => prefetchThread(thread.id)}
                onSelect={(selected) =>
                  setSelectedThreads((current) => {
                    const next = new Set(current);
                    if (selected) next.add(thread.id);
                    else next.delete(thread.id);
                    return next;
                  })
                }
                selected={selectedThreads.has(thread.id)}
                thread={thread}
              />
            ))}
            {threadsQuery.hasNextPage ? (
              <div className="flex justify-center p-3">
                <Button
                  disabled={threadsQuery.isFetchingNextPage}
                  onClick={() => threadsQuery.fetchNextPage()}
                  size="sm"
                  variant="ghost"
                >
                  {threadsQuery.isFetchingNextPage ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {t('load_more')}
                </Button>
              </div>
            ) : null}
            {threadsQuery.data?.pages.at(-1)?.pagination.truncated ? (
              <p className="px-4 py-3 text-center text-muted-foreground text-xs">
                {t('thread_list_truncated')}
              </p>
            ) : null}
          </div>
        ) : (
          <MailContentState
            kind={query ? 'search' : 'empty'}
            onAction={() => (query ? void setQuery('') : openCompose(null))}
          />
        )}
      </div>
    </section>
  );

  const selectedSummary =
    threads.find((thread) => thread.id === threadId) ?? null;
  const detailPanel = (
    <section className="flex h-full min-h-0 min-w-0 max-w-full bg-muted/20">
      <ThreadDetail
        folder={folder}
        actionPending={actionPending || deleteDraftMutation.isPending}
        isDraft={folder === 'drafts'}
        labelActions={
          activeMailboxId && threadId ? (
            <MailLabelMenu
              mailboxId={activeMailboxId}
              onChanged={invalidateMailbox}
              threadIds={[threadId]}
              workspaceId={workspaceId}
            />
          ) : null
        }
        error={detailQuery.isError}
        onRetry={() => void detailQuery.refetch()}
        loading={detailQuery.isLoading}
        onArchive={() => mutateThread('archive')}
        onBack={() => setThreadId(null)}
        onEditDraft={(message) => {
          void openCompose(toComposeInitialDraft(message));
        }}
        onForward={handleForward}
        onReply={handleReply}
        onReplyAll={handleReplyAll}
        onStar={() =>
          mutateThread(
            (detailQuery.data?.messages.at(-1)?.starred ??
              selectedSummary?.starred)
              ? 'unstar'
              : 'star'
          )
        }
        onTrash={() => {
          const draft = detailQuery.data?.messages.find(
            (message) => message.status === 'draft'
          );
          if (folder === 'drafts' && draft)
            deleteDraftMutation.mutate(draft.id);
          else mutateThread('trash');
        }}
        thread={detailQuery.data ?? null}
        summary={selectedSummary}
      />
    </section>
  );

  return (
    <div
      ref={keyboard.rootRef}
      className="h-full min-h-0 min-w-0 max-w-full overflow-hidden bg-background text-foreground"
    >
      <div className="h-full min-w-0 max-w-full lg:hidden">
        {threadId ? detailPanel : listPanel}
      </div>
      <div className="hidden h-full min-w-0 lg:block">
        <ResizablePanelGroup
          className="min-w-0"
          direction="horizontal"
          key={layout.join('-')}
          onLayout={(sizes) => {
            if (!layoutReadyRef.current) return;
            // `layout` controls this group's key so the persisted layout can be
            // applied after hydration. Updating it from the group's own layout
            // notification remounts the group and creates an infinite loop.
            const next = setCurrentMailPaneLayout(sizes);
            window.localStorage.setItem(
              'tuturuuu-mail-pane-layout',
              JSON.stringify(next)
            );
          }}
        >
          <ResizablePanel
            defaultSize={layout[0]}
            id="mail-thread-list"
            maxSize={48}
            minSize={28}
          >
            {listPanel}
          </ResizablePanel>
          <ResizableHandle aria-label={t('resize_message_list')} withHandle />
          <ResizablePanel
            defaultSize={layout[1]}
            id="mail-thread-detail"
            minSize={45}
          >
            {detailPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <MailKeyboardHelp
        open={keyboard.helpOpen}
        onOpenChange={keyboard.setHelpOpen}
      />
      <FloatingComposer
        key={composeSession}
        ref={composerRef}
        initialDraft={composeDraft}
        mailboxes={mailboxes}
        onOpenChange={(nextOpen) => {
          setComposerVisible(nextOpen);
          if (!nextOpen) {
            setComposeDraft(null);
            void queryClient.invalidateQueries({
              queryKey: ['mail', workspaceId],
            });
          }
          void setComposeParam(nextOpen ? '1' : null);
        }}
        onSend={(nextMailboxId, payload) =>
          sendMutation
            .mutateAsync({ nextMailboxId, payload })
            .then(() => undefined)
        }
        open={composerVisible}
        selectedMailboxId={activeMailboxId}
        sending={sendMutation.isPending}
        workspaceId={workspaceId}
      />
    </div>
  );
}
