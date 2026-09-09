'use client';
import { useSyncExternalStore } from 'react';
import { createMailLocalPreference } from './mail-local-preference';

const preference = createMailLocalPreference(
  'tuturuuu-mail-keyboard-shortcuts',
  'on',
  ['on', 'off'] as const
);
export function useMailKeyboardPreference() {
  return [
    useSyncExternalStore(
      preference.subscribe,
      preference.getSnapshot,
      () => 'on'
    ) === 'on',
    (enabled: boolean) => preference.set(enabled ? 'on' : 'off'),
  ] as const;
}
