'use client';

import {
  isEditableShortcutTarget,
  isShortcutEventIgnored,
} from '@tuturuuu/utils/keyboard-shortcuts';
import dynamic from 'next/dynamic';
import { type JSX, useEffect, useState } from 'react';

const AccountSwitcherModal = dynamic(
  () =>
    import('./account-switcher-modal').then(
      (module) => module.AccountSwitcherModal
    ),
  { ssr: false }
);

export function AccountSwitcherKeyboardShortcut(): JSX.Element | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        isShortcutEventIgnored(e) ||
        isEditableShortcutTarget(e.target) ||
        e.altKey
      )
        return;

      // Cmd/Ctrl + Shift + A (case-insensitive)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === 'a'
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!open) {
    return null;
  }

  return <AccountSwitcherModal open={open} onOpenChange={setOpen} />;
}
