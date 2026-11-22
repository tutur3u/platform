'use client';
import {
  Activity,
  Bell,
  Globe,
  LayoutGrid,
  Lock,
  MessageSquare,
  Mic,
  ScrollText,
  Settings2,
  Sparkles,
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
import { useEffect, useId, useState } from 'react';
import { MiraAudienceSettings } from '../../live-assistant/mira-audience-settings';
import { MIRA_SETTINGS_TAB } from '../../live-assistant/use-mira-audience';
import { useLargeRoomLabels } from '../lib/large-room-labels';
import { RoomPermissionToggles } from './participants-panel';
import { useTranslations } from 'next-intl';
import type { MediaDiagnostics } from '../lib/media-diagnostics';
import type { MeetRoomController } from '../lib/room-controller';
import { AiCosts } from './ai-costs';
import { CallActivitySettings } from './call-activity-settings';
import { useCallSettingsDialog } from './call-settings-link';
import type { RoomToolsMode } from './call-room-tools';
import { ChatSettings } from './chat-settings';
import { ClassroomSettings } from './classroom-settings';
import { CloudflareCosts } from './cloudflare-costs';
import { ConnectionPanel } from './connection-panel';
import { DeviceSettings } from './device-settings';
import { MeetingActionHint } from './meeting-action-hint';
import { MeetSettingsStack } from './meet-settings-card';
import { MeetingPublicSettings } from './meeting-public-settings';
import { NotesAccessSettings } from './notes-access-settings';
import { RecordingSettings } from './recording-settings';
import { RoomMediaHealth } from './room-media-health';
import { ThumbnailModeSetting } from './thumbnail-mode-setting';

export function CallSettings({
  room,
  meetingId,
  wsId,
  telemetry,
  ai,
  canManage,
  sound,
  onSound,
  outputDeviceId,
  onOutput,
  activities,
}: {
  /** Present for people who decide who may open room activities. */
  activities?: {
    mode?: RoomToolsMode;
    onMode: (mode: RoomToolsMode) => void;
    participantNavigation?: boolean;
    onParticipantNavigation: (enabled: boolean) => void;
  };
  room: MeetRoomController;
  meetingId: string;
  /** The meeting workspace, whose owner decides whether Mira is on. */
  wsId?: string;
  telemetry?: MediaDiagnostics;
  ai: ReturnType<typeof useMeetingAi>;
  canManage: boolean;
  sound: boolean;
  onSound: () => void;
  outputDeviceId: string;
  onOutput: (id: string) => void;
}) {
  const t = useTranslations('meet.call');
  const pageT = useTranslations('meet.call.settings_pages');
  const miraT = useTranslations('meet.mira_adults');
  const labels = useLargeRoomLabels();
  const {
    open,
    setOpen,
    tab: activeTab,
    setTab: setActiveTab,
  } = useCallSettingsDialog();
  // A call shell shares this state, so it outlives the dialog: close it with
  // the call, or settings left open would reopen on the next join.
  useEffect(() => () => setOpen(false), [setOpen]);
  const [bandwidth, setBandwidth] = useState(room.getBandwidthMode);
  const bandwidthId = useId();
  const managesMedia = room.state.canManageParticipants ?? canManage;
  const isHost = room.state.role === 'host';
  const accountId = room.state.selfUserId
    ? room.state.participants[room.state.selfUserId]?.accountId
    : undefined;
  // Signed-in participants see who decides whether Mira is on; guests do not.
  const miraWorkspaceId = accountId ? wsId : undefined;
  const navItems: SettingsNavGroup[] = [
    {
      label: t('devices'),
      items: [
        {
          name: 'devices',
          label: t('devices'),
          description: pageT('devices'),
          icon: Mic,
          keywords: [t('notification_sounds')],
        },
        {
          name: 'media',
          label: labels('settings_media'),
          description: pageT('media'),
          icon: Video,
          keywords: [
            t('bandwidth'),
            t('thumbnail_mode'),
            labels('settings_large_room'),
          ],
        },
        {
          name: 'connection',
          label: labels('settings_connection'),
          description: pageT('connection'),
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
                description: pageT('permissions'),
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
        ...(activities
          ? [
              {
                name: 'activities',
                label: t('activities.settings'),
                description: pageT('activities'),
                icon: LayoutGrid,
                keywords: [t('room_tools.visibility')],
              },
            ]
          : []),
        {
          name: 'chat',
          label: labels('settings_chat'),
          description: pageT('chat'),
          icon: MessageSquare,
        },
        ...(isHost
          ? [
              {
                name: 'notes',
                label: pageT('notes_access'),
                description: pageT('notes_access_description'),
                icon: ScrollText,
                keywords: [t('share_notes')],
              },
            ]
          : []),
        ...(miraWorkspaceId
          ? [
              {
                name: MIRA_SETTINGS_TAB,
                label: miraT('settings_tab'),
                description: pageT('mira'),
                icon: Sparkles,
                keywords: [miraT('toggle'), miraT('badge')],
              },
            ]
          : []),
        ...(canManage || room.state.selfUserId
          ? [
              {
                name: 'public',
                label: labels('settings_public'),
                description: pageT('public'),
                icon: Globe,
              },
            ]
          : []),
      ],
    },
  ];
  const data = ai.data;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <ThumbnailModeSetting policy={room.mediaPolicy} />
          </SettingsSection>
        )}
        {activeTab === 'permissions' && managesMedia && (
          <MeetSettingsStack>
            <SettingsSection>
              <RoomPermissionToggles
                settings={room.state.settings}
                onSettingsChange={room.updateSettings}
                isHost={isHost}
              />
            </SettingsSection>
            <ClassroomSettings room={room} />
          </MeetSettingsStack>
        )}
        {activeTab === 'activities' && activities && (
          <CallActivitySettings
            mode={activities.mode}
            onMode={activities.onMode}
            participantNavigation={activities.participantNavigation}
            onParticipantNavigation={activities.onParticipantNavigation}
          />
        )}
        {activeTab === 'connection' && (
          <MeetSettingsStack>
            <ConnectionPanel
              embedded
              telemetry={telemetry}
              read={room.getMediaDiagnostics}
              reconnect={room.reconnectMedia}
            />
            {managesMedia && (
              <RoomMediaHealth
                meetingId={meetingId}
                read={room.readMediaQuality}
              />
            )}
            {canManage && <CloudflareCosts meetingId={meetingId} />}
            {canManage && data?.canManage && <AiCosts data={data} />}
          </MeetSettingsStack>
        )}
        {activeTab === 'chat' && (
          <MeetSettingsStack>
            <ChatSettings room={room} canManage={canManage} />
            <RecordingSettings
              room={room}
              meetingId={meetingId}
              canManage={canManage}
            />
          </MeetSettingsStack>
        )}
        {activeTab === 'notes' && isHost && <NotesAccessSettings room={room} />}
        {activeTab === MIRA_SETTINGS_TAB && miraWorkspaceId && (
          <MiraAudienceSettings wsId={miraWorkspaceId} />
        )}
        {activeTab === 'public' && (
          <MeetSettingsStack>
            {canManage && <MeetingPublicSettings meetingId={meetingId} />}
            {accountId && <MeetMemorySettings userId={accountId} />}
          </MeetSettingsStack>
        )}
      </SettingsDialogShell>
    </Dialog>
  );
}
