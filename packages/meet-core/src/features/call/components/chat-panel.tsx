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
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { MiraAdultNotice } from '../../live-assistant/mira-adult-notice';
import { isMeetAssistant } from '../lib/assistant-identity';
import type { CallChatMessage } from '../lib/call-state';
import {
  matchMiraSlashCommands,
  type MiraSlashCommand,
  miraSlashCommandDraft,
} from '../lib/mira-slash-commands';
import { AssistantPrivateReview } from './assistant-private-review';
import {
  type AssistantFailureNotice,
  assistantFailureNotice,
  ChatAssistantNotice,
} from './chat-assistant-notice';
import {
  AssistantWorkspacePicker,
  isCurrentAssistantWorkspace,
  useAssistantWorkspaceSelection,
} from './assistant-workspace-picker';
import { ChatMessageBody } from './chat-message-body';
import {
  MiraPermissionsCard,
  type MiraPermissionsProps,
} from './mira-permissions-card';
import { MiraLiveDot, MiraModeTag } from './mira-presence';
import { MiraAvatar, MiraProfile } from './mira-profile';
import { RoomMiraNotice, roomMiraConsentKey } from './room-mira-notice';
import {
  type MiraToolAction,
  type MiraToolCall,
  MiraToolCard,
} from './mira-tool-card';
import {
  type MiraSurface,
  type MiraSurfaceActivity,
  MiraWhereStrip,
} from './mira-where-strip';

type RoomMira = {
  typing?: boolean;
  activity?: Partial<Record<MiraSurface, MiraSurfaceActivity>>;
  onFocusSurface?: (surface: MiraSurface) => void;
  toolsByMessageId?: ReadonlyMap<
    string,
    readonly {
      tool: MiraToolCall;
      onAuthorizedAction?: (action: MiraToolAction) => Promise<void>;
    }[]
  >;
  permissions?: MiraPermissionsProps;
};

export { assistantFailureNotice } from './chat-assistant-notice';

function ChatAttachment({ meetingId, id }: { meetingId: string; id: string }) {
  const t = useTranslations('meet.call');
  const file = useQuery({
    queryKey: ['meet-chat-file', meetingId, id],
    queryFn: () => readMeetChatFile(meetingId, id),
    staleTime: 60000,
    retry: false,
  });
  const [previewFailed, setPreviewFailed] = useState(false);
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
      ].includes(contentType) &&
        !previewFailed && (
          <img
            width={640}
            height={360}
            src={url}
            alt={name}
            className="max-h-48 w-full object-contain"
            loading="lazy"
            decoding="async"
            onError={() => setPreviewFailed(true)}
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
  mentionRequest = 0,
  onMentionHandled,
  onOpenPrivateMira,
  chat,
  onSendChat,
  selfUserId,
  accountId,
  meetingId,
  wsId,
  mira,
}: {
  mentionRequest?: number;
  onMentionHandled?: () => void;
  onOpenPrivateMira?: () => void;
  chat: CallChatMessage[];
  onSendChat: (body: string, attachments?: string[]) => Promise<{ id: string }>;
  selfUserId: string | null;
  accountId: string;
  meetingId: string;
  /** The meeting workspace, whose owner decides whether Mira is on. */
  wsId?: string;
  mira?: RoomMira;
}) {
  const t = useTranslations('meet.call');
  const tm = useTranslations('meet.call.miraEverywhere');
  const paletteId = useId();
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
    [thinking, setThinking] = useState(false),
    [assistantNotice, setAssistantNotice] =
      useState<AssistantFailureNotice | null>(null);
  const assistantScope = useAssistantWorkspaceSelection(
    assistantWorkspace,
    accountId,
    hasMeetAssistantMention(draft) || thinking
  );
  const currentAssistantScope = useRef(assistantScope);
  currentAssistantScope.current = assistantScope;
  const composer = useRef<HTMLTextAreaElement>(null);
  const [dismissedDraft, setDismissedDraft] = useState<string>();
  const [commandIndex, setCommandIndex] = useState(0);
  const commands =
    draft === dismissedDraft ? [] : matchMiraSlashCommands(draft);
  const activeCommand = commands[commandIndex];
  const chooseCommand = (command: MiraSlashCommand) => {
    setDraft(miraSlashCommandDraft(tm(`commands.${command}.prompt`)));
    setCommandIndex(0);
    composer.current?.focus();
  };
  useEffect(() => {
    if (!mentionRequest || busy) return;
    const value = composer.current?.value ?? '';
    if (!hasMeetAssistantMention(value)) {
      if (value.length > 1994) toast.error(t('mention_draft_full'));
      else setDraft(`@mira ${value}`);
    }
    const frame = requestAnimationFrame(() => {
      composer.current?.focus();
      const length = composer.current?.value.length ?? 0;
      composer.current?.setSelectionRange(length, length);
      onMentionHandled?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [mentionRequest, busy, onMentionHandled, t]);
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
  const miraTyping = thinking || !!mira?.typing;
  const newest = `${miraTyping}:${chat.at(-1)?.id ?? ''}:${reviews.data?.map((review) => review.id).join(',') ?? ''}`;
  useEffect(() => {
    bottom.current?.scrollIntoView?.({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }, [newest]);
  const submit = async () => {
    if (
      busy ||
      (!draft.trim() && !files.length) ||
      (hasMeetAssistantMention(draft) && !assistantScope.allowed)
    )
      return;
    const requestedScope = assistantScope;
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
        setAssistantNotice(null);
        setThinking(true);
        try {
          const current = currentAssistantScope.current;
          if (!isCurrentAssistantWorkspace(current, requestedScope))
            throw new Error('Assistant workspace choice changed');
          await askMeetAssistant(
            meetingId,
            sent.id,
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            assistantWorkspace === 'personal' ? undefined : assistantWorkspace
          );
        } catch (error) {
          if (mounted.current)
            setAssistantNotice(assistantFailureNotice(error));
          void queryClient.invalidateQueries({
            queryKey: roomMiraConsentKey(meetingId),
          });
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
          accountId={accountId}
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
                    <span className="flex flex-wrap items-center gap-1 text-xs">
                      <MiraProfile />
                      <MiraModeTag
                        compact
                        mode={
                          message.displayName === 'Mira Live' ? 'live' : 'chat'
                        }
                      />
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
                {isMeetAssistant(message) &&
                  mira?.toolsByMessageId
                    ?.get(message.id)
                    ?.map(({ tool, onAuthorizedAction }) => (
                      <MiraToolCard
                        key={tool.id}
                        tool={tool}
                        onAction={selfUserId ? onAuthorizedAction : undefined}
                        onFocusSurface={mira.onFocusSurface}
                      />
                    ))}
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
        {!chat.length && !reviews.isError && !reviews.data?.length && (
          <div className="space-y-2 py-10 text-center">
            <div className="flex justify-center">
              <MiraAvatar size={36} />
            </div>
            <p className="text-muted-foreground text-sm">{t('chat_empty')}</p>
            <p className="text-muted-foreground text-xs">{t('mira_hint')}</p>
            <MiraAdultNotice className="justify-center" />
          </div>
        )}
        {miraTyping && (
          <div role="status" className="mt-3 flex flex-wrap items-center gap-2">
            <MiraAvatar size={24} />
            <MiraModeTag mode="chat" />
            <span className="inline-flex items-center gap-2 rounded-full border border-dynamic-purple/25 bg-calendar-bg-purple px-2.5 py-1 font-semibold text-dynamic-purple text-xs">
              <MiraLiveDot />
              {tm('typing')}
            </span>
          </div>
        )}
        {assistantNotice && !thinking && (
          <ChatAssistantNotice
            notice={assistantNotice}
            wsId={wsId}
            onOpenPrivateMira={onOpenPrivateMira}
          />
        )}
        {mira?.activity && (
          <div className="mt-3">
            <MiraWhereStrip
              activity={mira.activity}
              onFocusSurface={mira.onFocusSurface}
            />
          </div>
        )}
        <div ref={bottom} />
        <div className="mt-3">
          <RoomMiraNotice meetingId={meetingId} />
        </div>
        <div className="mt-3">
          <MiraPermissionsCard {...mira?.permissions} />
        </div>
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
        <div className="flex flex-wrap gap-1">
          {(['summarize', 'decisions', 'actions'] as const).map((action) => (
            <Button
              key={action}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full text-xs"
              disabled={busy || !!draft.trim()}
              onClick={() => setDraft(`@mira ${t(`${action}_prompt`)}`)}
            >
              {t(`${action}_action`)}
            </Button>
          ))}
        </div>
        {commands.length > 0 && (
          <div
            id={paletteId}
            role="listbox"
            aria-label={tm('commands.title')}
            className="space-y-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-sm"
          >
            {commands.map((command) => (
              <div
                key={command}
                id={`${paletteId}-${command}`}
                role="option"
                aria-selected={command === activeCommand}
                className="flex cursor-pointer flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent aria-selected:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseCommand(command)}
              >
                <span className="font-mono font-semibold">/{command}</span>
                <span className="text-muted-foreground">
                  {tm(`commands.${command}.description`)}
                </span>
              </div>
            ))}
          </div>
        )}
        {hasMeetAssistantMention(draft) && (
          <MiraAdultNotice id={`${paletteId}-adults`} />
        )}
        <Textarea
          ref={composer}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setDismissedDraft(undefined);
            setCommandIndex(0);
          }}
          onFocus={() => {
            setDismissedDraft(undefined);
            setCommandIndex(0);
          }}
          onBlur={() => setDismissedDraft(draft)}
          aria-autocomplete="list"
          aria-controls={commands.length ? paletteId : undefined}
          aria-activedescendant={
            activeCommand ? `${paletteId}-${activeCommand}` : undefined
          }
          aria-describedby={
            hasMeetAssistantMention(draft) ? `${paletteId}-adults` : undefined
          }
          maxLength={2000}
          rows={2}
          disabled={busy}
          aria-label={t('chat')}
          placeholder={t('chat_placeholder')}
          className="max-h-32 min-h-16 resize-none"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (commands.length) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                setCommandIndex(
                  (commandIndex + direction + commands.length) % commands.length
                );
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setDismissedDraft(draft);
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey && activeCommand) {
                event.preventDefault();
                chooseCommand(activeCommand);
                return;
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) {
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
            aria-describedby={`${paletteId}-mention-adults`}
            onClick={() =>
              setDraft(
                (text) => `${text.slice(0, 1989)}${text ? ' ' : ''}@Tuturuuu `
              )
            }
          >
            <MiraAvatar size={20} />
            Mira
            <MiraAdultNotice
              variant="compact"
              id={`${paletteId}-mention-adults`}
            />
          </Button>
          <span className="flex-1" />
          <Button
            type="submit"
            size="icon"
            disabled={
              busy ||
              (!draft.trim() && !files.length) ||
              (hasMeetAssistantMention(draft) && !assistantScope.allowed)
            }
            aria-label={t('send')}
          >
            {busy ? (
              <Loader2 className="size-4 motion-safe:animate-spin motion-reduce:animate-none" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </>
  );
}
