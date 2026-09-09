'use client';
import { Activity, Bell, Mic, Settings2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type { useMeetingAi } from '@/features/meeting-ai/use-meeting-ai';
import type { MediaDiagnostics } from '../lib/media-diagnostics';
import type { MeetRoomController } from '../lib/room-controller';
import { AiCosts } from './ai-costs';
import { ChatSettings } from './chat-settings';
import { CloudflareCosts } from './cloudflare-costs';
import { ConnectionPanel } from './connection-panel';
import { DeviceSettings } from './device-settings';
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
  const data = ai.data;
  return (
    <Dialog>
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
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('settings_title')}</DialogTitle>
          <DialogDescription>{t('settings_hint')}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="devices">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger
              value="devices"
              className="min-w-0 gap-1.5 px-2 text-xs sm:text-sm"
            >
              <Mic className="hidden size-4 sm:block" />
              {t('devices')}
            </TabsTrigger>
            <TabsTrigger
              value="connection"
              className="min-w-0 gap-1.5 px-2 text-xs sm:text-sm"
            >
              <Activity className="hidden size-4 sm:block" />
              {t('connection_title')}
            </TabsTrigger>
            <TabsTrigger
              value="preferences"
              className="min-w-0 gap-1.5 px-2 text-xs sm:text-sm"
            >
              <Settings2 className="hidden size-4 sm:block" />
              {t('preferences')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="devices" className="pt-4">
            <DeviceSettings
              room={room}
              outputDeviceId={outputDeviceId}
              onOutput={onOutput}
            />
          </TabsContent>
          <TabsContent value="connection" className="space-y-4 pt-4">
            <ConnectionPanel
              embedded
              telemetry={telemetry}
              read={room.getMediaDiagnostics}
              reconnect={room.reconnectMedia}
            />
          </TabsContent>
          <TabsContent value="preferences" className="space-y-5 pt-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
              <Label
                htmlFor="meet-notification-sound"
                className="flex items-center gap-2"
              >
                <Bell className="size-4" />
                {t('notification_sounds')}
              </Label>
              <Switch
                id="meet-notification-sound"
                checked={sound}
                onCheckedChange={onSound}
              />
            </div>
            <ChatSettings room={room} canManage={canManage} />
            <RecordingSettings
              room={room}
              meetingId={meetingId}
              canManage={canManage}
            />
            {canManage && <CloudflareCosts meetingId={meetingId} />}
            {canManage && data?.canManage && <AiCosts data={data} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
