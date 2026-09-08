'use client';
import { useSyncExternalStore } from 'react';
import { createMailLocalPreference } from './mail-local-preference';
import type { MailMessagePreviewMode } from './mail-message-preview-utils';

const preference = createMailLocalPreference<MailMessagePreviewMode>(
  'tuturuuu-mail-message-appearance',
  'dark',
  ['dark', 'original']
);
export const getMailPreviewAppearance = preference.getSnapshot;
export const setMailPreviewAppearance = preference.set;
export function useMailPreviewAppearance() {
  return [
    useSyncExternalStore(
      preference.subscribe,
      preference.getSnapshot,
      () => 'dark' as const
    ),
    preference.set,
  ] as const;
}
