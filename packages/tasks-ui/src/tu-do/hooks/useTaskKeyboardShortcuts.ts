import { useEffect, useRef } from 'react';

interface UseTaskKeyboardShortcutsProps {
  isOpen: boolean;
  canSave: boolean;
  hasUnsavedChanges: boolean;
  onSave: () => void;
  onClose: () => void;
}

/**
 * Hook to manage keyboard shortcuts in task edit dialog
 * Handles Cmd/Ctrl+Enter to save, Escape to close
 */
export function useTaskKeyboardShortcuts({
  isOpen,
  canSave,
  hasUnsavedChanges,
  onSave,
  onClose,
}: UseTaskKeyboardShortcutsProps) {
  const handleSaveRef = useRef(onSave);
  const handleCloseRef = useRef(onClose);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);

  // Keep refs up to date
  useEffect(() => {
    handleSaveRef.current = onSave;
    handleCloseRef.current = onClose;
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [onSave, onClose, hasUnsavedChanges]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Save shortcut: Cmd/Ctrl + Enter
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canSave) {
          handleSaveRef.current();
        } else if (!hasUnsavedChangesRef.current) {
          handleCloseRef.current();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canSave]);

  return {
    handleSaveRef,
    handleCloseRef,
    hasUnsavedChangesRef,
  };
}
