import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { MeetRoomController } from '../lib/room-controller';

export function MicrophoneRecovery({
  room,
  disabled = false,
}: {
  room: MeetRoomController;
  disabled?: boolean;
}) {
  const t = useTranslations('meet.call');
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        disabled={disabled || busy || !room.media.audioEnabled}
        onClick={async () => {
          setBusy(true);
          try {
            await room.selectDevice('audio', room.getSelectedDevices().audio);
            room.reconnectMedia();
            toast.success(t('microphone_restarted'));
          } catch {
            toast.error(t('device_change_failed'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <RefreshCw className="size-4" />
        {t('restart_microphone')}
      </Button>
      <p className="text-muted-foreground text-xs">
        {t('restart_microphone_hint')}
      </p>
    </div>
  );
}
