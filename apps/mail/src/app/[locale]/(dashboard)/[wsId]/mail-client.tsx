'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Mail,
  PenLine,
  RefreshCw,
  Search,
  Users,
} from '@tuturuuu/icons';
import {
  getMailBootstrap,
  getMailMessage,
  listMailMessages,
  type SendMailMessagePayload,
  sendMailMessage,
  updateMailMessageState,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { ComposeDialog } from './compose-dialog';
import {
  type Folder,
  folderIcons,
  isFolder,
  MessageRow,
  RailButton,
  Section,
} from './mail-list';
import { MessageDetail } from './message-detail';

interface MailAppClientProps {
  workspaceId: string;
}

export function MailAppClient({ workspaceId }: MailAppClientProps) {
  const t = useTranslations('mail');
  const queryClient = useQueryClient();
  const [mailboxId, setMailboxId] = useQueryState('mailbox');
  const [folder, setFolder] = useQueryState(
    'folder',
    parseAsString.withDefault('inbox')
  );
  const [query, setQuery] = useQueryState('q', parseAsString.withDefault(''));
  const [messageId, setMessageId] = useQueryState('message');
  const [composeOpen, setComposeOpen] = useState(false);

  const bootstrapQuery = useQuery({
    queryFn: () => getMailBootstrap(workspaceId),
    queryKey: ['mail', workspaceId, 'bootstrap'],
  });
  const mailboxes = bootstrapQuery.data?.mailboxes ?? [];
  const activeMailbox =
    mailboxes.find((mailbox) => mailbox.id === mailboxId) ?? mailboxes[0];
  const activeMailboxId = activeMailbox?.id ?? null;
  const selectedFolder = isFolder(folder) ? folder : 'inbox';

  const messagesQuery = useQuery({
    enabled: Boolean(activeMailboxId),
    queryFn: () =>
      listMailMessages(workspaceId, activeMailboxId ?? '', {
        folder: selectedFolder,
        pageSize: 60,
        query: query || undefined,
      }),
    queryKey: [
      'mail',
      workspaceId,
      activeMailboxId,
      'messages',
      selectedFolder,
      query,
    ],
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
    onSuccess: async ({ message }) => {
      await invalidateMailbox();
      await setFolder('sent');
      await setMessageId(message.id);
      toast.success(t('sent'));
    },
  });

  const stateMutation = useMutation({
    mutationFn: (
      action: Parameters<typeof updateMailMessageState>[3]['action']
    ) =>
      updateMailMessageState(
        workspaceId,
        activeMailboxId ?? '',
        messageId ?? '',
        { action }
      ),
    onSuccess: async () => {
      await invalidateMailbox();
      await queryClient.invalidateQueries({
        queryKey: ['mail', workspaceId, activeMailboxId, 'message', messageId],
      });
    },
  });

  const folderItems = useMemo(
    () =>
      (
        [
          'inbox',
          'starred',
          'sent',
          'drafts',
          'archive',
          'spam',
          'trash',
        ] as Folder[]
      ).map((item) => ({
        Icon: folderIcons[item],
        id: item,
        label: t(item),
      })),
    [t]
  );

  const messages = messagesQuery.data?.messages ?? [];

  return (
    <main className="flex h-screen min-h-0 flex-col bg-root-background text-foreground lg:grid lg:grid-cols-[260px_minmax(320px,420px)_1fr]">
      <aside className="flex min-h-0 flex-col border-dynamic border-b bg-background lg:border-r lg:border-b-0">
        <div className="flex h-16 items-center gap-3 border-dynamic border-b px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-dynamic bg-foreground/5">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{t('title')}</div>
            <div className="truncate text-muted-foreground text-xs">
              {bootstrapQuery.data?.user.email}
            </div>
          </div>
        </div>
        <div className="border-dynamic border-b p-3">
          <Button
            className="w-full justify-start"
            onClick={() => setComposeOpen(true)}
          >
            <PenLine className="h-4 w-4" />
            {t('compose')}
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            <Section title={t('mailboxes')}>
              {mailboxes.map((mailbox) => (
                <RailButton
                  key={mailbox.id}
                  active={mailbox.id === activeMailboxId}
                  icon={mailbox.type === 'shared' ? Users : Mail}
                  label={mailbox.displayName}
                  meta={mailbox.address}
                  onClick={() => setMailboxId(mailbox.id)}
                />
              ))}
            </Section>
            <Section title={t('folders')}>
              {folderItems.map(({ Icon, id, label }) => (
                <RailButton
                  key={id}
                  active={selectedFolder === id}
                  icon={Icon}
                  label={label}
                  onClick={() => setFolder(id)}
                />
              ))}
            </Section>
          </div>
        </ScrollArea>
      </aside>
      <section className="flex min-h-0 flex-col border-dynamic border-b bg-background lg:border-r lg:border-b-0">
        <div className="flex h-16 items-center gap-2 border-dynamic border-b px-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder={t('search')}
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => messagesQuery.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">{t('refresh')}</span>
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {messagesQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          ) : messages.length > 0 ? (
            <div className="divide-y divide-dynamic">
              {messages.map((message) => (
                <MessageRow
                  key={message.id}
                  active={message.id === messageId}
                  message={message}
                  onClick={() => setMessageId(message.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
              {t('empty')}
            </div>
          )}
        </ScrollArea>
      </section>
      <section className="min-h-0 bg-background">
        <MessageDetail
          loading={detailQuery.isLoading}
          message={detailQuery.data ?? null}
          onArchive={() => stateMutation.mutate('archive')}
          onMarkRead={() => stateMutation.mutate('mark_read')}
          onStar={() =>
            stateMutation.mutate(detailQuery.data?.starred ? 'unstar' : 'star')
          }
          onTrash={() => stateMutation.mutate('trash')}
        />
      </section>
      <ComposeDialog
        mailboxes={mailboxes}
        onOpenChange={setComposeOpen}
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
