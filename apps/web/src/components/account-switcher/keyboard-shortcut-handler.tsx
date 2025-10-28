'use client';

import { type JSX, useEffect, useState } from 'react';
import { AccountSwitcherModal } from './account-switcher-modal';

export function AccountSwitcherKeyboardShortcut(): JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input fields or editable content
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Cmd/Ctrl + Shift + A (case-insensitive)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return <AccountSwitcherModal open={open} onOpenChange={setOpen} />;
}
