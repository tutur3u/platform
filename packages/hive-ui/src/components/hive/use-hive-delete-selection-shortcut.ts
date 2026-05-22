'use client';

import { useEffect } from 'react';
import type { HiveSelection } from '../../engine/types';

type UseHiveDeleteSelectionShortcutProps = {
  onEraseSelection: (selection: NonNullable<HiveSelection>) => void;
  onRequestDelete: (selection: NonNullable<HiveSelection>) => void;
  selection: HiveSelection;
};

export function useHiveDeleteSelectionShortcut({
  onEraseSelection,
  onRequestDelete,
  selection,
}: UseHiveDeleteSelectionShortcutProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) {
          onEraseSelection(selection);
          return;
        }
        onRequestDelete(selection);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEraseSelection, onRequestDelete, selection]);
}
