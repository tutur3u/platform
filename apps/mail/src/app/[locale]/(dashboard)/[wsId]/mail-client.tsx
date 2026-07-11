'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Search } from '@tuturuuu/icons';
import {
  getMailBootstrap,
  getMailMessage,
  listMailMessages,
  type MailMessageDetail,
  type SendMailMessagePayload,
  sendMailMessage,
  updateMailMessageState,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useState } from 'react';
import { ComposeDialog, type ComposeInitialDraft } from './compose-dialog';
import type { MailFolder } from './mail-folders';
import { getMailFolderHref, mailFolderIcons } from './mail-folders';
import { MessageRow } from './mail-list';
import { MessageDetail } from './message-detail';

interface MailAppClientProps {
  folder: MailFolder;
  workspaceId: string;
}

type MailStateAction = Parameters<typeof updateMailMessageState>[3]['action'];

export function MailAppClient({ folder, workspaceId }: MailAppClientProps) {
  const t = useTranslations('mail');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mailboxId] = useQueryState('mailbox');
  const [query, setQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [messageId, setMessageId] = useQueryState('message');
  const [composeParam, setComposeParam] = useQueryState(
    'compose',
    parseAsString.withDefault('')
  );
  const [composeDraft, setComposeDraft] = useState<ComposeInitialDraft | null>(
    null
  );
  const composeOpen = composeParam === '1';

  const bootstrapQuery = useQuery({
    queryFn: () => getMailBootstrap(workspaceId),
    queryKey: ['mail', workspaceId, 'bootstrap'],
  });
  const mailboxes = bootstrapQuery.data?.mailboxes ?? [];
  const activeMailbox =
    mailboxes.find((mailbox) => mailbox.id === mailboxId) ?? mailboxes[0];
  const activeMailboxId = activeMailbox?.id ?? null;
  const FolderIcon = mailFolderIcons[folder];

  const messagesQuery = useQuery({
    enabled: Boolean(activeMailboxId),
    queryFn: () =>
      listMailMessages(workspaceId, activeMailboxId ?? '', {
        folder,
        pageSize: 60,
        query: query || undefined,
      }),
    queryKey: ['mail', workspaceId, activeMailboxId, 'messages', folder, query],
  });

  const detailQuery = useQuery({
    enabled: Boolean(activeMailboxId && messageId),
    queryFn: () =>
      getMailMessage(workspaceId, activeMailboxId ?? '', messageId ?? ''),
    queryKey: ['mail', workspaceId, activeMailboxId, 'message', messageId],
  });

  const invalidateMailbox = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['mail', workspaceId, activeMailboxId],
    });
  };

  const sendMutation = useMutation({
    mutationFn: ({
      mailboxId,
      payload,
    }: {
      mailboxId: string;
      payload: SendMailMessagePayload;
    }) => sendMailMessage(workspaceId, mailboxId, payload),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('send_failed'));
    },
    onSuccess: async ({ message }, variables) => {
      await invalidateMailbox();
      if (folder !== 'sent') {
        const nextParams = new URLSearchParams();
        nextParams.set('mailbox', variables.mailboxId);
        nextParams.set('message', message.id);
        router.replace(
          `${getMailFolderHref(workspaceId, 'sent')}?${nextParams.toString()}`
        );
      } else {
        await setMessageId(message.id);
      }
      toast.success(t('sent'));
    },
  });

  const stateMutation = useMutation({
    mutationFn: (action: MailStateAction) =>
      updateMailMessageState(
        workspaceId,
        activeMailboxId ?? '',
        messageId ?? '',
        { action }
      ),
    onSuccess: async (_data, action) => {
      await invalidateMailbox();
      await queryClient.invalidateQueries({
        queryKey: ['mail', workspaceId, activeMailboxId, 'message', messageId],
      });

      if (action === 'archive' || action === 'trash') {
        await setMessageId(null);
      }
    },
  });

  const messages = messagesQuery.data?.messages ?? [];
  const emptyTitle = query.trim() ? t('no_search_results') : t('empty');
  const emptyDescription = query.trim()
    ? t('no_search_results_description')
    : t('empty_folder_description');

  function handleComposeOpenChange(open: boolean) {
    if (!open) setComposeDraft(null);
    void setComposeParam(open ? '1' : null);
  }

  function handleReply(message: MailMessageDetail) {
    setComposeDraft({
      subject: formatReplySubject(message.subject),
      to: message.fromAddress,
    });
    void setComposeParam('1');
  }

  function handleToggleRead() {
    stateMutation.mutate(
      detailQuery.data?.unread ? 'mark_read' : 'mark_unread'
    );
  }

  return (
    <main className="flex h-full min-h-0 overflow-hidden bg-root-background text-foreground lg:grid lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
      <section
        className={cn(
          'min-h-0 flex-col border-dynamic border-r bg-background/95 backdrop-blur-sm',
          messageId ? 'hidden lg:flex' : 'flex'
        )}
      >
        <div className="flex min-h-17 items-center gap-3 border-dynamic border-b px-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dynamic bg-foreground/[0.035] shadow-sm">
            <FolderIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold text-base">{t(folder)}</h1>
            <p className="truncate text-muted-foreground text-xs">
              {activeMailbox?.address ?? t('mailboxes')}
            </p>
          </div>
          <Button
            aria-label={t('refresh')}
            disabled={messagesQuery.isFetching}
            onClick={() => messagesQuery.refetch()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                messagesQuery.isFetching && 'animate-spin'
              )}
            />
          </Button>
        </div>

        <div className="border-dynamic border-b p-3.5">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 rounded-xl border-foreground/10 bg-foreground/[0.025] pl-9 shadow-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search')}
              value={query}
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {bootstrapQuery.isLoading || messagesQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          ) : messages.length > 0 ? (
            <div className="divide-y divide-dynamic">
              {messages.map((message) => (
                <MessageRow
                  active={message.id === messageId}
                  key={message.id}
                  message={message}
                  onClick={() => setMessageId(message.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-72 items-center justify-center px-8 text-center">
              <div className="max-w-64 space-y-3">
                <div className="mx-auto flex size-11 items-center justify-center rounded-2xl border border-dynamic bg-foreground/[0.035] shadow-sm">
                  <FolderIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="font-medium text-sm">{emptyTitle}</div>
                <p className="text-muted-foreground text-sm">
                  {emptyDescription}
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </section>

      <section
        className={cn(
          'min-h-0 bg-[radial-gradient(circle_at_50%_42%,color-mix(in_oklab,var(--foreground)_4%,transparent),transparent_34%)]',
          messageId ? 'flex' : 'hidden lg:flex'
        )}
      >
        <MessageDetail
          actionPending={stateMutation.isPending}
          loading={detailQuery.isLoading}
          message={detailQuery.data ?? null}
          onArchive={() => stateMutation.mutate('archive')}
          onBack={() => setMessageId(null)}
          onReply={handleReply}
          onStar={() =>
            stateMutation.mutate(detailQuery.data?.starred ? 'unstar' : 'star')
          }
          onToggleRead={handleToggleRead}
          onTrash={() => stateMutation.mutate('trash')}
          showBack={Boolean(messageId)}
        />
      </section>

      <ComposeDialog
        initialDraft={composeDraft}
        mailboxes={mailboxes}
        onOpenChange={handleComposeOpenChange}
        onSend={async (nextMailboxId, payload) => {
          await sendMutation.mutateAsync({
            mailboxId: nextMailboxId,
            payload,
          });
        }}
        open={composeOpen}
        selectedMailboxId={activeMailboxId}
        sending={sendMutation.isPending}
      />
    </main>
  );
}

function formatReplySubject(subject: string) {
  if (/^re:/iu.test(subject.trim())) return subject;
  return `Re: ${subject || ''}`.trim();
}
