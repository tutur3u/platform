'use client';

import { useCallback, useState } from 'react';

interface AddModuleRowProps {
  isAdding: boolean;
  onAdd: (name: string) => void;
  onCancel: () => void;
}

export function AddModuleRow({ isAdding, onAdd, onCancel }: AddModuleRowProps) {
  const [name, setName] = useState('');
  const trimmedName = name.trim();
  const inputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  function cancel() {
    setName('');
    onCancel();
  }

  function commit() {
    if (!trimmedName || isAdding) return;
    onAdd(trimmedName);
    setName('');
  }

  return (
    <div className="flex items-center gap-2 border-border border-t px-4 py-2">
      <input
        ref={inputRef}
        className="min-w-0 flex-1 border-primary border-b-2 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        placeholder="Module name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (!name.trim()) cancel();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
      />
      <button
        className="shrink-0 border-2 border-border bg-primary px-3 py-1 font-bold text-primary-foreground text-xs shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
        disabled={!trimmedName || isAdding}
        onClick={commit}
        type="button"
      >
        Add
      </button>
      <button
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={cancel}
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}
