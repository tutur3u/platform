'use client';

import { JigsawCheck } from '@tuturuuu/human-check/react';
import {
  createMeetGuestHumanCheck,
  verifyMeetGuestHumanCheck,
} from '@tuturuuu/internal-api/meet-guest-human-check';
import { useTranslations } from 'next-intl';

/** The Tuturuuu jigsaw check, offered when Cloudflare Turnstile cannot run. */
export function GuestHumanCheck({
  meetingId,
  onPass,
}: {
  meetingId: string;
  onPass: (passToken: string) => void;
}) {
  const t = useTranslations('meet.call.guest_join');
  return (
    <JigsawCheck
      load={() => createMeetGuestHumanCheck(meetingId)}
      verify={async (input) => {
        const result = await verifyMeetGuestHumanCheck(meetingId, input);
        return result.ok
          ? { ok: true, passToken: result.passToken }
          : { ok: false, retry: result.retry };
      }}
      onPass={onPass}
      labels={{
        start: t('puzzle_start'),
        title: t('puzzle_title'),
        instructions: t('puzzle_instructions'),
        slider: t('puzzle_slider'),
        position: (percent) => t('puzzle_position', { percent }),
        loading: t('puzzle_loading'),
        verifying: t('puzzle_verifying'),
        passed: t('puzzle_passed'),
        tryAgain: t('puzzle_try_again'),
        newPuzzle: t('puzzle_new'),
        failed: t('puzzle_failed'),
      }}
    />
  );
}
