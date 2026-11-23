'use client';

import { MessageSquare, Users } from '@tuturuuu/icons';
import type {
  MeetApprovedParticipant,
  MeetRealtimePresence,
  MeetRealtimeWaitingParticipant,
} from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import type { MeetRoomController } from '../lib/room-controller';
import { readRoomControls, subscribeRoomControls } from '../lib/room-actions';
import type { CallChatMessage } from '../lib/call-state';
import type { CallPanel } from './control-bar';
import { ConversationPanel } from './conversation-panel';
import { ParticipantsPanel } from './participants-panel';
import { ResizableCallPanel } from './resizable-call-panel';
import { CallPanelHeader } from '../tools/tool-ui';

export function SidePanel({
  roomFeedback,
  mentionRequest,
  onMentionHandled,
  meetingId,
  miraActive = false,
  qaLive = false,
  approved,
  onForget,
  canManage,
  chat,
  onClose,
  room,
  onAdmitAll,
  onCamerasLockedChange,
  onDecideAdmission,
  onMute,
  onRemove,
  onSendChat,
  panel,
  participants,
  raisedHandUserIds,
  selfUserId,
  accountId,
  wsId,
  waiting,
}: {
  roomFeedback?: boolean;
  mentionRequest?: number;
  onMentionHandled?: () => void;
  meetingId: string;
  miraActive?: boolean;
  /** The Q&A is open on this person's stage. */
  qaLive?: boolean;
  approved: MeetApprovedParticipant[];
  onForget: (userId: string) => void;
  canManage: boolean;
  chat: CallChatMessage[];
  onClose: () => void;
  room?: MeetRoomController;
  onAdmitAll?: () => void;
  onCamerasLockedChange?: (locked: boolean) => void;
  onDecideAdmission: (userId: string, admit: boolean) => void;
  onMute: (userId: string) => void;
  onRemove: (userId: string) => void;
  onSendChat: (body: string, attachments?: string[]) => Promise<{ id: string }>;
  panel: Exclude<CallPanel, null>;
  participants: MeetRealtimePresence[];
  raisedHandUserIds: string[];
  selfUserId: string | null;
  accountId: string;
  wsId?: string;
  waiting: MeetRealtimeWaitingParticipant[];
}) {
  const t = useTranslations('meet.call');
  const controls = useSyncExternalStore(
    subscribeRoomControls,
    () => readRoomControls(onDecideAdmission),
    () => undefined
  );
  const actions = room ?? controls?.actions;
  const settings = room?.state.settings ?? controls?.settings;
  const title =
    panel === 'chat'
      ? t('chat')
      : t('participants', { count: participants.length });

  return (
    <ResizableCallPanel label={title}>
      <CallPanelHeader
        icon={panel === 'chat' ? MessageSquare : Users}
        title={title}
        closeLabel={t('close_panel')}
        onClose={onClose}
      />

      {panel === 'chat' ? (
        <ConversationPanel
          roomFeedback={roomFeedback}
          mentionRequest={mentionRequest}
          onMentionHandled={onMentionHandled}
          solo={participants.length === 1}
          qaLive={qaLive}
          meetingId={meetingId}
          chat={chat}
          onSendChat={onSendChat}
          selfUserId={selfUserId}
          accountId={accountId}
          wsId={wsId}
        />
      ) : (
        <ParticipantsPanel
          miraActive={miraActive}
          approved={approved}
          onForget={onForget}
          canManage={
            room?.state.canManageParticipants ??
            controls?.canManage ??
            canManage
          }
          isHost={
            room ? room.state.role === 'host' : (controls?.isHost ?? canManage)
          }
          settings={settings}
          onAdmitAll={onAdmitAll ?? actions?.admitAllWaiting}
          onDenyAll={actions?.denyAllWaiting}
          onCamerasLockedChange={onCamerasLockedChange}
          onSettingsChange={actions?.updateSettings}
          onMediaOverride={actions?.setMediaOverride}
          onPromote={
            (room?.state.classViewersAvailable ??
            controls?.classViewersAvailable)
              ? actions?.promoteParticipant
              : undefined
          }
          bulkRemaining={
            (room?.state.bulkAdmission ?? controls?.bulkAdmission)?.remaining
          }
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
