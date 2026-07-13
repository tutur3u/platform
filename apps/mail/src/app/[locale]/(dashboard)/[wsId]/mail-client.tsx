'use client';

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Archive,
  CheckCheck,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from '@tuturuuu/icons';
import {
  bulkUpdateMailThreads,
  deleteMailDraft,
  getMailBootstrap,
  getMailThread,
  listMailThreads,
  type MailBootstrapResponse,
  type MailMessageDetail,
  type MailThreadSummary,
  type MailThreadsResponse,
  type SendMailMessagePayload,
  sendMailMessage,
  updateMailThreadState,
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
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FloatingComposer } from './floating-composer';
import type { ComposeInitialDraft } from './mail-composer-types';
import type { MailFolder } from './mail-folders';
import { getMailFolderHref, mailFolderIcons } from './mail-folders';
import { MailLabelMenu } from './mail-label-menu';
import {
  getCurrentMailPaneLayout,
  normalizeMailPaneLayout,
  setCurrentMailPaneLayout,
} from './mail-pane-layout';
import { MailThreadRow } from './mail-thread-list';
import {
  getMailThreadsQueryKey,
  getNextMailThreadPage,
  MAIL_THREAD_PAGE_SIZE,
} from './mail-thread-query';
import { ThreadDetail } from './thread-detail';

interface MailAppClientProps {
  folder: MailFolder;
  workspaceId: string;
}

type ThreadAction = Parameters<typeof updateMailThreadState>[3]['action'];

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

  const bootstrapQuery = useQuery({
    queryFn: () => getMailBootstrap(workspaceId),
    queryKey: ['mail', workspaceId, 'bootstrap'],
  });
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
  const detailQuery = useQuery({
    enabled: Boolean(activeMailboxId && threadId),
    queryFn: () =>
      getMailThread(workspaceId, activeMailboxId ?? '', threadId ?? ''),
    queryKey: ['mail', workspaceId, activeMailboxId, 'thread', threadId],
  });

  const invalidateMailbox = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['mail', workspaceId, activeMailboxId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['mail', workspaceId, 'bootstrap'],
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

  const stateMutation = useMutation({
    mutationFn: (action: ThreadAction) =>
      updateMailThreadState(
        workspaceId,
        activeMailboxId ?? '',
        threadId ?? '',
        { action }
      ),
    onSuccess: async (_data, action) => {
      await invalidateMailbox();
      if (action === 'archive' || action === 'trash') await setThreadId(null);
    },
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
  const bulkMutation = useMutation({
    mutationFn: (action: 'archive' | 'mark_read' | 'trash') =>
      bulkUpdateMailThreads(workspaceId, activeMailboxId ?? '', {
        action,
        threadIds: [...selectedThreads],
      }),
    onSuccess: async () => {
      setSelectedThreads(new Set());
      await invalidateMailbox();
    },
  });

  const threads =
    threadsQuery.data?.pages.flatMap((page) => page.threads) ?? [];
  const filterChips = useMemo(
    () =>
      query.match(
        /(?:from|to|cc|bcc|subject|is|before|after|label|has):(?:"[^"]+"|\S+)/gu
      ) ?? [],
    [query]
  );

  const openCompose = (draft: ComposeInitialDraft | null) => {
    setComposeDraft(draft);
    setComposerVisible(true);
    void setComposeParam('1');
  };
  const openThread = (thread: MailThreadSummary) => {
    void setThreadId(thread.id);
    if (!activeMailboxId || thread.unreadCount <= 0) return;

    queryClient.setQueryData<InfiniteData<MailThreadsResponse>>(
      threadQueryKey,
      (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                threads: page.threads.map((item) =>
                  item.id === thread.id ? { ...item, unreadCount: 0 } : item
                ),
              })),
            }
          : current
    );
    if (folder === 'inbox') {
      queryClient.setQueryData<MailBootstrapResponse>(
        ['mail', workspaceId, 'bootstrap'],
        (current) =>
          current
            ? {
                ...current,
                mailboxes: current.mailboxes.map((mailbox) =>
                  mailbox.id === activeMailboxId
                    ? {
                        ...mailbox,
                        unreadCount: Math.max(
                          0,
                          mailbox.unreadCount - thread.unreadCount
                        ),
                      }
                    : mailbox
                ),
              }
            : current
      );
    }
    void updateMailThreadState(workspaceId, activeMailboxId, thread.id, {
      action: 'mark_read',
    }).then(invalidateMailbox, invalidateMailbox);
  };
  const replyReferences = (message: MailMessageDetail) => [
    ...message.references,
    ...(message.internetMessageId ? [message.internetMessageId] : []),
  ];
  const quote = (message: MailMessageDetail) =>
    `<p><br></p><blockquote><p>${escapeHtml(t('quoted_message', { sender: message.fromName || message.fromAddress }))}</p>${message.sanitizedHtml || `<p>${escapeHtml(message.bodyText ?? '').replaceAll('\n', '<br>')}</p>`}</blockquote>`;
  const handleReply = (message: MailMessageDetail) =>
    openCompose({
      bodyHtml: quote(message),
      inReplyTo: message.internetMessageId,
      recipientDisplayNames: message.fromName
        ? { [message.fromAddress.toLowerCase()]: message.fromName }
        : {},
      references: replyReferences(message),
      subject: replySubject(message.subject),
      threadId: message.threadId ?? undefined,
      to: [message.fromAddress],
    });
  const handleReplyAll = (message: MailMessageDetail) => {
    const excluded = new Set(
      mailboxes.map((mailbox) => mailbox.address.toLowerCase())
    );
    const candidates = [
      {
        address: message.fromAddress,
        displayName: message.fromName,
      },
      ...message.recipients
        .filter(
          (recipient) => recipient.kind === 'to' || recipient.kind === 'cc'
        )
        .map((recipient) => ({
          address: recipient.address,
          displayName: recipient.displayName,
        })),
    ].filter(({ address }) => !excluded.has(address.toLowerCase()));
    const unique = [
      ...new Map(
        candidates.map((recipient) => [
          recipient.address.toLowerCase(),
          recipient,
        ])
      ).values(),
    ];
    openCompose({
      bodyHtml: quote(message),
      cc: unique.slice(1).map((recipient) => recipient.address),
      inReplyTo: message.internetMessageId,
      recipientDisplayNames: Object.fromEntries(
        unique.flatMap((recipient) =>
          recipient.displayName
            ? [[recipient.address.toLowerCase(), recipient.displayName]]
            : []
        )
      ),
      references: replyReferences(message),
      subject: replySubject(message.subject),
      threadId: message.threadId ?? undefined,
      to: unique.slice(0, 1).map((recipient) => recipient.address),
    });
  };
  const handleForward = (message: MailMessageDetail) =>
    openCompose({
      bodyHtml: quote(message),
      sourceAttachmentIds: message.attachments.map(
        (attachment) => attachment.id
      ),
      sourceMessageId: message.id,
      subject: forwardSubject(message.subject),
      threadId: message.threadId ?? undefined,
      to: [],
    });

  const listPanel = (
    <section className="flex h-full min-h-0 flex-col bg-background/95">
      <div className="flex min-h-17 items-center gap-3 border-dynamic border-b px-4">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-dynamic bg-foreground/[0.035]">
          <FolderIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{t(folder)}</h1>
          <p className="truncate text-muted-foreground text-xs">
            {activeMailbox?.address}
          </p>
        </div>
        <Button
          aria-label={t('refresh')}
          disabled={threadsQuery.isFetching}
          onClick={() => threadsQuery.refetch()}
          size="icon"
          variant="ghost"
        >
          <RefreshCw
            className={cn('size-4', threadsQuery.isFetching && 'animate-spin')}
          />
        </Button>
      </div>
      <div className="space-y-2 border-dynamic border-b p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 rounded-xl bg-foreground/[0.025] pr-10 pl-9"
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
                from:alex@example.com has:attachment after:2026-07-01
              </code>
            </PopoverContent>
          </Popover>
        </div>
        {filterChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {filterChips.map((chip) => (
              <Badge key={chip} variant="secondary">
                {chip}
              </Badge>
            ))}
          </div>
        ) : null}
        {selectedThreads.size > 0 ? (
          <div className="flex items-center gap-1 rounded-xl bg-foreground/[0.04] p-1">
            <span className="px-2 text-xs tabular-nums">
              {t('selected_count', { count: selectedThreads.size })}
            </span>
            <Button
              aria-label={t('mark_read')}
              onClick={() => bulkMutation.mutate('mark_read')}
              size="icon"
              variant="ghost"
            >
              <CheckCheck className="size-4" />
            </Button>
            <Button
              aria-label={t('archive')}
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
      <ScrollArea className="min-h-0 flex-1">
        {bootstrapQuery.isLoading || threadsQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t('loading')}
          </div>
        ) : threads.length ? (
          <div className="divide-y divide-dynamic">
            {threads.map((thread) => (
              <MailThreadRow
                active={thread.id === threadId}
                key={thread.id}
                onClick={() => openThread(thread)}
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
          </div>
        ) : (
          <div className="flex h-72 items-center justify-center px-8 text-center text-muted-foreground text-sm">
            {query ? t('no_search_results') : t('empty_folder_description')}
          </div>
        )}
      </ScrollArea>
    </section>
  );

  const detailPanel = (
    <section className="flex h-full min-h-0 bg-[radial-gradient(circle_at_45%_22%,color-mix(in_oklab,var(--foreground)_4%,transparent),transparent_34%)]">
      <ThreadDetail
        actionPending={stateMutation.isPending || deleteDraftMutation.isPending}
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
        loading={detailQuery.isLoading}
        onArchive={() => stateMutation.mutate('archive')}
        onBack={() => setThreadId(null)}
        onForward={handleForward}
        onReply={handleReply}
        onReplyAll={handleReplyAll}
        onStar={() =>
          stateMutation.mutate(
            detailQuery.data?.messages.at(-1)?.starred ? 'unstar' : 'star'
          )
        }
        onTrash={() => {
          const draft = detailQuery.data?.messages.find(
            (message) => message.status === 'draft'
          );
          if (folder === 'drafts' && draft)
            deleteDraftMutation.mutate(draft.id);
          else stateMutation.mutate('trash');
        }}
        thread={detailQuery.data ?? null}
      />
    </section>
  );

  return (
    <main className="h-full min-h-0 overflow-hidden bg-root-background text-foreground">
      <div className="h-full lg:hidden">
        {threadId ? detailPanel : listPanel}
      </div>
      <ResizablePanelGroup
        className="hidden lg:flex"
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
      <FloatingComposer
        initialDraft={composeDraft}
        mailboxes={mailboxes}
        onOpenChange={(nextOpen) => {
          setComposerVisible(nextOpen);
          if (!nextOpen) setComposeDraft(null);
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
    </main>
  );
}

function replySubject(subject: string) {
  return /^re:/iu.test(subject.trim())
    ? subject
    : `Re: ${subject || ''}`.trim();
}

function forwardSubject(subject: string) {
  return /^(fw|fwd):/iu.test(subject.trim())
    ? subject
    : `Fwd: ${subject || ''}`.trim();
}
