'use client';
import { Plus } from '@tuturuuu/icons';
import { createWorkspaceMeeting } from '@tuturuuu/internal-api';
import { Button, type ButtonProps } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { encodeRoomCode } from '../lib/room-code';

/**
 * Starts an instant meeting in the same workspace. The create route checks
 * hosting eligibility, so a refusal only shows the existing failure toast.
 */
export function NewMeetingButton({
  wsId,
  disabled,
  variant = 'outline',
  size = 'sm',
}: {
  wsId: string;
  disabled?: boolean;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  const t = useTranslations('meet');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await createWorkspaceMeeting<{
        meeting: { id: string };
      }>(wsId, {
        name: t('meetings.untitled'),
        time: new Date().toISOString(),
      });
      router.push(`/r/${encodeRoomCode(response.meeting.id)}`);
    } catch {
      toast.error(t('meetings.create_failed'));
      setBusy(false);
    }
  };
  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled || busy}
      onClick={() => void start()}
    >
      <Plus className="size-4" />
      {t('call.new_meeting')}
    </Button>
  );
}
