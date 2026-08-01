'use client';

import { Check, Hand, MicOff, Send, UserMinus, X } from '@tuturuuu/icons';
import type {
  MeetRealtimePresence,
  MeetRealtimeWaitingParticipant,
} from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { CallChatMessage } from '../lib/call-state';
import type { CallPanel } from './control-bar';

export function SidePanel({
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
    <aside className="flex w-full shrink-0 flex-col border-l bg-background md:w-80">
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <>
      <ScrollArea className="flex-1 px-4 py-3">
        {chat.length ? (
          <ol className="space-y-3">
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
          onSendChat(draft);
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
  canManage,
  onDecideAdmission,
  onMute,
  onRemove,
  participants,
  raisedHandUserIds,
  selfUserId,
  waiting,
}: {
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
    <ScrollArea className="flex-1">
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
                <span className="min-w-0 flex-1 truncate text-sm">
                  {entry.displayName}
                </span>
                <Button
                  aria-label={t('admit')}
                  className="size-7"
                  onClick={() => onDecideAdmission(entry.userId, true)}
                  size="icon"
                  type="button"
                >
                  <Check className="size-3.5" />
                </Button>
                <Button
                  aria-label={t('deny')}
                  className="size-7"
                  onClick={() => onDecideAdmission(entry.userId, false)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <X className="size-3.5" />
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
                <MicOff className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {canManage && !isSelf ? (
                <span className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    aria-label={t('mute_participant')}
                    className="size-7"
                    onClick={() => onMute(participant.userId)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <MicOff className="size-3.5" />
                  </Button>
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
    </ScrollArea>
  );
}
