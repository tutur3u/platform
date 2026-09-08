'use client';
import { useMutation } from '@tanstack/react-query';
import { updateMeetNotesSharing } from '@tuturuuu/internal-api';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function NotesSharingControl({
  wsId,
  meetingId,
  initialEnabled = false,
  onChange,
}: {
  wsId: string;
  meetingId: string;
  initialEnabled?: boolean;
  onChange?: (enabled: boolean) => void;
}) {
  const t = useTranslations('meet.call');
  const [enabled, setEnabled] = useState(initialEnabled);
  const mutation = useMutation({
    mutationFn: (shareNotesAfterMeeting: boolean) =>
      updateMeetNotesSharing(wsId, meetingId, { shareNotesAfterMeeting }),
  });
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border bg-muted/30 p-4 text-left">
      <div className="space-y-1">
        <Label htmlFor="share-ended-notes">{t('share_ended_notes')}</Label>
        <p className="max-w-sm text-muted-foreground text-xs">
          {t('share_ended_notes_hint')}
        </p>
      </div>
      <Switch
        id="share-ended-notes"
        checked={enabled}
        disabled={mutation.isPending}
        onCheckedChange={(next) => {
          void mutation
            .mutateAsync(next)
            .then(() => {
              setEnabled(next);
              onChange?.(next);
            })
            .catch(() => toast.error(t('notes_sharing_failed')));
        }}
      />
    </div>
  );
}
