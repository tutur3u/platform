'use client';

import {
  Forward,
  List,
  Paperclip,
  Pencil,
  Reply,
  ReplyAll,
} from '@tuturuuu/icons';
import type {
  MailMessageDetail,
  MailThreadDetail,
  MailThreadSummary,
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
import { FloatingBar } from '@tuturuuu/ui/floating-bar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { MailAppearanceControls } from './mail-appearance-controls';
import { MailAttachmentCard } from './mail-attachment-card';
import { MailBlockedSenderBanner } from './mail-blocked-sender-banner';
import { MailContentState } from './mail-content-state';
import type { MailFolder } from './mail-folders';
import { MailIconButton } from './mail-icon-button';
import { MailThreadHeader } from './mail-thread-header';
import { ThreadMessageCard } from './thread-message-card';

// Icon-only circles on narrow screens, labelled pills from `sm` up; the bar
// supplies the control height and the concentric radius.
const BAR_ACTION_CLASS = 'gap-1.5 px-0 max-sm:w-(--bar-control-height) sm:px-3';

export function ThreadDetail({
  folder,
  workspaceId,
  actionPending,
  isDraft,
  error,
  onRetry,
  labelActions,
  loading,
  onArchive,
  onBack,
  onEditDraft,
  onForward,
  onReply,
  onReplyAll,
  onStar,
  onRead,
  onTrash,
  thread,
  summary,
}: {
  folder?: MailFolder;
  workspaceId?: string;
  actionPending: boolean;
  isDraft: boolean;
  error?: boolean;
  onRetry?: () => void;
  labelActions?: ReactNode;
  loading: boolean;
  onArchive: () => void;
  onBack: () => void;
  onEditDraft?: (message: MailMessageDetail) => void;
  onForward: (message: MailMessageDetail) => void;
  onReply: (message: MailMessageDetail) => void;
  onReplyAll: (message: MailMessageDetail) => void;
  onStar: () => void;
  onRead?: () => void;
  onTrash: () => void;
  thread: MailThreadDetail | null;
  summary?: MailThreadSummary | null;
}) {
  const t = useTranslations('mail');
  const [replyMessageId, setReplyMessageId] = useState<string | null>(null);
  const [deleteDraftOpen, setDeleteDraftOpen] = useState(false);

  const draft = thread?.messages.findLast(
    (message) => message.status === 'draft'
  );
  const mobileList = (
    <MailIconButton
      className="lg:hidden"
      aria-label={t('back_to_messages')}
      onClick={onBack}
      size="icon"
      variant="ghost"
    >
      <List className="size-4" />
    </MailIconButton>
  );
  const newest = thread?.messages.at(-1);
  const threadInfo = thread?.thread ?? summary;
  const header = threadInfo ? (
    <MailThreadHeader
      subject={threadInfo.subject}
      messageCount={thread?.messages.length ?? threadInfo.messageCount}
      starred={newest?.starred ?? summary?.starred ?? false}
      actionPending={actionPending || (isDraft && !thread)}
      isDraft={isDraft}
      labelActions={labelActions}
      onStar={onStar}
      onRead={onRead}
      unread={Boolean(
        thread?.thread.unreadCount ||
        summary?.unreadCount ||
        thread?.messages.some((message) => message.unread)
      )}
      onArchive={onArchive}
      onTrash={() => (isDraft ? setDeleteDraftOpen(true) : onTrash())}
    />
  ) : null;

  if (!thread)
    return (
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
        {header}
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-3 lg:hidden">
          <FloatingBar
            aria-label={t('message_actions')}
            className="pointer-events-auto"
          >
            {mobileList}
          </FloatingBar>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <MailContentState
            kind={loading ? 'loading' : error ? 'error' : 'reader'}
            onAction={error ? onRetry : undefined}
          />
        </div>
      </div>
    );

  const hasHtml = thread.messages.some((message) => message.sanitizedHtml);
  const replyMessage =
    thread.messages.find((message) => message.id === replyMessageId) ?? newest;
  const attachments = thread.messages.flatMap((message) =>
    message.attachments.map((attachment) => ({ attachment, message }))
  );

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-muted/20">
      {header}
      {workspaceId ? (
        <MailBlockedSenderBanner
          mailboxId={thread.thread.mailboxId}
          senders={thread.messages
            .filter((message) => message.direction !== 'outbound')
            .map((message) => message.fromAddress)}
          workspaceId={workspaceId}
        />
      ) : null}

      <Tabs
        className="min-h-0 min-w-0 flex-1 gap-0"
        defaultValue="conversation"
      >
        {attachments.length > 0 && (
          <div className="px-4 py-2 md:px-5">
            <TabsList className="bg-foreground/[0.045]">
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
                  workspaceId={workspaceId}
                  key={message.id}
                  message={message}
                />
              ))}
            </Accordion>
          </div>
          {(hasHtml || replyMessage) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-3">
              <FloatingBar
                aria-label={t('message_actions')}
                className="pointer-events-auto"
              >
                {mobileList}
                {isDraft && draft && onEditDraft && (
                  <Button onClick={() => onEditDraft(draft)} size="sm">
                    <Pencil className="size-4" />
                    {t('edit_draft')}
                  </Button>
                )}
                {!isDraft && replyMessage && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className={BAR_ACTION_CLASS}
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
                          className={BAR_ACTION_CLASS}
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
                          className={BAR_ACTION_CLASS}
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
              </FloatingBar>
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
