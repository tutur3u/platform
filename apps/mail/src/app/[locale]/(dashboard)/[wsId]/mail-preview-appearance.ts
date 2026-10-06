'use client';
import { useSyncExternalStore } from 'react';
import { createMailLocalPreference } from './mail-local-preference';
import type { MailMessagePreviewMode } from './mail-message-preview-utils';

const preference = createMailLocalPreference<MailMessagePreviewMode | 'auto'>(
  'tuturuuu-mail-message-appearance',
  'auto',
  ['auto', 'dark', 'original']
);
export const getMailPreviewAppearance = preference.getSnapshot;
export const setMailPreviewAppearance = preference.set;
export function useMailPreviewAppearance() {
  return [
    useSyncExternalStore(
      preference.subscribe,
      preference.getSnapshot,
      () => 'auto' as const
    ),
    preference.set,
  ] as const;
}

export function resolveMailPreviewAppearance(
  preference: MailMessagePreviewMode | 'auto',
  theme: string | undefined
): MailMessagePreviewMode {
  return preference === 'auto'
    ? theme === 'dark'
      ? 'dark'
      : 'original'
    : preference;
}
