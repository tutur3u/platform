'use client';

import {
  Archive,
  ArrowLeft,
  Loader2,
  MailOpen,
  Paperclip,
  Star,
  Trash2,
} from '@tuturuuu/icons';
import type {
  MailMessageDetail,
  MailThreadDetail,
} from '@tuturuuu/internal-api';
import { Accordion } from '@tuturuuu/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { ThreadMessageCard } from './thread-message-card';

export function ThreadDetail({
  actionPending,
  isDraft,
  labelActions,
  loading,
  onArchive,
  onBack,
  onForward,
  onReply,
  onReplyAll,
  onStar,
  onTrash,
  thread,
}: {
  actionPending: boolean;
  isDraft: boolean;
  labelActions?: ReactNode;
  loading: boolean;
  onArchive: () => void;
  onBack: () => void;
  onForward: (message: MailMessageDetail) => void;
  onReply: (message: MailMessageDetail) => void;
  onReplyAll: (message: MailMessageDetail) => void;
  onStar: () => void;
  onTrash: () => void;
  thread: MailThreadDetail | null;
}) {
  const t = useTranslations('mail');
  const [deleteDraftOpen, setDeleteDraftOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-muted-foreground text-sm">
        <Loader2 className="mr-2 size-4 animate-spin" /> {t('loading_message')}
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-8 text-center">
        <div className="max-w-sm space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-dynamic bg-foreground/[0.035]">
            <MailOpen className="size-5 text-muted-foreground" />
          </div>
          <h2 className="font-semibold">{t('select_message')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('select_message_description')}
          </p>
        </div>
      </div>
    );
  }

  const newest = thread.messages.at(-1);
  const attachments = thread.messages.flatMap((message) =>
    message.attachments.map((attachment) => ({ attachment, message }))
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <header className="border-dynamic border-b bg-background/80 px-4 py-3 backdrop-blur md:px-5">
        <div className="flex items-start gap-2">
          <Button
            aria-label={t('back_to_messages')}
            className="shrink-0 lg:hidden"
            onClick={onBack}
            size="icon"
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-pretty font-semibold text-lg leading-tight md:text-xl">
              {thread.thread.subject || t('no_subject')}
            </h1>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('message_count', { count: thread.messages.length })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {labelActions}
            <Button
              aria-label={t('star')}
              disabled={actionPending}
              onClick={onStar}
              size="icon"
              variant="ghost"
            >
              <Star className="size-4" />
            </Button>
            <Button
              aria-label={t('archive')}
              disabled={actionPending}
              onClick={onArchive}
              size="icon"
              variant="ghost"
            >
              <Archive className="size-4" />
            </Button>
            <Button
              aria-label={isDraft ? t('delete_draft') : t('trash')}
              disabled={actionPending}
              onClick={() => (isDraft ? setDeleteDraftOpen(true) : onTrash())}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <Tabs className="min-h-0 flex-1 gap-0" defaultValue="conversation">
        <div className="border-dynamic border-b px-4 py-2 md:px-5">
          <TabsList className="h-8 bg-foreground/[0.045]">
            <TabsTrigger value="conversation">{t('conversation')}</TabsTrigger>
            <TabsTrigger
              disabled={attachments.length === 0}
              value="attachments"
            >
              <Paperclip className="size-3.5" />
              {t('attachments')} ({attachments.length})
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent className="min-h-0" value="conversation">
          <ScrollArea className="h-full">
            <Accordion
              className="space-y-3 p-4 md:p-5"
              defaultValue={newest ? [newest.id] : []}
              type="multiple"
            >
              {thread.messages.map((message) => (
                <ThreadMessageCard
                  key={message.id}
                  message={message}
                  onForward={onForward}
                  onReply={onReply}
                  onReplyAll={onReplyAll}
                />
              ))}
            </Accordion>
          </ScrollArea>
        </TabsContent>
        <TabsContent className="min-h-0" value="attachments">
          <ScrollArea className="h-full">
            <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5 xl:grid-cols-3">
              {attachments.map(({ attachment, message }) => (
                <a
                  className="rounded-2xl border border-dynamic bg-background p-4 transition hover:bg-foreground/5"
                  href={attachment.protectedUrl ?? undefined}
                  key={attachment.id}
                >
                  <Paperclip className="mb-4 size-5" />
                  <div className="truncate font-medium text-sm">
                    {attachment.filename}
                  </div>
                  <div className="mt-1 truncate text-muted-foreground text-xs">
                    {message.fromName || message.fromAddress}
                  </div>
                </a>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      <AlertDialog onOpenChange={setDeleteDraftOpen} open={deleteDraftOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_draft')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_draft_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onTrash}>
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
