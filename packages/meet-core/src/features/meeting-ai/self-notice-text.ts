'use client';

import { useTranslations } from 'next-intl';

/** The per-speaker notice keys, in the order the notice shows them. */
export const SELF_NOTICE_KEYS = [
  'self_body',
  'self_notice',
  'self_readers',
] as const;

/** The exact per-speaker notice text a participant sees, hashed into Allow. */
export function useSelfNoticeText() {
  const t = useTranslations('meet.ai');
  return SELF_NOTICE_KEYS.map((key) => t(key)).join('\n');
}
