'use client';

import { useEffect, useState } from 'react';

type InspectorNumberFieldProps = {
  disabled?: boolean;
  label: string;
  onCommit: (value: number) => void;
  step?: number;
  value: number;
};

type InspectorColorFieldProps = {
  label: string;
  onCommit: (value: string) => void;
  value: string;
};

export function InspectorNumberField({
  disabled = false,
  label,
  onCommit,
  step = 1,
  value,
}: InspectorNumberFieldProps) {
  const [draft, setDraft] = useState(formatNumber(value));

  useEffect(() => {
    setDraft(formatNumber(value));
  }, [value]);

  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(formatNumber(value));
      return;
    }

    if (next !== value) {
      onCommit(next);
    }
  };

  return (
    <label className="min-w-0">
      <span className="mb-1 block font-medium text-[10px] text-zinc-500 uppercase tracking-wide">
        {label}
      </span>
      <input
        className="h-9 w-full rounded-md border border-border/20 bg-black/25 px-2 text-center text-xs text-zinc-100 tabular-nums outline-none transition focus:border-dynamic-green/60"
        disabled={disabled}
        inputMode="decimal"
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        step={step}
        type="number"
        value={draft}
      />
    </label>
  );
}

export function InspectorColorField({
  label,
  onCommit,
  value,
}: InspectorColorFieldProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (next: string) => {
    setDraft(next);
    onCommit(next);
  };

  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-border/20 bg-black/20 px-3 py-2">
      <span className="min-w-0 text-xs text-zinc-300">{label}</span>
      <span className="flex items-center gap-2">
        <input
          aria-label={label}
          className="h-7 w-7 cursor-pointer rounded border border-border/30 bg-transparent"
          onChange={(event) => commit(event.target.value)}
          type="color"
          value={draft}
        />
        <input
          className="h-7 w-20 rounded border border-border/20 bg-black/25 px-2 text-[11px] text-zinc-200 uppercase tabular-nums outline-none transition focus:border-dynamic-green/60"
          onBlur={(event) => commit(event.target.value)}
          onChange={(event) => setDraft(event.target.value)}
          value={draft}
        />
      </span>
    </label>
  );
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
