'use client';

import { useLocale } from 'next-intl';
import { useCallback, useId } from 'react';
import {
  hashMiraConsentText,
  MiraConsentBox,
  useMiraConsentText,
} from './mira-consent-box';
import { rememberMiraJoinChoice } from './mira-join-choice';

/**
 * The pre-join Mira box. The join screen owns the checked state (seeded from
 * the workspace default, the same on server and client) and calls the
 * returned `remember` when the participant presses Join.
 */
export function MiraJoinBox({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <MiraConsentBox
      id={`mira-join-${id}`}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
    />
  );
}

/**
 * Keeps the final box state, notice hash and locale for after admission. It
 * never rejects, so remembering can never block a join.
 */
export function useRememberMiraJoin() {
  const text = useMiraConsentText();
  const locale = useLocale();
  return useCallback(
    async (meetingId: string, ticked: boolean) => {
      try {
        // Without a hash the choice cannot be evidenced; the participant
        // then chooses in the call instead.
        const textHash = await hashMiraConsentText(text);
        rememberMiraJoinChoice(meetingId, { ticked, textHash, locale });
      } catch {
        // The participant stays off until they choose in the call.
      }
    },
    [text, locale]
  );
}
