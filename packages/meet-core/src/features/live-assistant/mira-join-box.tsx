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
 * Keeps the final box state, notice hash, locale and the acceptance revision
 * seen on the join screen for after admission. It never rejects, so
 * remembering can never block a join. Without a hash the choice cannot be
 * evidenced as on, but an untick is still kept: the participant stays off
 * and every later box starts unticked.
 */
export function useRememberMiraJoin() {
  const text = useMiraConsentText();
  const locale = useLocale();
  return useCallback(
    async (meetingId: string, ticked: boolean, seenRevision = 0) => {
      let textHash = '';
      try {
        textHash = await hashMiraConsentText(text);
      } catch {
        // Without a hash the call asks the participant to confirm instead.
      }
      try {
        rememberMiraJoinChoice(meetingId, {
          ticked,
          textHash,
          locale,
          seenRevision,
        });
      } catch {
        // The participant stays off until they choose in the call.
      }
    },
    [text, locale]
  );
}
