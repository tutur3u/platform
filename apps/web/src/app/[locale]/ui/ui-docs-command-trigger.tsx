'use client';

import { SquareTerminal } from '@tuturuuu/icons';
import { Kbd } from '@tuturuuu/ui/kbd';

/**
 * Standalone entry point for the command palette. Lives outside the shell's
 * React tree (it is rendered inside a page), so it triggers the palette by
 * dispatching the same Cmd/Ctrl+K event the global listener already handles.
 */
export function UiDocsCommandTrigger({ label }: { label: string }) {
  function open() {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
    );
  }

  return (
    <button
      className="group flex w-full items-center gap-2 rounded-xl border bg-card px-4 py-3 text-muted-foreground text-sm transition hover:border-foreground/20 hover:text-foreground sm:max-w-md"
      onClick={open}
      type="button"
    >
      <SquareTerminal className="size-4" />
      <span className="truncate">{label}</span>
      <Kbd className="ml-auto">⌘K</Kbd>
    </button>
  );
}
