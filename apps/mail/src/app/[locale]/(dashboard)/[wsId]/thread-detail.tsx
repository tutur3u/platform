'use client';

import {
  Archive,
  ArrowLeft,
  Forward,
  Paperclip,
  Reply,
  ReplyAll,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { MailAppearanceControls } from './mail-appearance-controls';
import { MailAttachmentCard } from './mail-attachment-card';
import { MailContentState } from './mail-content-state';
import type { MailFolder } from './mail-folders';
import { ThreadMessageCard } from './thread-message-card';

export function ThreadDetail({
  folder,
  actionPending,
  isDraft,
  error,
  onRetry,
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
  folder?: MailFolder;
  actionPending: boolean;
  isDraft: boolean;
  error?: boolean;
  onRetry?: () => void;
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
  const [replyMessageId, setReplyMessageId] = useState<string | null>(null);
  const [deleteDraftOpen, setDeleteDraftOpen] = useState(false);

  if (loading) return <MailContentState kind="loading" />;
  if (error) return <MailContentState kind="error" onAction={onRetry} />;
  if (!thread) return <MailContentState kind="reader" />;

  const hasHtml = thread.messages.some((message) => message.sanitizedHtml);
  const newest = thread.messages.at(-1);
  const replyMessage =
    thread.messages.find((message) => message.id === replyMessageId) ?? newest;
  const attachments = thread.messages.flatMap((message) =>
    message.attachments.map((attachment) => ({ attachment, message }))
  );

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-muted/20">
      <header className="bg-background/90 px-4 py-3 backdrop-blur md:px-5">
        <div className="flex flex-wrap items-start gap-2">
          <Button
            aria-label={t('back_to_messages')}
            className="shrink-0"
            onClick={onBack}
            size="icon"
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 basis-40">
            <h1 className="text-pretty break-words font-semibold text-lg leading-tight md:text-xl">
              {thread.thread.subject || t('no_subject')}
            </h1>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('message_count', { count: thread.messages.length })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {labelActions}
            <Button
              aria-label={newest?.starred ? t('unstar') : t('star')}
              aria-pressed={Boolean(newest?.starred)}
              disabled={actionPending}
              onClick={onStar}
              size="icon"
              variant="ghost"
            >
              <Star
                className={newest?.starred ? 'size-4 fill-current' : 'size-4'}
              />
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

      <Tabs
        className="min-h-0 min-w-0 flex-1 gap-0"
        defaultValue="conversation"
      >
        {attachments.length > 0 && (
          <div className="px-4 py-2 md:px-5">
            <TabsList className="h-8 bg-foreground/[0.045]">
              <TabsTrigger value="conversation">
                {t('conversation')}
              </TabsTrigger>
              <TabsTrigger
                disabled={attachments.length === 0}
                value="attachments"
              >
                <Paperclip className="size-3.5" />
                {t('attachments')} ({attachments.length})
              </TabsTrigger>
            </TabsList>
          </div>
        )}
        <TabsContent className="min-h-0 min-w-0" value="conversation">
          <div className="h-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden">
            <Accordion
              className="w-full min-w-0 space-y-2 p-2 pb-24 md:p-3 md:pb-24"
              key={thread.thread.id}
              defaultValue={newest ? [newest.id] : []}
              onValueChange={(ids) => setReplyMessageId(ids.at(-1) ?? null)}
              type="multiple"
            >
              {thread.messages.map((message) => (
                <ThreadMessageCard
                  folder={folder}
                  key={message.id}
                  message={message}
                />
              ))}
            </Accordion>
          </div>
          {(hasHtml || (!isDraft && replyMessage)) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-3">
              <div
                className="pointer-events-auto flex max-w-full items-center gap-1 rounded-2xl bg-background/95 p-1.5 shadow-foreground/10 shadow-lg backdrop-blur"
                role="toolbar"
                aria-label={t('message_actions')}
              >
                {!isDraft && replyMessage && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="gap-1 px-2 text-xs sm:px-3 sm:text-sm"
                          aria-label={t('reply')}
                          onClick={() => onReply(replyMessage)}
                          size="sm"
                          variant="secondary"
                        >
                          <Reply className="size-4" />
                          <span className="hidden sm:inline">{t('reply')}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('reply')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="gap-1 px-2 text-xs sm:px-3 sm:text-sm"
                          aria-label={t('reply_all')}
                          onClick={() => onReplyAll(replyMessage)}
                          size="sm"
                          variant="ghost"
                        >
                          <ReplyAll className="size-4" />
                          <span className="hidden sm:inline">
                            {t('reply_all')}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('reply_all')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="gap-1 px-2 text-xs sm:px-3 sm:text-sm"
                          aria-label={t('forward')}
                          onClick={() => onForward(replyMessage)}
                          size="sm"
                          variant="ghost"
                        >
                          <Forward className="size-4" />
                          <span className="hidden sm:inline">
                            {t('forward')}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('forward')}</TooltipContent>
                    </Tooltip>
                  </>
                )}
                {hasHtml && (
                  <MailAppearanceControls
                    standalone={isDraft || !replyMessage}
                  />
                )}
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent className="min-h-0 min-w-0" value="attachments">
          <div className="h-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden">
            <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5 xl:grid-cols-3">
              {attachments.map(({ attachment }) => (
                <MailAttachmentCard
                  attachment={attachment}
                  key={attachment.id}
                />
              ))}
            </div>
          </div>
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
