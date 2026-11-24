'use client';
import { LockKeyhole, Users } from '@tuturuuu/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from './chat-panel';
import { PersonalChat } from './personal-chat';
import { useMiraSurface } from './use-mira-surface';

export function ConversationPanel({
  solo: _solo,
  wsId,
  referenceForAnswer,
  roomFeedback,
  ...props
}: ComponentProps<typeof ChatPanel> & {
  solo: boolean;
  roomFeedback?: boolean;
  wsId?: string;
  referenceForAnswer?: ComponentProps<
    typeof PersonalChat
  >['referenceForAnswer'];
}) {
  const tm = useTranslations('meet.call.miraEverywhere');
  // A room gaining participants never switches or publishes a private draft.
  const [mode, setMode] = useState('room');
  const privateTab = useRef<HTMLButtonElement>(null);
  // The tab follows the header's Mira control: no assistant, no tab.
  const { off } = useMiraSurface(props.meetingId, props.accountId);
  useEffect(() => {
    if (roomFeedback || props.mentionRequest) setMode('room');
  }, [props.mentionRequest, roomFeedback]);
  if (off)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatPanel
          {...props}
          wsId={wsId}
          mentionRequest={props.mentionRequest}
        />
      </div>
    );
  return (
    <Tabs
      value={mode}
      onValueChange={setMode}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <TabsList className="mx-3 my-2 grid grid-cols-2">
        <TabsTrigger value="room">
          <Users aria-hidden className="size-3.5" />
          <span className="truncate">{tm('roomTab')}</span>
        </TabsTrigger>
        <TabsTrigger ref={privateTab} value="personal">
          <LockKeyhole aria-hidden className="size-3.5" />
          <span className="truncate">{tm('tutor.tab')}</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="room"
        forceMount
        className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
      >
        <ChatPanel
          {...props}
          wsId={wsId}
          onOpenPrivateMira={() => {
            setMode('personal');
            privateTab.current?.focus();
          }}
          mentionRequest={mode === 'room' ? props.mentionRequest : 0}
        />
      </TabsContent>
      <TabsContent
        value="personal"
        forceMount
        className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
      >
        <PersonalChat
          meetingId={props.meetingId}
          accountId={props.accountId}
          wsId={wsId}
          onShare={props.onSendChat}
          permissions={props.mira?.permissions}
          referenceForAnswer={referenceForAnswer}
        />
      </TabsContent>
    </Tabs>
  );
}
