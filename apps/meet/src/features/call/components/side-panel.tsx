'use client';

import { X } from '@tuturuuu/icons';
import type {
  MeetApprovedParticipant,
  MeetRealtimePresence,
  MeetRealtimeWaitingParticipant,
} from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { CallChatMessage } from '../lib/call-state';
import { ChatPanel } from './chat-panel';
import type { CallPanel } from './control-bar';
import { ParticipantsPanel } from './participants-panel';
import { ResizableCallPanel } from './resizable-call-panel';

export function SidePanel({
  meetingId,
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
  meetingId: string;
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
  onSendChat: (body: string, attachments?: string[]) => Promise<{ id: string }>;
  panel: Exclude<CallPanel, null>;
  participants: MeetRealtimePresence[];
  raisedHandUserIds: string[];
  selfUserId: string | null;
  waiting: MeetRealtimeWaitingParticipant[];
}) {
  const t = useTranslations('meet.call');

  return (
    <ResizableCallPanel
      label={
        panel === 'chat'
          ? t('chat')
          : t('participants', { count: participants.length })
      }
    >
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
          meetingId={meetingId}
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
    </ResizableCallPanel>
  );
}
