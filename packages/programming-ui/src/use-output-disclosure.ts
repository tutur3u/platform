'use client';

import { useState } from 'react';

const STORAGE_KEY = 'meet:programming-output-open';

export function useOutputDisclosure(collapsible: boolean) {
  const [open, setOpen] = useState(() => {
    if (!collapsible) return true;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  return {
    open,
    reveal: () => setOpen(true),
    toggle: () => {
      const next = !open;
      setOpen(next);
      if (collapsible) {
        try {
          window.localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
          // The disclosure still works when browser storage is unavailable.
        }
      }
    },
  };
}
