'use client';
import {
  Activity,
  Bell,
  Globe,
  Lock,
  MessageSquare,
  Mic,
  Settings2,
  Video,
} from '@tuturuuu/icons';
import { MeetMemorySettings } from '@tuturuuu/meet-core/features/live-assistant/memory-settings';
import type { useMeetingAi } from '@tuturuuu/meet-core/features/meeting-ai/use-meeting-ai';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogTrigger } from '@tuturuuu/ui/dialog';
import {
  SettingsDialogShell,
  type SettingsNavGroup,
} from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { SettingsField } from '../../../../../ui/src/components/ui/custom/settings-field';
import { SettingItemTab } from '../../../../../ui/src/components/ui/custom/settings-item-tab';
import { Switch } from '@tuturuuu/ui/switch';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useId, useState } from 'react';
import { useLargeRoomLabels } from '../lib/large-room-labels';
import { RoomPermissionToggles } from './participants-panel';
import { useTranslations } from 'next-intl';
import type { MediaDiagnostics } from '../lib/media-diagnostics';
import type { MeetRoomController } from '../lib/room-controller';
import { AiCosts } from './ai-costs';
import { ChatSettings } from './chat-settings';
import { ClassroomSettings } from './classroom-settings';
import { CloudflareCosts } from './cloudflare-costs';
import { ConnectionPanel } from './connection-panel';
import { DeviceSettings } from './device-settings';
import { MeetingActionHint } from './meeting-action-hint';
import { MeetingPublicSettings } from './meeting-public-settings';
import { RecordingSettings } from './recording-settings';

export function CallSettings({
  room,
  meetingId,
  telemetry,
  ai,
  canManage,
  sound,
  onSound,
  outputDeviceId,
  onOutput,
}: {
  room: MeetRoomController;
  meetingId: string;
  telemetry?: MediaDiagnostics;
  ai: ReturnType<typeof useMeetingAi>;
  canManage: boolean;
  sound: boolean;
  onSound: () => void;
  outputDeviceId: string;
  onOutput: (id: string) => void;
}) {
  const t = useTranslations('meet.call');
  const labels = useLargeRoomLabels();
  const [activeTab, setActiveTab] = useState('devices');
  const [bandwidth, setBandwidth] = useState(room.getBandwidthMode);
  const bandwidthId = useId();
  const managesMedia = room.state.canManageParticipants ?? canManage;
  const navItems: SettingsNavGroup[] = [
    {
      label: t('devices'),
      items: [
        {
          name: 'devices',
          label: t('devices'),
          icon: Mic,
          keywords: [t('notification_sounds')],
        },
        {
          name: 'media',
          label: labels('settings_media'),
          icon: Video,
          keywords: [t('bandwidth'), labels('settings_large_room')],
        },
        {
          name: 'connection',
          label: labels('settings_connection'),
          icon: Activity,
          keywords: [t('connection_title')],
        },
      ],
    },
    {
      label: t('preferences'),
      items: [
        ...(managesMedia
          ? [
              {
                name: 'permissions',
                label: labels('settings_permissions'),
                icon: Lock,
                keywords: [
                  labels('lock_mics'),
                  labels('lock_cameras'),
                  labels('lock_screens'),
                  labels('skip_lobby'),
                ],
              },
            ]
          : []),
        { name: 'chat', label: labels('settings_chat'), icon: MessageSquare },
        ...(canManage || room.state.selfUserId
          ? [{ name: 'public', label: labels('settings_public'), icon: Globe }]
          : []),
      ],
    },
  ];
  const data = ai.data;
  const accountId = room.state.selfUserId
    ? room.state.participants[room.state.selfUserId]?.accountId
    : undefined;
  return (
    <Dialog>
      <MeetingActionHint label={t('settings_title')}>
        <DialogTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 rounded-full"
            aria-label={t('settings_title')}
          >
            <Settings2 className="size-4" />
          </Button>
        </DialogTrigger>
      </MeetingActionHint>
      <SettingsDialogShell
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        navItems={navItems}
        keyboardNavigation
      >
        {activeTab === 'devices' && (
          <SettingsSection>
            <SettingItemTab title={t('devices')} layout="stacked">
              <DeviceSettings
                room={room}
                outputDeviceId={outputDeviceId}
                onOutput={onOutput}
              />
            </SettingItemTab>
            <SettingsField
              label={t('notification_sounds')}
              icon={<Bell className="size-4" />}
              layout="compact"
            >
              {(field) => (
                <Switch {...field} checked={sound} onCheckedChange={onSound} />
              )}
            </SettingsField>
          </SettingsSection>
        )}
        {activeTab === 'media' && (
          <SettingsSection title={labels('settings_large_room')}>
            <SettingItemTab
              title={<Label htmlFor={bandwidthId}>{t('bandwidth')}</Label>}
              description={labels('settings_large_room_hint')}
              controlWidth="sm"
            >
              <Select
                value={bandwidth}
                onValueChange={(mode) => {
                  if (mode !== 'auto' && mode !== 'saver' && mode !== 'quality')
                    return;
                  setBandwidth(mode);
                  room.setBandwidthMode(mode);
                }}
              >
                <SelectTrigger id={bandwidthId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('bandwidth_auto')}</SelectItem>
                  <SelectItem value="saver">{t('bandwidth_saver')}</SelectItem>
                  <SelectItem value="quality">
                    {t('bandwidth_quality')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingItemTab>
          </SettingsSection>
        )}
        {activeTab === 'permissions' && managesMedia && (
          <>
            <SettingsSection>
              <RoomPermissionToggles
                settings={room.state.settings}
                onSettingsChange={room.updateSettings}
                isHost={room.state.role === 'host'}
              />
            </SettingsSection>
            <ClassroomSettings room={room} />
          </>
        )}
        {activeTab === 'connection' && (
          <SettingsSection surface="plain" className="space-y-4">
            <ConnectionPanel
              embedded
              telemetry={telemetry}
              read={room.getMediaDiagnostics}
              reconnect={room.reconnectMedia}
            />
            {canManage && <CloudflareCosts meetingId={meetingId} />}
            {canManage && data?.canManage && <AiCosts data={data} />}
          </SettingsSection>
        )}
        {activeTab === 'chat' && (
          <SettingsSection surface="plain">
            <ChatSettings room={room} canManage={canManage} />
            <RecordingSettings
              room={room}
              meetingId={meetingId}
              canManage={canManage}
            />
          </SettingsSection>
        )}
        {activeTab === 'public' && (
          <SettingsSection surface="plain">
            {canManage && <MeetingPublicSettings meetingId={meetingId} />}
            {accountId && <MeetMemorySettings userId={accountId} />}
          </SettingsSection>
        )}
      </SettingsDialogShell>
    </Dialog>
  );
}
