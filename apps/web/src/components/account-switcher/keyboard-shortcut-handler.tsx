'use client';

import { useEffect, useState } from 'react';
import { AccountSwitcherModal } from './account-switcher-modal';

export function AccountSwitcherKeyboardShortcut() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + A
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return <AccountSwitcherModal open={open} onOpenChange={setOpen} />;
}
