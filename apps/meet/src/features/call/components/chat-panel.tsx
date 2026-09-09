'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  X,
} from '@tuturuuu/icons';
import {
  askMeetAssistant,
  discardMeetChatFile,
  listMeetAssistantReviews,
  readMeetChatFile,
  uploadMeetChatFile,
} from '@tuturuuu/internal-api';
import { hasMeetAssistantMention } from '@tuturuuu/realtime/meet';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { isMeetAssistant } from '../lib/assistant-identity';
import type { CallChatMessage } from '../lib/call-state';
import { AssistantPrivateReview } from './assistant-private-review';
import { AssistantWorkspacePicker } from './assistant-workspace-picker';
import { ChatMessageBody } from './chat-message-body';
import { MiraAvatar, MiraProfile } from './mira-profile';

function ChatAttachment({ meetingId, id }: { meetingId: string; id: string }) {
  const t = useTranslations('meet.call');
  const file = useQuery({
    queryKey: ['meet-chat-file', meetingId, id],
    queryFn: () => readMeetChatFile(meetingId, id),
    staleTime: 60000,
    retry: false,
  });
  if (!file.data)
    return (
      <p className="text-muted-foreground text-xs">
        {t(file.error ? 'attachment_unavailable' : 'upload_loading')}
      </p>
    );
  const { url, name, contentType, size } = file.data;
  return (
    <div className="mt-2 overflow-hidden rounded-xl border bg-muted/20">
      {[
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/avif',
      ].includes(contentType) && (
        <Image
          unoptimized
          width={640}
          height={360}
          src={url}
          alt={name}
          className="max-h-48 w-full object-contain"
          loading="lazy"
        />
      )}
      {['video/mp4', 'video/webm', 'video/quicktime'].includes(contentType) && (
        <video src={url} controls preload="none" className="max-h-48 w-full">
          <track kind="captions" />
        </video>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-2 p-2 text-xs hover:bg-muted"
      >
        <FileText className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {name}
          <span className="ml-2 text-muted-foreground">
            {(size / 1024 / 1024).toFixed(1)} MB
          </span>
        </span>
        <Download className="size-3.5" />
      </a>
    </div>
  );
}
export function ChatPanel({
  chat,
  onSendChat,
  selfUserId,
  meetingId,
}: {
  chat: CallChatMessage[];
  onSendChat: (body: string, attachments?: string[]) => Promise<{ id: string }>;
  selfUserId: string | null;
  meetingId: string;
}) {
  const t = useTranslations('meet.call');
  const queryClient = useQueryClient();
  const reviews = useQuery({
    queryKey: ['meet-assistant-reviews', meetingId, selfUserId],
    queryFn: () => listMeetAssistantReviews(meetingId),
    enabled: !!selfUserId,
    retry: false,
  });
  const [assistantWorkspace, setAssistantWorkspace] =
    useState<string>('personal');
  const [draft, setDraft] = useState(''),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [thinking, setThinking] = useState(false);
  const uploaded = useRef(new Map<File, { id: string }>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const receipts = uploaded.current;
    return () => {
      mounted.current = false;
      for (const receipt of receipts.values())
        void discardMeetChatFile(meetingId, receipt.id).catch(() => undefined);
      receipts.clear();
    };
  }, [meetingId]);
  const bottom = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const newest = `${chat.at(-1)?.id ?? ''}:${reviews.data?.map((review) => review.id).join(',') ?? ''}`;
  useEffect(() => {
    if (newest) bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [newest]);
  const submit = async () => {
    if (busy || (!draft.trim() && !files.length)) return;
    setBusy(true);
    try {
      const attachments = [];
      for (const file of files) {
        const receipt =
          uploaded.current.get(file) ??
          (await uploadMeetChatFile(meetingId, file));
        if (!mounted.current) {
          void discardMeetChatFile(meetingId, receipt.id).catch(
            () => undefined
          );
          return;
        }
        uploaded.current.set(file, receipt);
        attachments.push(receipt);
      }
      const body = draft.trim() || t('shared_files');
      const sent = await onSendChat(
        body,
        attachments.map((a) => a.id)
      );
      uploaded.current.clear();
      setDraft('');
      setFiles([]);
      if (hasMeetAssistantMention(body)) {
        setThinking(true);
        try {
          await askMeetAssistant(
            meetingId,
            sent.id,
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            assistantWorkspace === 'personal' ? undefined : assistantWorkspace
          );
        } catch {
          toast.error(t('assistant_failed'));
        } finally {
          await queryClient.invalidateQueries({
            queryKey: ['meet-assistant-reviews', meetingId, selfUserId],
          });
          setThinking(false);
        }
      }
    } catch {
      toast.error(t('chat_send_failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {hasMeetAssistantMention(draft) && (
        <AssistantWorkspacePicker
          value={assistantWorkspace}
          onChange={setAssistantWorkspace}
          selfUserId={selfUserId}
        />
      )}
      <ScrollArea className="[&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0 min-h-0 min-w-0 flex-1 px-4 py-3 [&_[data-radix-scroll-area-viewport]>div]:w-full [&_[data-radix-scroll-area-viewport]>div]:max-w-full">
        <ol aria-live="polite" aria-relevant="additions" className="space-y-5">
          {chat.map((message) => (
            <li key={message.id} className="@container flex gap-2">
              {isMeetAssistant(message) ? (
                <MiraProfile>
                  <MiraAvatar />
                </MiraProfile>
              ) : (
                <Avatar className="mt-0.5 size-7 shrink-0">
                  <AvatarImage src={message.avatarUrl} alt="" />
                  <AvatarFallback>
                    {message.displayName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  {isMeetAssistant(message) ? (
                    <span className="text-xs">
                      <MiraProfile />
                    </span>
                  ) : (
                    <span className="truncate font-medium text-xs">
                      {message.userId === selfUserId
                        ? t('you')
                        : message.displayName}
                    </span>
                  )}
                  <time className="shrink-0 text-[0.65rem] text-muted-foreground">
                    {new Date(message.createdAt).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <div className="wrap-break-word min-w-0 text-sm">
                  <ChatMessageBody
                    body={message.body}
                    assistant={isMeetAssistant(message)}
                  />
                </div>
                {reviews.data?.some((review) => review.id === message.id) && (
                  <AssistantPrivateReview
                    meetingId={meetingId}
                    selfUserId={selfUserId}
                    messageId={message.id}
                  />
                )}
                {message.attachmentIds?.map((id) => (
                  <ChatAttachment key={id} meetingId={meetingId} id={id} />
                ))}
              </div>
            </li>
          ))}
          {reviews.data
            ?.filter(
              (review) => !chat.some((message) => message.id === review.id)
            )
            .map((review) => (
              <li key={`review-${review.id}`}>
                <AssistantPrivateReview
                  meetingId={meetingId}
                  selfUserId={selfUserId}
                  messageId={review.id}
                />
              </li>
            ))}
        </ol>
        {reviews.isError && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-destructive/30 p-3 text-sm"
          >
            <p>{t('assistant_review_failed')}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void reviews.refetch()}
            >
              <RefreshCw className="size-3.5" />
              {t('assistant_review_retry')}
            </Button>
          </div>
        )}
        {!chat.length && !reviews.data?.length && (
          <div className="space-y-2 py-10 text-center">
            <div className="flex justify-center">
              <MiraAvatar size={36} />
            </div>
            <p className="text-muted-foreground text-sm">{t('chat_empty')}</p>
            <p className="text-muted-foreground text-xs">{t('mira_hint')}</p>
          </div>
        )}
        {thinking && (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 text-muted-foreground text-xs"
          >
            <Loader2 className="size-3 animate-spin" />
            {t('mira_thinking')}
          </p>
        )}
        <div ref={bottom} />
      </ScrollArea>
      <form
        className="space-y-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {!!files.length && (
          <ul className="space-y-1">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-lg bg-muted p-2 text-xs"
              >
                <Paperclip className="size-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5"
                  disabled={busy}
                  aria-label={t('remove_attachment')}
                  onClick={() => {
                    const receipt = uploaded.current.get(file);
                    if (receipt)
                      void discardMeetChatFile(meetingId, receipt.id).catch(
                        () => undefined
                      );
                    uploaded.current.delete(file);
                    setFiles((all) => all.filter((_, i) => i !== index));
                  }}
                >
                  <X className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          rows={2}
          disabled={busy}
          aria-label={t('chat')}
          placeholder={t('chat_placeholder')}
          className="max-h-32 min-h-16 resize-none"
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex items-center gap-1">
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const next = Array.from(event.target.files ?? []);
              if (
                next.some((f) => f.size > 25 * 1024 * 1024) ||
                next.length + files.length > 5
              )
                toast.error(t('file_limits'));
              else setFiles((old) => [...old, ...next]);
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => input.current?.click()}
            aria-label={t('attach_files')}
          >
            <Paperclip className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              setDraft(
                (text) => `${text.slice(0, 1989)}${text ? ' ' : ''}@Tuturuuu `
              )
            }
          >
            <MiraAvatar size={20} />
            Mira
          </Button>
          <span className="flex-1" />
          <Button
            type="submit"
            size="icon"
            disabled={busy || (!draft.trim() && !files.length)}
            aria-label={t('send')}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </>
  );
}
