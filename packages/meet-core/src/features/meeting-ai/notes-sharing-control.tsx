'use client';
import { useMutation } from '@tanstack/react-query';
import { updateMeetNotesSharing } from '@tuturuuu/internal-api';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function NotesSharingControl({
  wsId,
  meetingId,
  initialEnabled = false,
  onChange,
  variant = 'card',
}: {
  wsId: string;
  meetingId: string;
  initialEnabled?: boolean;
  onChange?: (enabled: boolean) => void;
  /** `row` drops the boxed surface for use inside an existing settings group. */
  variant?: 'card' | 'row';
}) {
  const t = useTranslations('meet.call');
  const [enabled, setEnabled] = useState(initialEnabled);
  useEffect(() => setEnabled(initialEnabled), [initialEnabled]);
  const mutation = useMutation({
    mutationFn: (shareNotesAfterMeeting: boolean) =>
      updateMeetNotesSharing(wsId, meetingId, { shareNotesAfterMeeting }),
  });
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 text-left',
        variant === 'card' && 'rounded-xl border bg-muted/30 p-4'
      )}
    >
      <div className="space-y-1">
        <Label htmlFor="share-ended-notes">{t('share_ended_notes')}</Label>
        <p
          className={cn(
            'max-w-sm text-muted-foreground',
            variant === 'row' ? 'text-sm' : 'text-xs'
          )}
        >
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
