'use client';

import { Hand, MicOff, Send, UserMinus, X } from '@tuturuuu/icons';
import type {
  MeetApprovedParticipant,
  MeetRealtimePresence,
  MeetRealtimeWaitingParticipant,
} from '@tuturuuu/realtime/meet';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { CallChatMessage } from '../lib/call-state';
import type { CallPanel } from './control-bar';
import { RoomHostControls } from './room-host-controls';

export function SidePanel({
  approved,
  onForget,
  shareNotes,
  onShareNotes,
  canManage,
  chat,
  onClose,
  onDecideAdmission,
  onMute,
  onRemove,
  onSendChat,
  panel,
  participants,
  raisedHandUserIds,
  selfUserId,
  waiting,
}: {
  approved: MeetApprovedParticipant[];
  onForget: (userId: string) => void;
  shareNotes: boolean;
  onShareNotes: (enabled: boolean) => void;
  canManage: boolean;
  chat: CallChatMessage[];
  onClose: () => void;
  onDecideAdmission: (userId: string, admit: boolean) => void;
  onMute: (userId: string) => void;
  onRemove: (userId: string) => void;
  onSendChat: (body: string) => void;
  panel: Exclude<CallPanel, null>;
  participants: MeetRealtimePresence[];
  raisedHandUserIds: string[];
  selfUserId: string | null;
  waiting: MeetRealtimeWaitingParticipant[];
}) {
  const t = useTranslations('meet.call');

  return (
    <aside className="flex max-h-[45dvh] min-h-0 w-full shrink-0 flex-col border-l bg-background md:max-h-none md:w-80">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-medium text-sm">
          {panel === 'chat'
            ? t('chat')
            : t('participants', { count: participants.length })}
        </h2>
        <Button
          aria-label={t('close_panel')}
          className="size-7"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </header>

      {panel === 'chat' ? (
        <ChatPanel
          chat={chat}
          onSendChat={onSendChat}
          selfUserId={selfUserId}
        />
      ) : (
        <ParticipantsPanel
          approved={approved}
          onForget={onForget}
          shareNotes={shareNotes}
          onShareNotes={onShareNotes}
          canManage={canManage}
          onDecideAdmission={onDecideAdmission}
          onMute={onMute}
          onRemove={onRemove}
          participants={participants}
          raisedHandUserIds={raisedHandUserIds}
          selfUserId={selfUserId}
          waiting={waiting}
        />
      )}
    </aside>
  );
}

function ChatPanel({
  chat,
  onSendChat,
  selfUserId,
}: {
  chat: CallChatMessage[];
  onSendChat: (body: string) => void;
  selfUserId: string | null;
}) {
  const t = useTranslations('meet.call');
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const newestMessageId = chat.at(-1)?.id;

  useEffect(() => {
    if (newestMessageId)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [newestMessageId]);

  return (
    <>
      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        {chat.length ? (
          <ol
            aria-live="polite"
            aria-relevant="additions"
            className="space-y-3"
          >
            {chat.map((message) => (
              <li key={message.id}>
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-xs">
                    {message.userId === selfUserId
                      ? t('you')
                      : message.displayName}
                  </span>
                  <time className="text-[0.65rem] text-muted-foreground">
                    {new Date(message.createdAt).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                  {message.body}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {t('chat_empty')}
          </p>
        )}
        <div ref={bottomRef} />
      </ScrollArea>

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body) return;
          onSendChat(body);
          setDraft('');
        }}
      >
        <Input
          aria-label={t('chat_placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('chat_placeholder')}
          value={draft}
        />
        <Button
          aria-label={t('send')}
          disabled={!draft.trim()}
          size="icon"
          type="submit"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </>
  );
}

function ParticipantsPanel({
  approved,
  onForget,
  shareNotes,
  onShareNotes,
  canManage,
  onDecideAdmission,
  onMute,
  onRemove,
  participants,
  raisedHandUserIds,
  selfUserId,
  waiting,
}: {
  approved: MeetApprovedParticipant[];
  onForget: (userId: string) => void;
  shareNotes: boolean;
  onShareNotes: (enabled: boolean) => void;
  canManage: boolean;
  onDecideAdmission: (userId: string, admit: boolean) => void;
  onMute: (userId: string) => void;
  onRemove: (userId: string) => void;
  participants: MeetRealtimePresence[];
  raisedHandUserIds: string[];
  selfUserId: string | null;
  waiting: MeetRealtimeWaitingParticipant[];
}) {
  const t = useTranslations('meet.call');

  return (
    <ScrollArea className="min-h-0 flex-1">
      {canManage && waiting.length ? (
        <section className="border-b p-3">
          <h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t('waiting_room', { count: waiting.length })}
          </h3>
          <ul className="space-y-2">
            {waiting.map((entry) => (
              <li
                className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2"
                key={entry.userId}
              >
                <Avatar className="size-7">
                  <AvatarImage src={entry.avatarUrl} alt="" />
                  <AvatarFallback>
                    {entry.displayName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {entry.displayName}
                </span>
                <Button
                  aria-label={`${t('admit')}: ${entry.displayName}`}
                  className="h-8"
                  onClick={() => onDecideAdmission(entry.userId, true)}
                  size="sm"
                  type="button"
                >
                  {t('admit')}
                </Button>
                <Button
                  aria-label={`${t('deny')}: ${entry.displayName}`}
                  className="h-8"
                  onClick={() => onDecideAdmission(entry.userId, false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t('deny')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="divide-y">
        {participants.map((participant) => {
          const isSelf = participant.userId === selfUserId;
          return (
            <li
              className="group flex items-center gap-2 px-4 py-2.5"
              key={participant.userId}
            >
              <Avatar className="size-8">
                <AvatarImage src={participant.avatarUrl} alt="" />
                <AvatarFallback>
                  {participant.displayName.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm">
                {participant.displayName}
                {isSelf ? (
                  <span className="ml-1 text-muted-foreground">
                    ({t('you')})
                  </span>
                ) : null}
              </span>
              {raisedHandUserIds.includes(participant.userId) ? (
                <Hand className="size-3.5 shrink-0 text-dynamic-orange" />
              ) : null}
              {participant.media.audioEnabled ? null : (
                <span
                  title={t('microphone_muted')}
                  className="grid size-7 shrink-0 place-items-center text-muted-foreground"
                >
                  <MicOff aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">{t('microphone_muted')}</span>
                </span>
              )}
              {canManage && !isSelf ? (
                <span className="flex gap-1">
                  {participant.media.audioEnabled ? (
                    <Button
                      aria-label={t('mute_participant', {
                        name: participant.displayName,
                      })}
                      className="size-7"
                      onClick={() => onMute(participant.userId)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <MicOff className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    aria-label={t('remove_participant')}
                    className="size-7 text-dynamic-red"
                    onClick={() => onRemove(participant.userId)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <UserMinus className="size-3.5" />
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canManage && (
        <RoomHostControls
          approved={approved}
          onForget={onForget}
          shareNotes={shareNotes}
          onShareNotes={onShareNotes}
        />
      )}
    </ScrollArea>
  );
}
