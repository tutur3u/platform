'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { setMeetCaptureMode } from './self-api';
import type { SelfRoomView } from './self-room';
import { transcriptConsentKey } from './use-transcript-consent';

/**
 * Host and co-host choice between room capture and each person's device.
 * It exists only where the server offers per-speaker capture and is locked
 * while a transcript session is running.
 */
export function CaptureModePicker({
  wsId,
  meetingId,
  room,
}: {
  wsId: string;
  meetingId: string;
  room: SelfRoomView;
}) {
  const t = useTranslations('meet.ai');
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (mode: 'room' | 'self') =>
      setMeetCaptureMode(wsId, meetingId, mode),
    onError: () => toast.error(t('self_mode_failed')),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: transcriptConsentKey(meetingId),
      }),
  });
  if (!room.available || !room.canManageMode) return null;
  const locked = room.session !== null;
  return (
    <fieldset className="space-y-2" disabled={locked || change.isPending}>
      <legend className="font-medium text-sm">{t('self_mode_title')}</legend>
      <RadioGroup
        value={room.mode}
        onValueChange={(value) => change.mutate(value as 'room' | 'self')}
        disabled={locked || change.isPending}
        className="gap-2"
      >
        {(['room', 'self'] as const).map((mode) => (
          <div key={mode} className="flex items-center gap-2">
            <RadioGroupItem value={mode} id={`capture-mode-${mode}`} />
            <Label htmlFor={`capture-mode-${mode}`} className="text-sm">
              {t(mode === 'room' ? 'self_mode_room' : 'self_mode_self')}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {locked && (
        <p className="text-muted-foreground text-xs">{t('self_mode_locked')}</p>
      )}
    </fieldset>
  );
}
