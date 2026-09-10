'use client';
import { LockKeyhole, Users } from '@tuturuuu/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { ChatPanel } from './chat-panel';
import { PersonalChat } from './personal-chat';

export function ConversationPanel({
  solo,
  ...props
}: ComponentProps<typeof ChatPanel> & { solo: boolean }) {
  const t = useTranslations('meet.call');
  // A room gaining participants never switches or publishes a private draft.
  const [mode, setMode] = useState(solo ? 'personal' : 'room');
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
        <TabsTrigger value="personal">
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
        <ChatPanel {...props} />
      </TabsContent>
      <TabsContent
        value="personal"
        forceMount
        className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
      >
        <PersonalChat meetingId={props.meetingId} onShare={props.onSendChat} />
      </TabsContent>
    </Tabs>
  );
}
