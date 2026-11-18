'use client';
import { LockKeyhole, Users } from '@tuturuuu/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from './chat-panel';
import { PersonalChat } from './personal-chat';

export function ConversationPanel({
  solo: _solo,
  wsId,
  ...props
}: ComponentProps<typeof ChatPanel> & { solo: boolean; wsId?: string }) {
  const t = useTranslations('meet.call');
  // A room gaining participants never switches or publishes a private draft.
  const [mode, setMode] = useState('room');
  const privateTab = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (props.mentionRequest) setMode('room');
  }, [props.mentionRequest]);
  return (
    <Tabs
      value={mode}
      onValueChange={setMode}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <TabsList className="mx-3 my-2 grid grid-cols-2">
        <TabsTrigger value="room">
          <Users className="size-3.5" />
          {t('room_chat')}
        </TabsTrigger>
        <TabsTrigger ref={privateTab} value="personal">
          <LockKeyhole className="size-3.5" />
          {t('personal_chat')}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="room"
        forceMount
        className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
      >
        <p className="border-b px-4 py-2 text-muted-foreground text-xs">
          {t('room_chat_audience')}
        </p>
        <ChatPanel
          {...props}
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
        />
      </TabsContent>
    </Tabs>
  );
}
