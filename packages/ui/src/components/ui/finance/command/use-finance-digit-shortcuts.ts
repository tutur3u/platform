'use client';

import type { QuickCommandCenterItem } from '@tuturuuu/ui/quick-command-center';
import { useEffect } from 'react';

/**
 * Quick create: bare 1-9 and 0 run the first ten visible actions, the same
 * contract as the dedicated Finance quick-create dialog.
 */
export function useFinanceDigitShortcuts({
  enabled,
  items,
}: {
  enabled: boolean;
  items: readonly QuickCommandCenterItem[];
}) {
  useEffect(() => {
    if (!enabled) return;

    const handleDigitShortcut = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing ||
        !/^[0-9]$/u.test(event.key)
      ) {
        return;
      }

      const item = items[event.key === '0' ? 9 : Number(event.key) - 1];
      if (!item || item.disabled) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      item.onSelect();
    };

    window.addEventListener('keydown', handleDigitShortcut, { capture: true });
    return () =>
      window.removeEventListener('keydown', handleDigitShortcut, {
        capture: true,
      });
  }, [enabled, items]);
}
