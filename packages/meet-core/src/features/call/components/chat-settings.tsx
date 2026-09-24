'use client';
import { MessageSquareText } from '@tuturuuu/icons';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { MeetRoomController } from '../lib/room-controller';

export function ChatSettings({
  room,
  canManage,
}: {
  room: MeetRoomController;
  canManage: boolean;
}) {
  const t = useTranslations('meet.call');
  return (
    <section className="flex items-start justify-between gap-3 rounded-xl border p-4">
      <div className="space-y-1">
        <Label htmlFor="meet-save-chat" className="flex items-center gap-2">
          <MessageSquareText className="size-4" />
          {t('save_chat')}
        </Label>
        <p className="text-muted-foreground text-xs">{t('save_chat_hint')}</p>
      </div>
      <Switch
        id="meet-save-chat"
        checked={room.state.settings.saveChat !== false}
        disabled={!canManage}
        onCheckedChange={(saveChat) => room.updateSettings({ saveChat })}
      />
    </section>
  );
}
